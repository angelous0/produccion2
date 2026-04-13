"""
Router: Transferencias Internas entre Lineas de Negocio
- Crear borrador, confirmar (atomico), cancelar
- Consumo FIFO origen -> creacion de ingresos destino (1:1 por capa)
- Registro en prod_inventario_salidas con tipo TRANSFERENCIA
- Trazabilidad completa via prod_transferencias_linea_detalle
"""
import json
import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict
from routes.auditoria import audit_log, get_usuario

router = APIRouter(prefix="/api", tags=["transferencias-linea"])


# ==================== MODELOS PYDANTIC ====================

class TransferenciaCreate(BaseModel):
    item_id: str
    linea_origen_id: int
    linea_destino_id: int
    cantidad: float
    motivo: str = ""
    observaciones: str = ""
    referencia_externa: Optional[str] = None


class TransferenciaCancel(BaseModel):
    motivo_cancelacion: str = ""


# ==================== HELPERS ====================

def safe_float(v):
    try:
        return float(v or 0)
    except (ValueError, TypeError):
        return 0.0


async def _generar_codigo(conn):
    """Genera codigo correlativo TRF-YYYYMMDD-NNN"""
    hoy = datetime.now(timezone.utc).strftime('%Y%m%d')
    prefijo = f"TRF-{hoy}-"
    row = await conn.fetchrow("""
        SELECT codigo FROM produccion.prod_transferencias_linea
        WHERE codigo LIKE $1 || '%'
        ORDER BY codigo DESC LIMIT 1
    """, prefijo)
    if row and row['codigo']:
        try:
            ultimo = int(row['codigo'].split('-')[-1])
            return f"{prefijo}{str(ultimo + 1).zfill(3)}"
        except (ValueError, IndexError):
            pass
    return f"{prefijo}001"


async def _calcular_stock_disponible_por_linea(conn, item_id: str, linea_negocio_id: int):
    """Calcula stock REAL disponible por linea desde capas FIFO, descontando reservas activas.
    Las reservas se filtran por la linea_negocio_id del registro (OP) que las genero."""
    stock_fifo = await conn.fetchval("""
        SELECT COALESCE(SUM(cantidad_disponible), 0)
        FROM produccion.prod_inventario_ingresos
        WHERE item_id = $1 AND linea_negocio_id = $2 AND cantidad_disponible > 0
    """, item_id, linea_negocio_id)

    reservado = await conn.fetchval("""
        SELECT COALESCE(SUM(rl.cantidad_reservada - rl.cantidad_liberada), 0)
        FROM produccion.prod_inventario_reservas_linea rl
        JOIN produccion.prod_inventario_reservas r ON rl.reserva_id = r.id
        JOIN produccion.prod_registros reg ON r.registro_id = reg.id
        WHERE rl.item_id = $1
          AND r.estado = 'ACTIVA'
          AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
          AND reg.linea_negocio_id = $2
    """, item_id, linea_negocio_id)

    return max(0, safe_float(stock_fifo) - safe_float(reservado))


async def _estimar_capas_fifo(conn, item_id: str, linea_negocio_id: int, cantidad: float):
    """Estima las capas FIFO que se consumirian para una cantidad dada."""
    ingresos = await conn.fetch("""
        SELECT id, cantidad_disponible, costo_unitario, fecha, proveedor, numero_documento
        FROM produccion.prod_inventario_ingresos
        WHERE item_id = $1 AND linea_negocio_id = $2 AND cantidad_disponible > 0
        ORDER BY fecha ASC
    """, item_id, linea_negocio_id)

    capas = []
    restante = cantidad
    for ing in ingresos:
        if restante <= 0:
            break
        disponible = safe_float(ing['cantidad_disponible'])
        consumir = min(disponible, restante)
        capas.append({
            "ingreso_id": ing['id'],
            "cantidad_disponible": disponible,
            "cantidad_a_consumir": consumir,
            "costo_unitario": safe_float(ing['costo_unitario']),
            "costo_parcial": round(consumir * safe_float(ing['costo_unitario']), 4),
            "fecha_ingreso": str(ing['fecha']) if ing['fecha'] else None,
            "proveedor": ing['proveedor'] or "",
            "numero_documento": ing['numero_documento'] or "",
        })
        restante -= consumir

    costo_total = sum(c['costo_parcial'] for c in capas)
    cantidad_cubierta = cantidad - max(0, restante)

    return {
        "capas": capas,
        "cantidad_solicitada": cantidad,
        "cantidad_cubierta": cantidad_cubierta,
        "costo_total_estimado": round(costo_total, 4),
        "stock_suficiente": restante <= 0,
    }


# ==================== MIGRACION ====================

async def init_transferencias_tables():
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Tabla maestra
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS produccion.prod_transferencias_linea (
                id VARCHAR PRIMARY KEY,
                codigo VARCHAR UNIQUE,
                item_id VARCHAR NOT NULL,
                linea_origen_id INT NOT NULL,
                linea_destino_id INT NOT NULL,
                cantidad NUMERIC NOT NULL,
                estado VARCHAR DEFAULT 'BORRADOR',
                costo_total_transferido NUMERIC DEFAULT 0,
                motivo TEXT,
                observaciones TEXT,
                referencia_externa VARCHAR,
                creado_por VARCHAR,
                confirmado_por VARCHAR,
                cancelado_por VARCHAR,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_confirmacion TIMESTAMP,
                cancelado_at TIMESTAMP,
                motivo_cancelacion TEXT,
                empresa_id INT DEFAULT 7
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_transf_linea_item
            ON produccion.prod_transferencias_linea(item_id)
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_transf_linea_estado
            ON produccion.prod_transferencias_linea(estado)
        """)

        # Tabla detalle (trazabilidad capa a capa)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS produccion.prod_transferencias_linea_detalle (
                id VARCHAR PRIMARY KEY,
                transferencia_id VARCHAR NOT NULL,
                ingreso_origen_id VARCHAR NOT NULL,
                ingreso_destino_id VARCHAR,
                cantidad NUMERIC NOT NULL,
                costo_unitario NUMERIC NOT NULL
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_transf_detalle_transf
            ON produccion.prod_transferencias_linea_detalle(transferencia_id)
        """)

        # Agregar columnas a prod_inventario_salidas para tipo TRANSFERENCIA
        for alter_sql in [
            "ALTER TABLE produccion.prod_inventario_salidas ADD COLUMN IF NOT EXISTS tipo VARCHAR DEFAULT 'CONSUMO'",
            "ALTER TABLE produccion.prod_inventario_salidas ADD COLUMN IF NOT EXISTS transferencia_id VARCHAR",
        ]:
            await conn.execute(alter_sql)


# ==================== ENDPOINTS ====================

@router.get("/transferencias-linea/items-con-stock")
async def items_con_stock_en_linea(
    linea_negocio_id: int = Query(...),
    user=Depends(get_current_user),
):
    """Retorna items que tienen stock disponible en una linea de negocio especifica."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT DISTINCT i.id, i.codigo, i.nombre, i.categoria, i.unidad_medida,
                   i.control_por_rollos,
                   COALESCE(SUM(ing.cantidad_disponible), 0) as stock_en_linea
            FROM produccion.prod_inventario i
            JOIN produccion.prod_inventario_ingresos ing
                ON ing.item_id = i.id AND ing.linea_negocio_id = $1 AND ing.cantidad_disponible > 0
            GROUP BY i.id, i.codigo, i.nombre, i.categoria, i.unidad_medida, i.control_por_rollos
            HAVING SUM(ing.cantidad_disponible) > 0
            ORDER BY i.nombre
        """, linea_negocio_id)

        result = []
        for r in rows:
            linea_id = linea_negocio_id
            stock_bruto = safe_float(r['stock_en_linea'])
            reservado_row = await conn.fetchval("""
                SELECT COALESCE(SUM(rl.cantidad_reservada - rl.cantidad_liberada), 0)
                FROM produccion.prod_inventario_reservas_linea rl
                JOIN produccion.prod_inventario_reservas res ON rl.reserva_id = res.id
                JOIN produccion.prod_registros reg ON res.registro_id = reg.id
                WHERE rl.item_id = $1
                  AND res.estado = 'ACTIVA'
                  AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
                  AND reg.linea_negocio_id = $2
            """, r['id'], linea_id)
            reservado = safe_float(reservado_row)
            disponible = max(0, stock_bruto - reservado)
            if disponible > 0:
                result.append({
                    "id": r['id'],
                    "codigo": r['codigo'],
                    "nombre": r['nombre'],
                    "categoria": r['categoria'],
                    "unidad_medida": r['unidad_medida'],
                    "control_por_rollos": r['control_por_rollos'],
                    "stock_en_linea": stock_bruto,
                    "reservado": reservado,
                    "stock_disponible": disponible,
                })
        return result


@router.get("/transferencias-linea/estimar-costo")
async def estimar_costo_transferencia(
    item_id: str = Query(...),
    linea_origen_id: int = Query(...),
    cantidad: float = Query(...),
    user=Depends(get_current_user),
):
    """Estima las capas FIFO que se consumirian y el costo total."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow("SELECT id, nombre, codigo FROM produccion.prod_inventario WHERE id = $1", item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")

        stock_disponible = await _calcular_stock_disponible_por_linea(conn, item_id, linea_origen_id)

        estimacion = await _estimar_capas_fifo(conn, item_id, linea_origen_id, cantidad)
        estimacion["stock_disponible_linea"] = stock_disponible
        estimacion["item_nombre"] = item['nombre']
        estimacion["item_codigo"] = item['codigo']

        return estimacion


@router.get("/transferencias-linea")
async def listar_transferencias(
    estado: str = "",
    item_id: str = "",
    linea_origen_id: str = "",
    linea_destino_id: str = "",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_current_user),
):
    """Lista transferencias con filtros."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = []
        params = []
        idx = 1

        if estado:
            conditions.append(f"t.estado = ${idx}")
            params.append(estado)
            idx += 1
        if item_id:
            conditions.append(f"t.item_id = ${idx}")
            params.append(item_id)
            idx += 1
        if linea_origen_id:
            conditions.append(f"t.linea_origen_id = ${idx}")
            params.append(int(linea_origen_id))
            idx += 1
        if linea_destino_id:
            conditions.append(f"t.linea_destino_id = ${idx}")
            params.append(int(linea_destino_id))
            idx += 1
        if fecha_desde:
            conditions.append(f"t.fecha_creacion >= ${idx}")
            params.append(datetime.strptime(fecha_desde, '%Y-%m-%d'))
            idx += 1
        if fecha_hasta:
            conditions.append(f"t.fecha_creacion < ${idx}")
            params.append(datetime.strptime(fecha_hasta, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            idx += 1

        where = " AND ".join(conditions) if conditions else "TRUE"

        count_row = await conn.fetchrow(f"""
            SELECT COUNT(*) as total
            FROM produccion.prod_transferencias_linea t
            WHERE {where}
        """, *params)
        total = count_row['total']

        rows = await conn.fetch(f"""
            SELECT t.*,
                i.nombre as item_nombre, i.codigo as item_codigo, i.unidad_medida,
                lo.nombre as linea_origen_nombre, lo.codigo as linea_origen_codigo,
                ld.nombre as linea_destino_nombre, ld.codigo as linea_destino_codigo
            FROM produccion.prod_transferencias_linea t
            LEFT JOIN produccion.prod_inventario i ON t.item_id = i.id
            LEFT JOIN finanzas2.cont_linea_negocio lo ON t.linea_origen_id = lo.id
            LEFT JOIN finanzas2.cont_linea_negocio ld ON t.linea_destino_id = ld.id
            WHERE {where}
            ORDER BY t.fecha_creacion DESC
            LIMIT ${idx} OFFSET ${idx + 1}
        """, *params, limit, offset)

        result = []
        for r in rows:
            d = dict(r)
            # Convertir timestamps a string
            for key in ('fecha_creacion', 'fecha_confirmacion', 'cancelado_at'):
                if d.get(key):
                    d[key] = d[key].isoformat()
            # Convertir Decimals a float
            for key in ('cantidad', 'costo_total_transferido'):
                d[key] = safe_float(d.get(key))
            result.append(d)

        return {"items": result, "total": total, "limit": limit, "offset": offset}


@router.get("/transferencias-linea/{transferencia_id}")
async def detalle_transferencia(
    transferencia_id: str,
    user=Depends(get_current_user),
):
    """Detalle completo de una transferencia con sus capas FIFO."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT t.*,
                i.nombre as item_nombre, i.codigo as item_codigo, i.unidad_medida,
                lo.nombre as linea_origen_nombre, lo.codigo as linea_origen_codigo,
                ld.nombre as linea_destino_nombre, ld.codigo as linea_destino_codigo
            FROM produccion.prod_transferencias_linea t
            LEFT JOIN produccion.prod_inventario i ON t.item_id = i.id
            LEFT JOIN finanzas2.cont_linea_negocio lo ON t.linea_origen_id = lo.id
            LEFT JOIN finanzas2.cont_linea_negocio ld ON t.linea_destino_id = ld.id
            WHERE t.id = $1
        """, transferencia_id)

        if not row:
            raise HTTPException(status_code=404, detail="Transferencia no encontrada")

        d = dict(row)
        for key in ('fecha_creacion', 'fecha_confirmacion', 'cancelado_at'):
            if d.get(key):
                d[key] = d[key].isoformat()
        for key in ('cantidad', 'costo_total_transferido'):
            d[key] = safe_float(d.get(key))

        # Obtener detalle de capas FIFO
        detalles = await conn.fetch("""
            SELECT td.*,
                io.fecha as fecha_ingreso_origen, io.proveedor as proveedor_origen,
                io.numero_documento as doc_origen
            FROM produccion.prod_transferencias_linea_detalle td
            LEFT JOIN produccion.prod_inventario_ingresos io ON td.ingreso_origen_id = io.id
            WHERE td.transferencia_id = $1
            ORDER BY io.fecha ASC
        """, transferencia_id)

        d['detalles'] = []
        for det in detalles:
            dd = dict(det)
            dd['cantidad'] = safe_float(dd.get('cantidad'))
            dd['costo_unitario'] = safe_float(dd.get('costo_unitario'))
            dd['costo_parcial'] = round(dd['cantidad'] * dd['costo_unitario'], 4)
            if dd.get('fecha_ingreso_origen'):
                dd['fecha_ingreso_origen'] = dd['fecha_ingreso_origen'].isoformat()
            d['detalles'].append(dd)

        return d


@router.post("/transferencias-linea")
async def crear_transferencia(
    input: TransferenciaCreate,
    user=Depends(get_current_user),
):
    """Crea un borrador de transferencia."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Validaciones
        if input.linea_origen_id == input.linea_destino_id:
            raise HTTPException(status_code=400, detail="La linea origen y destino no pueden ser la misma")

        item = await conn.fetchrow("SELECT id, nombre, codigo FROM produccion.prod_inventario WHERE id = $1", input.item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")

        lo = await conn.fetchrow("SELECT id, nombre FROM finanzas2.cont_linea_negocio WHERE id = $1", input.linea_origen_id)
        if not lo:
            raise HTTPException(status_code=404, detail="Linea de negocio origen no encontrada")

        ld = await conn.fetchrow("SELECT id, nombre FROM finanzas2.cont_linea_negocio WHERE id = $1", input.linea_destino_id)
        if not ld:
            raise HTTPException(status_code=404, detail="Linea de negocio destino no encontrada")

        if input.cantidad <= 0:
            raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

        # Validar stock disponible por linea (FIFO real - reservas)
        stock_disponible = await _calcular_stock_disponible_por_linea(conn, input.item_id, input.linea_origen_id)
        if input.cantidad > stock_disponible:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente en linea '{lo['nombre']}'. Disponible: {stock_disponible}, Solicitado: {input.cantidad}"
            )

        # Generar codigo y crear borrador
        codigo = await _generar_codigo(conn)
        transferencia_id = str(uuid.uuid4())
        ahora = datetime.now(timezone.utc).replace(tzinfo=None)

        await conn.execute("""
            INSERT INTO produccion.prod_transferencias_linea
            (id, codigo, item_id, linea_origen_id, linea_destino_id, cantidad, estado,
             motivo, observaciones, referencia_externa, creado_por, fecha_creacion, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6, 'BORRADOR', $7, $8, $9, $10, $11, 7)
        """, transferencia_id, codigo, input.item_id, input.linea_origen_id,
            input.linea_destino_id, input.cantidad, input.motivo,
            input.observaciones, input.referencia_externa,
            user.get('nombre_completo', user.get('username', 'sistema')), ahora)

        # Estimar costo para respuesta
        estimacion = await _estimar_capas_fifo(conn, input.item_id, input.linea_origen_id, input.cantidad)

        return {
            "id": transferencia_id,
            "codigo": codigo,
            "estado": "BORRADOR",
            "cantidad": input.cantidad,
            "stock_disponible_linea": stock_disponible,
            "estimacion_costo": estimacion,
            "message": f"Borrador de transferencia {codigo} creado exitosamente"
        }


@router.post("/transferencias-linea/{transferencia_id}/confirmar")
async def confirmar_transferencia(
    transferencia_id: str,
    user=Depends(get_current_user),
):
    """
    Confirma una transferencia ejecutando el flujo atomico:
    1. Recalcular stock disponible (evitar race conditions)
    2. Consumir capas FIFO de origen
    3. Crear salida en prod_inventario_salidas con tipo=TRANSFERENCIA
    4. Crear N ingresos en destino (uno por capa FIFO consumida)
    5. Registrar detalle de trazabilidad
    6. Actualizar estado a CONFIRMADO
    stock_actual se mantiene igual (sale e ingresa la misma cantidad)
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Obtener transferencia
        transf = await conn.fetchrow("""
            SELECT * FROM produccion.prod_transferencias_linea WHERE id = $1
        """, transferencia_id)
        if not transf:
            raise HTTPException(status_code=404, detail="Transferencia no encontrada")
        if transf['estado'] != 'BORRADOR':
            raise HTTPException(status_code=400, detail=f"Solo se puede confirmar un borrador. Estado actual: {transf['estado']}")

        item_id = transf['item_id']
        linea_origen_id = transf['linea_origen_id']
        linea_destino_id = transf['linea_destino_id']
        cantidad = safe_float(transf['cantidad'])

        # Validar item
        item = await conn.fetchrow("SELECT id, nombre FROM produccion.prod_inventario WHERE id = $1", item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")

        # TRANSACCION ATOMICA
        async with conn.transaction():
            # 1. Recalcular stock disponible real (dentro de la tx para evitar race conditions)
            stock_disponible = await _calcular_stock_disponible_por_linea(conn, item_id, linea_origen_id)
            if cantidad > stock_disponible:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stock insuficiente al momento de confirmar. Disponible: {stock_disponible}, Solicitado: {cantidad}"
                )

            # 2. Consumir capas FIFO de origen
            ingresos_origen = await conn.fetch("""
                SELECT id, cantidad_disponible, costo_unitario, fecha, proveedor, numero_documento
                FROM produccion.prod_inventario_ingresos
                WHERE item_id = $1 AND linea_negocio_id = $2 AND cantidad_disponible > 0
                ORDER BY fecha ASC
                FOR UPDATE
            """, item_id, linea_origen_id)

            detalle_fifo_salida = []
            detalles_trazabilidad = []
            costo_total = 0.0
            restante = cantidad
            ahora = datetime.now(timezone.utc).replace(tzinfo=None)

            for ing in ingresos_origen:
                if restante <= 0:
                    break
                disponible = safe_float(ing['cantidad_disponible'])
                consumir = min(disponible, restante)
                costo_unitario = safe_float(ing['costo_unitario'])
                costo_parcial = consumir * costo_unitario
                costo_total += costo_parcial

                # Reducir cantidad_disponible del ingreso origen
                await conn.execute("""
                    UPDATE produccion.prod_inventario_ingresos
                    SET cantidad_disponible = cantidad_disponible - $1
                    WHERE id = $2
                """, consumir, ing['id'])

                # 4. Crear nuevo ingreso en linea destino (opcion b: 1 ingreso por capa)
                nuevo_ingreso_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO produccion.prod_inventario_ingresos
                    (id, item_id, cantidad, cantidad_disponible, costo_unitario, proveedor,
                     numero_documento, observaciones, fecha, empresa_id, linea_negocio_id,
                     fin_origen_tipo, fin_origen_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 7, $10, 'TRANSFERENCIA', $11)
                """, nuevo_ingreso_id, item_id, consumir, consumir, costo_unitario,
                    ing['proveedor'] or '', ing['numero_documento'] or '',
                    f"Transferencia {transf['codigo']} desde linea {linea_origen_id}",
                    ahora, linea_destino_id, transferencia_id)

                detalle_fifo_salida.append({
                    "ingreso_id": ing['id'],
                    "cantidad": consumir,
                    "costo_unitario": costo_unitario,
                })

                # 5. Registrar detalle de trazabilidad
                detalle_id = str(uuid.uuid4())
                detalles_trazabilidad.append(detalle_id)
                await conn.execute("""
                    INSERT INTO produccion.prod_transferencias_linea_detalle
                    (id, transferencia_id, ingreso_origen_id, ingreso_destino_id, cantidad, costo_unitario)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, detalle_id, transferencia_id, ing['id'], nuevo_ingreso_id, consumir, costo_unitario)

                restante -= consumir

            # 3. Crear salida en prod_inventario_salidas con tipo TRANSFERENCIA
            salida_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO produccion.prod_inventario_salidas
                (id, item_id, cantidad, registro_id, observaciones, costo_total,
                 detalle_fifo, fecha, empresa_id, linea_negocio_id, tipo, transferencia_id)
                VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 7, $8, 'TRANSFERENCIA', $9)
            """, salida_id, item_id, cantidad,
                f"Transferencia {transf['codigo']} hacia linea {linea_destino_id}",
                costo_total, json.dumps(detalle_fifo_salida), ahora,
                linea_origen_id, transferencia_id)

            # stock_actual: la salida resta y los ingresos suman → neto 0
            # Hacemos ambas operaciones para consistencia con el flujo existente
            await conn.execute("""
                UPDATE produccion.prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2
            """, cantidad, item_id)
            await conn.execute("""
                UPDATE produccion.prod_inventario SET stock_actual = stock_actual + $1 WHERE id = $2
            """, cantidad, item_id)

            # 6. Actualizar transferencia a CONFIRMADO
            await conn.execute("""
                UPDATE produccion.prod_transferencias_linea
                SET estado = 'CONFIRMADO',
                    costo_total_transferido = $1,
                    confirmado_por = $2,
                    fecha_confirmacion = $3
                WHERE id = $4
            """, costo_total, user.get('nombre', 'sistema'), ahora, transferencia_id)

            # Actualizar costo promedio del item
            await conn.execute("""
                UPDATE produccion.prod_inventario SET costo_promedio = COALESCE((
                    SELECT SUM(cantidad_disponible * costo_unitario) / NULLIF(SUM(cantidad_disponible), 0)
                    FROM produccion.prod_inventario_ingresos WHERE item_id = $1 AND cantidad_disponible > 0
                ), 0) WHERE id = $1
            """, item_id)

            # Auditoria (dentro de transaccion - atomico)
            await audit_log(conn, get_usuario(user), "CONFIRM", "inventario", "prod_transferencias_linea", transferencia_id,
                datos_antes={"estado": "BORRADOR", "cantidad": cantidad},
                datos_despues={"estado": "CONFIRMADO", "costo_total": round(costo_total, 4), "capas_consumidas": len(detalle_fifo_salida)},
                linea_negocio_id=linea_origen_id, referencia=transf['codigo'])

        return {
            "id": transferencia_id,
            "codigo": transf['codigo'],
            "estado": "CONFIRMADO",
            "costo_total_transferido": round(costo_total, 4),
            "capas_consumidas": len(detalle_fifo_salida),
            "salida_id": salida_id,
            "message": f"Transferencia {transf['codigo']} confirmada exitosamente"
        }


@router.post("/transferencias-linea/{transferencia_id}/cancelar")
async def cancelar_transferencia(
    transferencia_id: str,
    input: TransferenciaCancel,
    user=Depends(get_current_user),
):
    """Cancela un borrador de transferencia."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        transf = await conn.fetchrow("""
            SELECT * FROM produccion.prod_transferencias_linea WHERE id = $1
        """, transferencia_id)
        if not transf:
            raise HTTPException(status_code=404, detail="Transferencia no encontrada")
        if transf['estado'] != 'BORRADOR':
            raise HTTPException(status_code=400, detail=f"Solo se puede cancelar un borrador. Estado actual: {transf['estado']}")

        ahora = datetime.now(timezone.utc).replace(tzinfo=None)
        await conn.execute("""
            UPDATE produccion.prod_transferencias_linea
            SET estado = 'CANCELADO',
                cancelado_por = $1,
                cancelado_at = $2,
                motivo_cancelacion = $3
            WHERE id = $4
        """, user.get('nombre', 'sistema'), ahora, input.motivo_cancelacion, transferencia_id)

        # Auditoria (best-effort - no transaccion explicita)
        from routes.auditoria import audit_log_safe
        await audit_log_safe(conn, get_usuario(user), "CANCEL", "inventario", "prod_transferencias_linea", transferencia_id,
            datos_antes={"estado": "BORRADOR", "cantidad": float(transf['cantidad'] or 0)},
            datos_despues={"estado": "CANCELADO", "motivo_cancelacion": input.motivo_cancelacion},
            referencia=transf['codigo'])

        return {
            "id": transferencia_id,
            "codigo": transf['codigo'],
            "estado": "CANCELADO",
            "message": f"Transferencia {transf['codigo']} cancelada"
        }


@router.get("/transferencias-linea/stock-por-linea/{item_id}")
async def stock_item_por_linea(
    item_id: str,
    user=Depends(get_current_user),
):
    """Retorna el stock disponible de un item desglosado por cada linea de negocio."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow("SELECT id, nombre, codigo, unidad_medida FROM produccion.prod_inventario WHERE id = $1", item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")

        rows = await conn.fetch("""
            SELECT
                ing.linea_negocio_id,
                ln.nombre as linea_nombre,
                ln.codigo as linea_codigo,
                SUM(ing.cantidad_disponible) as stock_disponible,
                SUM(ing.cantidad_disponible * ing.costo_unitario) as valorizado,
                COUNT(*) as capas_fifo
            FROM produccion.prod_inventario_ingresos ing
            LEFT JOIN finanzas2.cont_linea_negocio ln ON ing.linea_negocio_id = ln.id
            WHERE ing.item_id = $1 AND ing.cantidad_disponible > 0
            GROUP BY ing.linea_negocio_id, ln.nombre, ln.codigo
            ORDER BY ln.nombre
        """, item_id)

        lineas = []
        for r in rows:
            linea_id = r['linea_negocio_id']
            stock_bruto = safe_float(r['stock_disponible'])

            # Calcular reservas activas para esta linea via prod_registros.linea_negocio_id
            reservado = 0.0
            if linea_id:
                reservado_row = await conn.fetchval("""
                    SELECT COALESCE(SUM(rl.cantidad_reservada - rl.cantidad_liberada), 0)
                    FROM produccion.prod_inventario_reservas_linea rl
                    JOIN produccion.prod_inventario_reservas r ON rl.reserva_id = r.id
                    JOIN produccion.prod_registros reg ON r.registro_id = reg.id
                    WHERE rl.item_id = $1
                      AND r.estado = 'ACTIVA'
                      AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
                      AND reg.linea_negocio_id = $2
                """, item_id, linea_id)
                reservado = safe_float(reservado_row)

            lineas.append({
                "linea_negocio_id": linea_id,
                "linea_nombre": r['linea_nombre'] or "Global (sin linea)",
                "linea_codigo": r['linea_codigo'] or "GLOBAL",
                "stock_bruto": stock_bruto,
                "reservado": reservado,
                "stock_disponible": max(0, stock_bruto - reservado),
                "valorizado": round(safe_float(r['valorizado']), 4),
                "capas_fifo": r['capas_fifo'],
            })

        return {
            "item_id": item_id,
            "item_nombre": item['nombre'],
            "item_codigo": item['codigo'],
            "unidad_medida": item['unidad_medida'],
            "lineas": lineas,
        }
