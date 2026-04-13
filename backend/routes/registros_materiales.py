"""Router for registros: requerimiento MP (BOM explosion), reservas, disponibilidad."""
import uuid
from fastapi import APIRouter, HTTPException, Depends, Query
from db import get_pool
from auth_utils import get_current_user
from models import ReservaCreateInput, LiberarReservaInput
from helpers import row_to_dict, validar_registro_activo

router = APIRouter(prefix="/api")


def calcular_estado_requerimiento(cantidad_requerida: float, cantidad_reservada: float, cantidad_consumida: float) -> str:
    """Calcula el estado de una línea de requerimiento"""
    if cantidad_requerida <= 0:
        return 'PENDIENTE'
    if cantidad_consumida >= cantidad_requerida:
        return 'COMPLETO'
    if cantidad_reservada > 0 or cantidad_consumida > 0:
        return 'PARCIAL'
    return 'PENDIENTE'


@router.post("/registros/{registro_id}/generar-requerimiento")
async def generar_requerimiento_mp(registro_id: str, bom_id: str = Query(None)):
    """Genera el requerimiento de MP a partir de la explosión del BOM.
    Si bom_id se proporciona, usa ese BOM específico.
    Si no, auto-selecciona el mejor BOM (APROBADO > BORRADOR, versión más reciente)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Obtener registro
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        modelo_id = registro['modelo_id']

        # Obtener cantidades reales por talla
        tallas_registro = await conn.fetch(
            "SELECT talla_id, cantidad_real FROM prod_registro_tallas WHERE registro_id = $1",
            registro_id
        )
        tallas_map = {t['talla_id']: int(t['cantidad_real']) for t in tallas_registro}
        total_prendas = sum(tallas_map.values())

        if total_prendas <= 0:
            raise HTTPException(status_code=400, detail="Ingresa cantidades reales por talla antes de generar el requerimiento")

        # Determinar qué BOM usar
        if bom_id:
            bom_cab = await conn.fetchrow("SELECT * FROM prod_bom_cabecera WHERE id = $1", bom_id)
            if not bom_cab:
                raise HTTPException(status_code=404, detail="BOM no encontrado")
        else:
            # Auto-seleccionar mejor BOM: APROBADO primero, luego BORRADOR, versión más reciente
            bom_cab = await conn.fetchrow("""
                SELECT * FROM prod_bom_cabecera
                WHERE modelo_id = $1 AND estado != 'INACTIVO'
                ORDER BY CASE estado WHEN 'APROBADO' THEN 1 WHEN 'BORRADOR' THEN 2 ELSE 3 END, version DESC
                LIMIT 1
            """, modelo_id)

        # Obtener BOM activo del modelo, filtrando por bom_id si existe
        if bom_cab:
            bom_lineas = await conn.fetch("""
                SELECT bl.*, i.nombre as item_nombre, i.codigo as item_codigo, i.unidad_medida
                FROM prod_modelo_bom_linea bl
                JOIN prod_inventario i ON bl.inventario_id = i.id
                WHERE bl.bom_id = $1 AND bl.activo = true
                  AND COALESCE(bl.tipo_componente, 'TELA') IN ('TELA', 'AVIO', 'EMPAQUE', 'OTRO')
            """, bom_cab['id'])
        else:
            # Fallback: líneas sin bom_id asignado (datos legacy)
            bom_lineas = await conn.fetch("""
                SELECT bl.*, i.nombre as item_nombre, i.codigo as item_codigo, i.unidad_medida
                FROM prod_modelo_bom_linea bl
                JOIN prod_inventario i ON bl.inventario_id = i.id
                WHERE bl.modelo_id = $1 AND bl.activo = true AND bl.bom_id IS NULL
            """, modelo_id)

        if not bom_lineas:
            raise HTTPException(status_code=400, detail="El modelo no tiene BOM definido")

        created = 0
        updated = 0
        empresa_id = registro.get('empresa_id') or 7

        for bom in bom_lineas:
            item_id = bom['inventario_id']
            cantidad_base = float(bom['cantidad_base'])
            talla_id = bom['talla_id']  # Puede ser NULL

            # Calcular cantidad requerida
            if talla_id is None:
                # Línea general: aplica a todas las prendas
                cantidad_requerida = total_prendas * cantidad_base
            else:
                # Línea específica por talla
                qty_talla = tallas_map.get(talla_id, 0)
                cantidad_requerida = qty_talla * cantidad_base

            # Buscar si ya existe requerimiento para este (registro, item, talla)
            if talla_id:
                existing = await conn.fetchrow("""
                    SELECT * FROM prod_registro_requerimiento_mp
                    WHERE registro_id = $1 AND item_id = $2 AND talla_id = $3
                """, registro_id, item_id, talla_id)
            else:
                existing = await conn.fetchrow("""
                    SELECT * FROM prod_registro_requerimiento_mp
                    WHERE registro_id = $1 AND item_id = $2 AND talla_id IS NULL
                """, registro_id, item_id)

            if existing:
                # Actualizar solo cantidad_requerida, NO resetear reservada/consumida
                cantidad_reservada = float(existing['cantidad_reservada'])
                cantidad_consumida = float(existing['cantidad_consumida'])
                nuevo_estado = calcular_estado_requerimiento(cantidad_requerida, cantidad_reservada, cantidad_consumida)

                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_requerida = $1, estado = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                """, cantidad_requerida, nuevo_estado, existing['id'])
                updated += 1
            else:
                # Crear nuevo requerimiento
                new_id = str(uuid.uuid4())
                estado = 'PENDIENTE' if cantidad_requerida > 0 else 'COMPLETO'
                await conn.execute("""
                    INSERT INTO prod_registro_requerimiento_mp
                    (id, registro_id, item_id, talla_id, cantidad_requerida, cantidad_reservada, cantidad_consumida, estado, empresa_id)
                    VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7)
                """, new_id, registro_id, item_id, talla_id, cantidad_requerida, estado, empresa_id)
                created += 1

        return {
            "message": "Requerimiento generado",
            "total_prendas": total_prendas,
            "lineas_creadas": created,
            "lineas_actualizadas": updated,
            "bom_usado": {
                "id": bom_cab['id'],
                "codigo": bom_cab['codigo'],
                "version": bom_cab['version'],
                "estado": bom_cab['estado'],
            } if bom_cab else None
        }


@router.get("/registros/{registro_id}/requerimiento")
async def get_requerimiento_mp(registro_id: str):
    """Obtiene el requerimiento de MP de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        rows = await conn.fetch("""
            SELECT r.*, i.codigo as item_codigo, i.nombre as item_nombre,
                   i.unidad_medida as item_unidad, i.control_por_rollos,
                   tc.nombre as talla_nombre
            FROM prod_registro_requerimiento_mp r
            JOIN prod_inventario i ON r.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON r.talla_id = tc.id
            WHERE r.registro_id = $1
            ORDER BY i.nombre, tc.orden NULLS FIRST
        """, registro_id)

        result = []
        for r in rows:
            d = row_to_dict(r)
            cantidad_requerida = float(d['cantidad_requerida'])
            cantidad_reservada = float(d['cantidad_reservada'])
            cantidad_consumida = float(d['cantidad_consumida'])
            d['pendiente_reservar'] = max(0, cantidad_requerida - cantidad_reservada)
            d['pendiente_consumir'] = max(0, cantidad_reservada - cantidad_consumida)
            result.append(d)

        # Calcular totales
        total_requerido = sum(float(r['cantidad_requerida']) for r in result)
        total_reservado = sum(float(r['cantidad_reservada']) for r in result)
        total_consumido = sum(float(r['cantidad_consumida']) for r in result)

        return {
            "registro_id": registro_id,
            "lineas": result,
            "resumen": {
                "total_lineas": len(result),
                "total_requerido": total_requerido,
                "total_reservado": total_reservado,
                "total_consumido": total_consumido,
                "pendiente_reservar": max(0, total_requerido - total_reservado),
                "pendiente_consumir": max(0, total_reservado - total_consumido)
            }
        }


@router.get("/registros/{registro_id}/materiales")
async def get_materiales_consolidado(registro_id: str):
    """Vista consolidada: requerimiento + reservas + salidas de un registro en una sola respuesta."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        existe = await conn.fetchval("SELECT 1 FROM prod_registros WHERE id = $1", registro_id)
        if not existe:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # 1) Requerimiento
        req_rows = await conn.fetch("""
            SELECT r.*, i.codigo as item_codigo, i.nombre as item_nombre,
                   i.unidad_medida as item_unidad, i.stock_actual, i.control_por_rollos,
                   tc.nombre as talla_nombre
            FROM prod_registro_requerimiento_mp r
            JOIN prod_inventario i ON r.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON r.talla_id = tc.id
            WHERE r.registro_id = $1
            ORDER BY i.nombre, tc.orden NULLS FIRST
        """, registro_id)

        # 2) Reservas activas con detalle de lineas (un solo query)
        reservas_raw = await conn.fetch("""
            SELECT r.id as reserva_id, r.estado, r.created_at as fecha,
                   rl.id as linea_id, rl.item_id, rl.talla_id, rl.cantidad_reservada, rl.cantidad_liberada,
                   i.codigo as item_codigo, i.nombre as item_nombre, i.unidad_medida as item_unidad,
                   tc.nombre as talla_nombre
            FROM prod_inventario_reservas r
            LEFT JOIN prod_inventario_reservas_linea rl ON rl.reserva_id = r.id
            LEFT JOIN prod_inventario i ON rl.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON rl.talla_id = tc.id
            WHERE r.registro_id = $1
            ORDER BY r.created_at DESC
        """, registro_id)

        reservas_map = {}
        for rr in reservas_raw:
            rid = rr['reserva_id']
            if rid not in reservas_map:
                reservas_map[rid] = {"id": rid, "estado": rr['estado'],
                    "fecha": str(rr['fecha']) if rr['fecha'] else None, "lineas": []}
            if rr['linea_id']:
                reservas_map[rid]["lineas"].append({
                    "id": rr['linea_id'], "item_id": rr['item_id'], "talla_id": rr['talla_id'],
                    "cantidad_reservada": float(rr['cantidad_reservada'] or 0),
                    "cantidad_liberada": float(rr['cantidad_liberada'] or 0),
                    "item_codigo": rr['item_codigo'], "item_nombre": rr['item_nombre'],
                    "item_unidad": rr['item_unidad'], "talla_nombre": rr['talla_nombre'],
                    "cantidad_activa": max(0, float(rr['cantidad_reservada'] or 0) - float(rr['cantidad_liberada'] or 0))
                })
        reservas_list = list(reservas_map.values())

        # 3) Salidas relacionadas
        salidas = await conn.fetch("""
            SELECT s.*, i.codigo as item_codigo, i.nombre as item_nombre, i.unidad_medida as item_unidad
            FROM prod_inventario_salidas s
            JOIN prod_inventario i ON s.item_id = i.id
            WHERE s.registro_id = $1
            ORDER BY s.fecha DESC
        """, registro_id)

        # 4) Disponibilidad por item - batch en vez de N queries individuales
        item_ids = list(set(r['item_id'] for r in req_rows))
        disponibilidad = {}
        if item_ids:
            disp_rows = await conn.fetch("""
                SELECT i.id as item_id, i.stock_actual,
                    COALESCE(i.stock_actual, 0) - COALESCE((
                        SELECT SUM(rl.cantidad_reservada - rl.cantidad_liberada)
                        FROM prod_inventario_reservas_linea rl
                        JOIN prod_inventario_reservas rv ON rl.reserva_id = rv.id
                        WHERE rl.item_id = i.id AND rv.estado = 'ACTIVA'
                    ), 0) as disponible
                FROM prod_inventario i
                WHERE i.id = ANY($1)
            """, item_ids)
            for dr in disp_rows:
                disponibilidad[dr['item_id']] = {
                    'stock_actual': float(dr['stock_actual'] or 0),
                    'disponible': float(dr['disponible'] or 0)
                }

        # Armar resultado
        lineas = []
        for r in req_rows:
            d = row_to_dict(r)
            req = float(d['cantidad_requerida'])
            res_qty = float(d['cantidad_reservada'])
            con = float(d['cantidad_consumida'])
            item_disp = disponibilidad.get(d['item_id'], {})
            d['pendiente'] = max(0, req - con)
            d['disponible'] = item_disp.get('disponible', 0)
            d['stock_actual'] = item_disp.get('stock_actual', float(d.get('stock_actual') or 0))
            # Para items con control_por_rollos, incluir rollos disponibles
            if d.get('control_por_rollos'):
                rollos = await conn.fetch("""
                    SELECT r.id, r.numero_rollo, r.metraje_disponible, r.tono, r.ancho,
                           ing.fecha as fecha_ingreso
                    FROM prod_inventario_rollos r
                    JOIN prod_inventario_ingresos ing ON r.ingreso_id = ing.id
                    WHERE r.item_id = $1 AND r.metraje_disponible > 0
                    ORDER BY ing.fecha ASC
                """, d['item_id'])
                d['rollos_disponibles'] = [dict(ro) for ro in rollos]
                for ro in d['rollos_disponibles']:
                    ro['metraje_disponible'] = float(ro['metraje_disponible'])
                    ro['fecha_ingreso'] = str(ro['fecha_ingreso']) if ro.get('fecha_ingreso') else None
                    ro['ancho'] = float(ro['ancho']) if ro.get('ancho') else None
            lineas.append(d)

        total_req = sum(float(l['cantidad_requerida']) for l in lineas)
        total_res = sum(float(l['cantidad_reservada']) for l in lineas)
        total_con = sum(float(l['cantidad_consumida']) for l in lineas)

        return {
            "registro_id": registro_id,
            "tiene_requerimiento": len(lineas) > 0,
            "lineas": lineas,
            "resumen": {
                "total_lineas": len(lineas),
                "total_requerido": total_req,
                "total_reservado": total_res,
                "total_consumido": total_con,
                "total_pendiente": max(0, total_req - total_con),
            },
            "reservas": reservas_list,
            "salidas": [row_to_dict(s) for s in salidas],
        }



# ==================== FASE 2: ENDPOINTS RESERVAS ====================

async def get_disponibilidad_item(conn, item_id: str) -> dict:
    """Calcula la disponibilidad real de un item (stock - reservas activas)"""
    item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
    if not item:
        return None

    stock_actual = float(item['stock_actual'])

    # Sumar reservas activas (cantidad_reservada - cantidad_liberada)
    total_reservado = await conn.fetchval("""
        SELECT COALESCE(SUM(rl.cantidad_reservada - rl.cantidad_liberada), 0)
        FROM prod_inventario_reservas_linea rl
        JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
        WHERE rl.item_id = $1 AND r.estado = 'ACTIVA'
    """, item_id)

    total_reservado = float(total_reservado or 0)
    disponible = max(0, stock_actual - total_reservado)

    return {
        "item_id": item_id,
        "item_codigo": item['codigo'],
        "item_nombre": item['nombre'],
        "stock_actual": stock_actual,
        "total_reservado": total_reservado,
        "disponible": disponible,
        "control_por_rollos": item['control_por_rollos']
    }


@router.get("/inventario/{item_id}/disponibilidad")
async def get_disponibilidad_inventario(item_id: str):
    """Obtiene la disponibilidad real de un item (stock - reservas activas)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await get_disponibilidad_item(conn, item_id)
        if not result:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        return result


@router.post("/registros/{registro_id}/reservas")
async def crear_reserva(registro_id: str, input: ReservaCreateInput):
    """Crea una reserva para un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Validar registro
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        validar_registro_activo(registro, contexto='crear reservas')

        if not input.lineas:
            raise HTTPException(status_code=400, detail="Debe incluir al menos una línea de reserva")

        # Obtener reservas previas del mismo registro para considerar en validación
        reservas_previas = await conn.fetch("""
            SELECT r.id AS reserva_id, rl.id AS linea_id, rl.item_id, rl.talla_id,
                   rl.cantidad_reservada, rl.cantidad_liberada
            FROM prod_inventario_reservas r
            JOIN prod_inventario_reservas_linea rl ON rl.reserva_id = r.id
            WHERE r.registro_id = $1 AND r.estado = 'ACTIVA'
        """, registro_id)

        # Calcular neto reservado previamente por item (se liberará al sobreescribir)
        neto_previo_por_item = {}
        for prev in reservas_previas:
            key = (prev['item_id'], prev['talla_id'])
            neto = float(prev['cantidad_reservada']) - float(prev['cantidad_liberada'])
            if neto > 0:
                neto_previo_por_item[key] = neto_previo_por_item.get(key, 0) + neto

        # Validar cada línea
        errores = []
        for idx, linea in enumerate(input.lineas):
            # Buscar requerimiento
            if linea.talla_id:
                req = await conn.fetchrow("""
                    SELECT * FROM prod_registro_requerimiento_mp
                    WHERE registro_id = $1 AND item_id = $2 AND talla_id = $3
                """, registro_id, linea.item_id, linea.talla_id)
            else:
                req = await conn.fetchrow("""
                    SELECT * FROM prod_registro_requerimiento_mp
                    WHERE registro_id = $1 AND item_id = $2 AND talla_id IS NULL
                """, registro_id, linea.item_id)

            if not req:
                errores.append(f"Línea {idx+1}: No existe requerimiento para item_id={linea.item_id}, talla_id={linea.talla_id}")
                continue

            disp = await get_disponibilidad_item(conn, linea.item_id)
            if not disp:
                errores.append(f"Línea {idx+1}: Item no encontrado")
                continue

            # Sumar al disponible lo que ya está reservado para este registro (se va a liberar)
            disponible_real = disp['disponible'] + neto_previo_por_item.get((linea.item_id, linea.talla_id), 0)

            if linea.cantidad > disponible_real:
                errores.append(f"Línea {idx+1}: Cantidad ({linea.cantidad}) excede disponible ({disponible_real})")

        if errores:
            raise HTTPException(status_code=400, detail={"errores": errores})

        # Anular reservas activas previas de los mismos items para este registro
        # Esto permite "sobreescribir" la reserva en vez de sumar
        items_a_reservar = {(l.item_id, l.talla_id) for l in input.lineas}

        for prev in reservas_previas:
            prev_key = (prev['item_id'], prev['talla_id'])
            if prev_key in items_a_reservar:
                # Restar la reserva anterior del requerimiento
                neto_previo = float(prev['cantidad_reservada']) - float(prev['cantidad_liberada'])
                if neto_previo > 0:
                    if prev['talla_id']:
                        await conn.execute("""
                            UPDATE prod_registro_requerimiento_mp
                            SET cantidad_reservada = GREATEST(cantidad_reservada - $1, 0), updated_at = CURRENT_TIMESTAMP
                            WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                        """, neto_previo, registro_id, prev['item_id'], prev['talla_id'])
                    else:
                        await conn.execute("""
                            UPDATE prod_registro_requerimiento_mp
                            SET cantidad_reservada = GREATEST(cantidad_reservada - $1, 0), updated_at = CURRENT_TIMESTAMP
                            WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                        """, neto_previo, registro_id, prev['item_id'])
                # Anular la línea previa
                await conn.execute("""
                    UPDATE prod_inventario_reservas_linea SET cantidad_reservada = cantidad_liberada WHERE id = $1
                """, prev['linea_id'])

        # Limpiar cabeceras de reserva que quedaron vacías
        await conn.execute("""
            UPDATE prod_inventario_reservas SET estado = 'ANULADA'
            WHERE registro_id = $1 AND estado = 'ACTIVA'
            AND NOT EXISTS (
                SELECT 1 FROM prod_inventario_reservas_linea rl
                WHERE rl.reserva_id = prod_inventario_reservas.id
                AND rl.cantidad_reservada > rl.cantidad_liberada
            )
        """, registro_id)

        # Crear cabecera de reserva
        reserva_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO prod_inventario_reservas (id, registro_id, estado, empresa_id)
            VALUES ($1, $2, 'ACTIVA', $3)
        """, reserva_id, registro_id, registro['empresa_id'])

        # Crear líneas y actualizar requerimiento
        lineas_creadas = []
        for linea in input.lineas:
            linea_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_inventario_reservas_linea
                (id, reserva_id, item_id, talla_id, cantidad_reservada, cantidad_liberada, empresa_id)
                VALUES ($1, $2, $3, $4, $5, 0, $6)
            """, linea_id, reserva_id, linea.item_id, linea.talla_id, linea.cantidad, registro['empresa_id'])

            # Actualizar cantidad_reservada en requerimiento (SET absoluto, ya restamos lo previo)
            if linea.talla_id:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = cantidad_reservada + $1, updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, linea.cantidad, registro_id, linea.item_id, linea.talla_id)
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = cantidad_reservada + $1, updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, linea.cantidad, registro_id, linea.item_id)

            lineas_creadas.append({
                "id": linea_id,
                "item_id": linea.item_id,
                "talla_id": linea.talla_id,
                "cantidad_reservada": linea.cantidad
            })

        # Recalcular estados de requerimiento
        await conn.execute("""
            UPDATE prod_registro_requerimiento_mp
            SET estado = CASE
                WHEN cantidad_consumida >= cantidad_requerida THEN 'COMPLETO'
                WHEN cantidad_reservada > 0 OR cantidad_consumida > 0 THEN 'PARCIAL'
                ELSE 'PENDIENTE'
            END
            WHERE registro_id = $1
        """, registro_id)

        return {
            "message": "Reserva creada",
            "reserva_id": reserva_id,
            "lineas": lineas_creadas
        }


@router.get("/registros/{registro_id}/reservas")
async def get_reservas_registro(registro_id: str):
    """Lista las reservas de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # Obtener cabeceras de reserva
        reservas = await conn.fetch("""
            SELECT * FROM prod_inventario_reservas
            WHERE registro_id = $1
            ORDER BY fecha DESC
        """, registro_id)

        result = []
        for res in reservas:
            d = row_to_dict(res)

            # Obtener líneas de la reserva
            lineas = await conn.fetch("""
                SELECT rl.*, i.codigo as item_codigo, i.nombre as item_nombre,
                       i.unidad_medida as item_unidad, tc.nombre as talla_nombre
                FROM prod_inventario_reservas_linea rl
                JOIN prod_inventario i ON rl.item_id = i.id
                LEFT JOIN prod_tallas_catalogo tc ON rl.talla_id = tc.id
                WHERE rl.reserva_id = $1
            """, res['id'])

            d['lineas'] = []
            for lin in lineas:
                ld = row_to_dict(lin)
                ld['cantidad_activa'] = float(ld['cantidad_reservada']) - float(ld['cantidad_liberada'])
                d['lineas'].append(ld)

            result.append(d)

        return {"registro_id": registro_id, "reservas": result}


@router.delete("/reservas/{reserva_id}")
async def anular_reserva(reserva_id: str):
    """Anula una reserva completa, liberando todo el stock reservado."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        reserva = await conn.fetchrow("SELECT * FROM prod_inventario_reservas WHERE id = $1", reserva_id)
        if not reserva:
            raise HTTPException(status_code=404, detail="Reserva no encontrada")
        if reserva['estado'] != 'ACTIVA':
            raise HTTPException(status_code=400, detail=f"La reserva ya está {reserva['estado']}")

        registro_id = reserva['registro_id']

        # Obtener líneas activas de la reserva
        lineas = await conn.fetch("""
            SELECT * FROM prod_inventario_reservas_linea WHERE reserva_id = $1
        """, reserva_id)

        # Liberar cada línea y actualizar requerimiento
        for lin in lineas:
            cantidad_activa = float(lin['cantidad_reservada']) - float(lin['cantidad_liberada'])
            if cantidad_activa > 0:
                # Marcar como liberada
                await conn.execute("""
                    UPDATE prod_inventario_reservas_linea
                    SET cantidad_liberada = cantidad_reservada, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                """, lin['id'])

                # Devolver al requerimiento
                if lin['talla_id']:
                    await conn.execute("""
                        UPDATE prod_registro_requerimiento_mp
                        SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                        WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                    """, cantidad_activa, registro_id, lin['item_id'], lin['talla_id'])
                else:
                    await conn.execute("""
                        UPDATE prod_registro_requerimiento_mp
                        SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                        WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                    """, cantidad_activa, registro_id, lin['item_id'])

        # Marcar reserva como anulada
        await conn.execute("""
            UPDATE prod_inventario_reservas SET estado = 'ANULADA', updated_at = CURRENT_TIMESTAMP WHERE id = $1
        """, reserva_id)

        return {"message": "Reserva anulada", "reserva_id": reserva_id, "lineas_liberadas": len(lineas)}



@router.post("/registros/{registro_id}/liberar-reservas")
async def liberar_reservas(registro_id: str, input: LiberarReservaInput):
    """Libera parcial o totalmente reservas de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        validar_registro_activo(registro, contexto='liberar reservas')

        if not input.lineas:
            raise HTTPException(status_code=400, detail="Debe incluir al menos una línea a liberar")

        liberadas = []
        for linea in input.lineas:
            # Buscar líneas de reserva activas para este item/talla
            if linea.talla_id:
                reserva_lineas = await conn.fetch("""
                    SELECT rl.* FROM prod_inventario_reservas_linea rl
                    JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
                    WHERE r.registro_id = $1 AND r.estado = 'ACTIVA'
                      AND rl.item_id = $2 AND rl.talla_id = $3
                      AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
                """, registro_id, linea.item_id, linea.talla_id)
            else:
                reserva_lineas = await conn.fetch("""
                    SELECT rl.* FROM prod_inventario_reservas_linea rl
                    JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
                    WHERE r.registro_id = $1 AND r.estado = 'ACTIVA'
                      AND rl.item_id = $2 AND rl.talla_id IS NULL
                      AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
                """, registro_id, linea.item_id)

            cantidad_a_liberar = linea.cantidad
            for rl in reserva_lineas:
                if cantidad_a_liberar <= 0:
                    break

                activa = float(rl['cantidad_reservada']) - float(rl['cantidad_liberada'])
                liberar = min(activa, cantidad_a_liberar)

                await conn.execute("""
                    UPDATE prod_inventario_reservas_linea
                    SET cantidad_liberada = cantidad_liberada + $1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                """, liberar, rl['id'])

                cantidad_a_liberar -= liberar

            # Actualizar requerimiento: bajar cantidad_reservada
            if linea.talla_id:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, linea.cantidad, registro_id, linea.item_id, linea.talla_id)
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, linea.cantidad, registro_id, linea.item_id)

            liberadas.append({
                "item_id": linea.item_id,
                "talla_id": linea.talla_id,
                "cantidad_liberada": linea.cantidad
            })

        # Recalcular estados
        await conn.execute("""
            UPDATE prod_registro_requerimiento_mp
            SET estado = CASE
                WHEN cantidad_consumida >= cantidad_requerida THEN 'COMPLETO'
                WHEN cantidad_reservada > 0 OR cantidad_consumida > 0 THEN 'PARCIAL'
                ELSE 'PENDIENTE'
            END
            WHERE registro_id = $1
        """, registro_id)

        return {"message": "Reservas liberadas", "liberadas": liberadas}


# ==================== FASE 2C: CIERRE/ANULACIÓN OP ====================

async def liberar_reservas_pendientes_auto(conn, registro_id: str):
    """
    Libera automáticamente todas las reservas pendientes de un registro.
    Usado al cerrar o anular una OP.
    Retorna resumen de liberaciones.
    """
    items_liberados = []
    total_liberado = 0.0

    # Obtener todas las reservas activas del registro
    reservas = await conn.fetch("""
        SELECT id FROM prod_inventario_reservas
        WHERE registro_id = $1 AND estado = 'ACTIVA'
    """, registro_id)

    for reserva in reservas:
        # Obtener líneas con cantidad pendiente
        lineas = await conn.fetch("""
            SELECT rl.*, i.nombre as item_nombre
            FROM prod_inventario_reservas_linea rl
            JOIN prod_inventario i ON rl.item_id = i.id
            WHERE rl.reserva_id = $1
              AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
        """, reserva['id'])

        for linea in lineas:
            liberable = float(linea['cantidad_reservada']) - float(linea['cantidad_liberada'])
            if liberable <= 0:
                continue

            # Actualizar línea de reserva: marcar como liberada
            await conn.execute("""
                UPDATE prod_inventario_reservas_linea
                SET cantidad_liberada = cantidad_reservada, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            """, linea['id'])

            # Actualizar requerimiento: bajar cantidad_reservada
            if linea['talla_id']:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, liberable, registro_id, linea['item_id'], linea['talla_id'])
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, liberable, registro_id, linea['item_id'])

            items_liberados.append({
                "item_id": linea['item_id'],
                "item_nombre": linea['item_nombre'],
                "talla_id": linea['talla_id'],
                "cantidad": liberable
            })
            total_liberado += liberable

        # Marcar cabecera de reserva como CERRADA
        await conn.execute("""
            UPDATE prod_inventario_reservas
            SET estado = 'CERRADA', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, reserva['id'])

    # Recalcular estados de requerimiento
    await conn.execute("""
        UPDATE prod_registro_requerimiento_mp
        SET estado = CASE
            WHEN cantidad_consumida >= cantidad_requerida AND cantidad_requerida > 0 THEN 'COMPLETO'
            WHEN cantidad_reservada > 0 OR cantidad_consumida > 0 THEN 'PARCIAL'
            ELSE 'PENDIENTE'
        END
        WHERE registro_id = $1
    """, registro_id)

    return {
        "total_liberado": total_liberado,
        "items_liberados": items_liberados
    }
