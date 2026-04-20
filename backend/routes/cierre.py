"""
Router: Cierre de Registro de Produccion
Archivo UNICO y oficial de cierre. Consolida cierre.py + cierre_v2.py.
Calcula costo MP (FIFO) + costos servicio + otros costos + CIF → congela resultado → genera ingreso PT.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timezone
from decimal import Decimal
import uuid
import json
import asyncio
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict, validar_registro_activo
from routes.auditoria import audit_log, get_usuario

router = APIRouter(prefix="/api", tags=["cierre"])


class CierreRegistroInput(BaseModel):
    empresa_id: Optional[int] = None
    fecha: Optional[date] = None
    qty_terminada: Optional[float] = None
    observacion_cierre: Optional[str] = None


class PtItemUpdate(BaseModel):
    pt_item_id: Optional[str] = None


class ReaperturaInput(BaseModel):
    motivo: str


# ==================== HELPERS ====================

def safe_float(v):
    try:
        return float(v or 0)
    except (ValueError, TypeError):
        return 0.0


async def _calcular_costos(conn, registro_id):
    """Calcula costos reales desde las fuentes oficiales. Reutilizable por preview y cierre."""
    costo_mp = safe_float(await conn.fetchval(
        "SELECT COALESCE(SUM(costo_total), 0) FROM prod_inventario_salidas WHERE registro_id = $1", registro_id
    ))
    costo_servicios = safe_float(await conn.fetchval(
        "SELECT COALESCE(SUM(costo_calculado), 0) FROM prod_movimientos_produccion WHERE registro_id = $1", registro_id
    ))
    otros_costos = safe_float(await conn.fetchval(
        "SELECT COALESCE(SUM(monto), 0) FROM prod_registro_costos_servicio WHERE registro_id = $1", registro_id
    ))
    costo_total_final = costo_mp + costo_servicios + otros_costos

    salidas_detalle = await conn.fetch("""
        SELECT s.item_id, i.codigo, i.nombre, SUM(s.cantidad) as cantidad_total,
               SUM(s.costo_total) as costo_total
        FROM prod_inventario_salidas s
        JOIN prod_inventario i ON s.item_id = i.id
        WHERE s.registro_id = $1
        GROUP BY s.item_id, i.codigo, i.nombre ORDER BY i.nombre
    """, registro_id)
    movimientos_detalle = await conn.fetch("""
        SELECT mp.servicio_id, sp.nombre as servicio_nombre,
               SUM(mp.cantidad_recibida) as cantidad_total,
               SUM(mp.costo_calculado) as costo_total
        FROM prod_movimientos_produccion mp
        LEFT JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id
        WHERE mp.registro_id = $1
        GROUP BY mp.servicio_id, sp.nombre ORDER BY sp.nombre
    """, registro_id)
    otros_detalle = await conn.fetch("""
        SELECT cs.descripcion, cs.monto, cs.proveedor_texto
        FROM prod_registro_costos_servicio cs
        WHERE cs.registro_id = $1
        ORDER BY cs.created_at
    """, registro_id)

    return {
        "costo_mp": round(costo_mp, 2),
        "costo_servicios": round(costo_servicios, 2),
        "otros_costos": round(otros_costos, 2),
        "costo_total_final": round(costo_total_final, 2),
        "salidas_mp_detalle": [row_to_dict(r) for r in salidas_detalle],
        "movimientos_detalle": [row_to_dict(r) for r in movimientos_detalle],
        "otros_costos_detalle": [row_to_dict(r) for r in otros_detalle],
    }


async def _get_qty_terminada(conn, registro_id):
    """Cantidad terminada real desde tallas del registro."""
    return safe_float(await conn.fetchval(
        "SELECT COALESCE(SUM(cantidad_real), 0) FROM prod_registro_tallas WHERE registro_id = $1",
        registro_id
    ))


async def _get_merma_qty(conn, registro_id):
    """Cantidad de mermas registradas."""
    return safe_float(await conn.fetchval(
        "SELECT COALESCE(SUM(cantidad), 0) FROM prod_mermas WHERE registro_id = $1",
        registro_id
    ))


async def _calcular_cif(conn, registro_id, fecha_cierre=None):
    """Calcula Costos Indirectos de Fabricación (CIF) para un lote.

    Arquitectura correcta:
      - CIF = gastos con categoría "CIF Producción" en cont_categoria (Finanzas)
             + depreciación de activos fijos
      - NO incluye fin_gasto_unidad_interna (esos son costos internos de cada unidad,
        ya capturados en la tarifa por prenda)
      - Prorrateo por PRENDAS (no por días) — más justo para lotes de distinto tamaño
    """
    from datetime import timedelta

    if fecha_cierre is None:
        fecha_cierre = date.today()
    elif isinstance(fecha_cierre, datetime):
        fecha_cierre = fecha_cierre.date()

    # Obtener datos del registro
    reg = await conn.fetchrow(
        "SELECT fecha_creacion, fecha_inicio_real, empresa_id FROM prod_registros WHERE id = $1", registro_id
    )
    if not reg or not reg['fecha_creacion']:
        return {"cif_total": 0, "gastos_cif": 0, "facturas_cif": 0, "depreciacion": 0,
                "total_cif_mes": 0, "prendas_lote": 0, "total_prendas_mes": 0,
                "proporcion_pct": 0, "cif_asignado": 0, "periodo": "", "detalle": []}

    fecha_creacion_date = reg['fecha_creacion'].date() if isinstance(reg['fecha_creacion'], datetime) else reg['fecha_creacion']
    fecha_inicio_lote = reg['fecha_inicio_real'] or fecha_creacion_date
    if isinstance(fecha_inicio_lote, datetime):
        fecha_inicio_lote = fecha_inicio_lote.date()

    # Período: mes de la fecha de cierre
    primer_dia_mes = fecha_cierre.replace(day=1)
    ultimo_dia_mes = (primer_dia_mes + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    periodo_str = fecha_cierre.strftime('%Y-%m')

    # --- GASTOS CIF del mes (todas las empresas) ---
    gastos_cif = safe_float(await conn.fetchval("""
        SELECT COALESCE(SUM(g.total), 0)
        FROM finanzas2.cont_gasto g
        JOIN finanzas2.cont_gasto_linea gl ON g.id = gl.gasto_id
        JOIN finanzas2.cont_categoria c ON gl.categoria_id = c.id
        LEFT JOIN finanzas2.cont_categoria cp ON c.padre_id = cp.id
        WHERE g.fecha >= $1 AND g.fecha <= $2
          AND (c.nombre = 'CIF Producción' OR cp.nombre = 'CIF Producción')
    """, primer_dia_mes, ultimo_dia_mes))

    # Fuente 2: líneas de facturas proveedor con categoría CIF Producción (todas las empresas)
    facturas_cif = safe_float(await conn.fetchval("""
        SELECT COALESCE(SUM(fl.importe), 0)
        FROM finanzas2.cont_factura_proveedor_linea fl
        JOIN finanzas2.cont_factura_proveedor f ON fl.factura_id = f.id
        JOIN finanzas2.cont_categoria c ON fl.categoria_id = c.id
        LEFT JOIN finanzas2.cont_categoria cp ON c.padre_id = cp.id
        WHERE COALESCE(f.fecha_contable, f.fecha_factura) >= $1
          AND COALESCE(f.fecha_contable, f.fecha_factura) <= $2
          AND f.estado != 'anulada'
          AND (c.nombre = 'CIF Producción' OR cp.nombre = 'CIF Producción')
    """, primer_dia_mes, ultimo_dia_mes))

    # Detalle por categoría CIF — gastos
    detalle_cif = [row_to_dict(r) for r in await conn.fetch("""
        SELECT g.id, g.numero, g.fecha, g.total as monto,
               c.nombre as categoria, g.notas as descripcion,
               'gasto' as origen
        FROM finanzas2.cont_gasto g
        JOIN finanzas2.cont_gasto_linea gl ON g.id = gl.gasto_id
        JOIN finanzas2.cont_categoria c ON gl.categoria_id = c.id
        LEFT JOIN finanzas2.cont_categoria cp ON c.padre_id = cp.id
        WHERE g.fecha >= $1 AND g.fecha <= $2
          AND (c.nombre = 'CIF Producción' OR cp.nombre = 'CIF Producción')
        ORDER BY g.fecha
    """, primer_dia_mes, ultimo_dia_mes)]

    # Detalle por categoría CIF — líneas de facturas proveedor
    detalle_facturas_cif = [row_to_dict(r) for r in await conn.fetch("""
        SELECT f.id, f.numero, COALESCE(f.fecha_contable, f.fecha_factura) as fecha,
               fl.importe as monto, c.nombre as categoria,
               fl.descripcion, 'factura' as origen
        FROM finanzas2.cont_factura_proveedor_linea fl
        JOIN finanzas2.cont_factura_proveedor f ON fl.factura_id = f.id
        JOIN finanzas2.cont_categoria c ON fl.categoria_id = c.id
        LEFT JOIN finanzas2.cont_categoria cp ON c.padre_id = cp.id
        WHERE COALESCE(f.fecha_contable, f.fecha_factura) >= $1
          AND COALESCE(f.fecha_contable, f.fecha_factura) <= $2
          AND f.estado != 'anulada'
          AND (c.nombre = 'CIF Producción' OR cp.nombre = 'CIF Producción')
        ORDER BY COALESCE(f.fecha_contable, f.fecha_factura)
    """, primer_dia_mes, ultimo_dia_mes)]

    detalle_cif.extend(detalle_facturas_cif)

    # --- DEPRECIACIÓN del mes (todas las empresas) ---
    depreciacion = safe_float(await conn.fetchval("""
        SELECT COALESCE(SUM(d.valor_depreciacion), 0)
        FROM finanzas2.fin_depreciacion_activo d
        JOIN finanzas2.fin_activo_fijo a ON d.activo_id = a.id
        WHERE d.periodo = $1 AND a.estado = 'activo'
    """, periodo_str))

    total_cif_mes = gastos_cif + facturas_cif + depreciacion

    # --- PRORRATEO POR PRENDAS (todos los registros activos del mes) ---
    prendas_lote = safe_float(await conn.fetchval("""
        SELECT COALESCE(SUM(cantidad_real), 0)
        FROM prod_registro_tallas WHERE registro_id = $1
    """, registro_id))

    total_prendas_mes = safe_float(await conn.fetchval("""
        SELECT COALESCE(SUM(t.cantidad_real), 0)
        FROM prod_registros r
        JOIN prod_registro_tallas t ON r.id = t.registro_id
        WHERE COALESCE(r.fecha_inicio_real, r.fecha_creacion::date) <= $2
          AND r.estado NOT IN ('ANULADA', 'Anulada')
          AND NOT EXISTS (
            SELECT 1 FROM prod_registro_cierre c
            WHERE c.registro_id = r.id AND c.estado_cierre = 'CERRADO'
              AND c.fecha < $1
          )
    """, primer_dia_mes, ultimo_dia_mes))

    # Calcular proporción y CIF asignado
    proporcion = 0.0
    cif_asignado = 0.0
    if total_cif_mes > 0 and total_prendas_mes > 0 and prendas_lote > 0:
        proporcion = prendas_lote / total_prendas_mes
        cif_asignado = round(total_cif_mes * proporcion, 2)

    proporcion_pct = round(proporcion * 100, 1)

    return {
        "cif_total": cif_asignado,
        "gastos_cif": round(gastos_cif, 2),
        "facturas_cif": round(facturas_cif, 2),
        "depreciacion": round(depreciacion, 2),
        "total_cif_mes": round(total_cif_mes, 2),
        "prendas_lote": int(prendas_lote),
        "total_prendas_mes": int(total_prendas_mes),
        "proporcion_pct": proporcion_pct,
        "cif_asignado": cif_asignado,
        "fecha_inicio_real": str(fecha_inicio_lote),
        "fecha_creacion": str(fecha_creacion_date),
        "periodo": periodo_str,
        "detalle": detalle_cif,
    }


async def _validar_pre_cierre(conn, reg, qty_terminada):
    """Validaciones obligatorias antes del cierre. Retorna lista de errores."""
    errores = []

    if not reg:
        return ["Registro no encontrado"]

    # Ya cerrado
    cierre_existente = await conn.fetchrow(
        "SELECT id, estado_cierre FROM prod_registro_cierre WHERE registro_id = $1", reg["id"]
    )
    if cierre_existente and cierre_existente["estado_cierre"] == "CERRADO":
        errores.append("Este registro ya tiene un cierre activo. Use reapertura si necesita modificar.")

    # Cantidad terminada
    if qty_terminada <= 0:
        errores.append("La cantidad terminada real debe ser mayor a 0.")

    # PT asignado
    if not reg.get("pt_item_id"):
        errores.append("Debe asignar un articulo de Producto Terminado (PT) antes de cerrar.")
    else:
        pt = await conn.fetchrow("SELECT id FROM prod_inventario WHERE id = $1", reg["pt_item_id"])
        if not pt:
            errores.append(f"El item PT asignado ({reg['pt_item_id']}) no existe en inventario.")

    # Estado compatible
    estados_no_cierre = ("CERRADA", "ANULADA", "Anulada")
    if reg["estado"] in estados_no_cierre:
        errores.append(f"El registro esta en estado '{reg['estado']}', no se puede cerrar.")

    return errores


# ==================== ENDPOINTS ====================

@router.put("/registros/{registro_id}/pt-item")
async def update_pt_item(registro_id: str, data: PtItemUpdate, current_user: dict = Depends(get_current_user)):
    """Asignar o cambiar el articulo PT de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT id, estado FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        validar_registro_activo(reg, contexto='modificar')

        if data.pt_item_id:
            item = await conn.fetchrow("SELECT id, codigo, nombre FROM prod_inventario WHERE id = $1", data.pt_item_id)
            if not item:
                raise HTTPException(status_code=404, detail="Item PT no encontrado en inventario")

        await conn.execute(
            "UPDATE prod_registros SET pt_item_id = $1 WHERE id = $2",
            data.pt_item_id, registro_id
        )
        return {"message": "PT item actualizado", "pt_item_id": data.pt_item_id}


@router.get("/registros/{registro_id}/preview-cierre")
async def preview_cierre(registro_id: str, current_user: dict = Depends(get_current_user)):
    """Preview del cierre: calcula costos sin ejecutar. Incluye validaciones."""
    pool = await get_pool()

    # Obtener registro primero (requerido por las demás operaciones)
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        existing = await conn.fetchrow(
            "SELECT id, estado_cierre FROM prod_registro_cierre WHERE registro_id = $1", registro_id
        )
        if existing and existing["estado_cierre"] == "CERRADO":
            raise HTTPException(status_code=400, detail="Este registro ya tiene un cierre activo")

    # Ejecutar todos los cálculos independientes en paralelo
    async def _qty():
        async with pool.acquire() as c:
            return await _get_qty_terminada(c, registro_id)

    async def _merma():
        async with pool.acquire() as c:
            return await _get_merma_qty(c, registro_id)

    async def _costos():
        async with pool.acquire() as c:
            return await _calcular_costos(c, registro_id)

    async def _cif():
        async with pool.acquire() as c:
            return await _calcular_cif(c, registro_id)

    async def _pt_item():
        if not reg['pt_item_id']:
            return None
        async with pool.acquire() as c:
            pt_row = await c.fetchrow(
                "SELECT id, codigo, nombre FROM prod_inventario WHERE id = $1", reg['pt_item_id']
            )
            return row_to_dict(pt_row) if pt_row else None

    async def _fallados():
        async with pool.acquire() as c:
            return safe_float(await c.fetchval(
                "SELECT COALESCE(SUM(cantidad_detectada), 0) FROM prod_fallados WHERE registro_id = $1", registro_id
            ))

    async def _arreglos():
        async with pool.acquire() as c:
            return await c.fetch(
                "SELECT cantidad, cantidad_recuperada, cantidad_liquidacion, cantidad_merma, estado FROM prod_registro_arreglos WHERE registro_id = $1", registro_id
            )

    qty, merma_qty, costos, cif, pt_item, total_fallados, arreglos_rows = await asyncio.gather(
        _qty(), _merma(), _costos(), _cif(), _pt_item(), _fallados(), _arreglos()
    )

    # Validar (necesita qty ya calculado)
    async with pool.acquire() as conn:
        errores = await _validar_pre_cierre(conn, reg, qty)

    costo_total_con_cif = costos["costo_total_final"] + cif["cif_total"]
    costo_unitario_final = costo_total_con_cif / qty if qty > 0 else 0

    total_en_arreglo = sum(safe_float(a["cantidad"]) for a in arreglos_rows)
    total_recuperado = sum(safe_float(a["cantidad_recuperada"]) for a in arreglos_rows)
    total_liquidacion = sum(safe_float(a["cantidad_liquidacion"]) for a in arreglos_rows)
    total_merma_arreglos = sum(safe_float(a["cantidad_merma"]) for a in arreglos_rows)
    fallado_pendiente = max(total_fallados - total_en_arreglo, 0)
    normal = max(qty - total_fallados - merma_qty, 0)

    return {
        "registro_id": registro_id,
        "n_corte": reg['n_corte'],
        "estado": reg['estado'],
        "pt_item": pt_item,
        "qty_terminada": qty,
        "merma_qty": merma_qty,
        **costos,
        "costo_cif": cif["cif_total"],
        "cif_detalle": cif,
        "costo_total": round(costo_total_con_cif, 2),
        "costo_unit_pt": round(costo_unitario_final, 6),
        "costo_unitario_final": round(costo_unitario_final, 6),
        "puede_cerrar": len(errores) == 0,
        "errores_validacion": errores,
        "resultado_final": {
            "normal": normal,
            "recuperado": total_recuperado,
            "liquidacion": total_liquidacion,
            "merma": merma_qty + total_merma_arreglos,
            "fallado_pendiente": fallado_pendiente,
            "total_fallados": total_fallados,
        },
    }


@router.post("/registros/{registro_id}/cierre-produccion")
async def ejecutar_cierre(registro_id: str, data: CierreRegistroInput, current_user: dict = Depends(get_current_user)):
    """Ejecuta el cierre: calcula costos, congela snapshot, crea ingreso PT, marca estado."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            reg = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
            if not reg:
                raise HTTPException(status_code=404, detail="Registro no encontrado")

            # Calcular qty
            if data.qty_terminada and data.qty_terminada > 0:
                qty_terminada = data.qty_terminada
            else:
                qty_terminada = await _get_qty_terminada(conn, registro_id)

            # Validaciones obligatorias
            errores = await _validar_pre_cierre(conn, reg, qty_terminada)
            if errores:
                raise HTTPException(status_code=400, detail="; ".join(errores))

            # Merma
            merma_qty = await _get_merma_qty(conn, registro_id)

            # Costos reales
            costos = await _calcular_costos(conn, registro_id)
            costo_mp = costos["costo_mp"]
            costo_servicios = costos["costo_servicios"]
            otros_costos = costos["otros_costos"]

            fecha_cierre = data.fecha or date.today()

            # CIF (Costos Indirectos de Fabricación)
            cif = await _calcular_cif(conn, registro_id, fecha_cierre)
            costo_cif = cif["cif_total"]

            costo_total_final = costos["costo_total_final"] + costo_cif
            costo_unitario_final = costo_total_final / qty_terminada if qty_terminada > 0 else 0
            empresa_id = data.empresa_id or reg.get('empresa_id') or 7
            # Validar FK empresa
            valid_empresa = await conn.fetchval("SELECT id FROM finanzas2.cont_empresa WHERE id = $1", empresa_id)
            if not valid_empresa:
                empresa_id = await conn.fetchval("SELECT id FROM finanzas2.cont_empresa ORDER BY id LIMIT 1") or 7

            usuario_cierre = current_user.get("username", current_user.get("nombre", "sistema"))
            ahora = datetime.now(timezone.utc)

            # Snapshot de auditoria (congelado, no se recalcula despues)
            snapshot = {
                "registro_id": registro_id,
                "n_corte": reg["n_corte"],
                "qty_planeada": safe_float(reg.get("cantidad_total")),
                "qty_terminada_real": qty_terminada,
                "merma_qty": merma_qty,
                "costo_mp": costo_mp,
                "costo_servicios": costo_servicios,
                "otros_costos": otros_costos,
                "costo_cif": costo_cif,
                "costo_total_final": round(costo_total_final, 2),
                "costo_unitario_final": round(costo_unitario_final, 6),
                "cerrado_por": usuario_cierre,
                "cerrado_at": ahora.isoformat(),
                "fuentes": {
                    "mp": costos["salidas_mp_detalle"],
                    "servicios": costos["movimientos_detalle"],
                    "otros": costos["otros_costos_detalle"],
                },
                "cif_detalle": {
                    "gastos_cif": cif["gastos_cif"],
                    "depreciacion": cif["depreciacion"],
                    "total_cif_mes": cif["total_cif_mes"],
                    "prendas_lote": cif["prendas_lote"],
                    "total_prendas_mes": cif["total_prendas_mes"],
                    "proporcion_pct": cif["proporcion_pct"],
                    "cif_asignado": cif["cif_asignado"],
                    "periodo": cif["periodo"],
                    "detalle": cif.get("detalle", []),
                },
            }

            # Crear ingreso PT en inventario
            ingreso_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_inventario_ingresos
                (id, item_id, cantidad, cantidad_disponible, costo_unitario,
                 proveedor, numero_documento, observaciones, fecha, empresa_id,
                 fin_origen_tipo, fin_origen_id, fin_numero_doc)
                VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            """,
                ingreso_id, reg['pt_item_id'], qty_terminada, costo_unitario_final,
                'PRODUCCION', f'CIERRE-{reg["n_corte"]}',
                f'Cierre produccion OP {reg["n_corte"]}', fecha_cierre,
                empresa_id, 'PROD_CIERRE', registro_id, f'OP-{reg["n_corte"]}'
            )

            # Actualizar stock PT
            await conn.execute("""
                UPDATE prod_inventario
                SET stock_actual = COALESCE(stock_actual, 0) + $1
                WHERE id = $2
            """, qty_terminada, reg['pt_item_id'])

            # Verificar si es re-cierre (registro reabierto previamente)
            existing_cierre = await conn.fetchrow(
                "SELECT id FROM prod_registro_cierre WHERE registro_id = $1", registro_id
            )

            if existing_cierre:
                # Re-cierre: actualizar el registro existente
                await conn.execute("""
                    UPDATE prod_registro_cierre SET
                        fecha = $2, qty_terminada = $3, merma_qty = $4,
                        costo_mp = $5, costo_servicios = $6, otros_costos = $7,
                        costo_cif = $8, costo_total = $9,
                        costo_unit_pt = $10, costo_unitario_final = $11,
                        pt_ingreso_id = $12, cerrado_por = $13,
                        observacion_cierre = $14, estado_cierre = 'CERRADO',
                        snapshot_json = $15, updated_at = NOW(),
                        reabierto_por = NULL, reabierto_at = NULL, motivo_reapertura = NULL
                    WHERE registro_id = $1
                """,
                    registro_id, fecha_cierre, qty_terminada, merma_qty,
                    costo_mp, costo_servicios, otros_costos,
                    costo_cif, costo_total_final,
                    costo_unitario_final, costo_unitario_final,
                    ingreso_id, usuario_cierre,
                    data.observacion_cierre, json.dumps(snapshot, default=str)
                )
                cierre_id = existing_cierre["id"]
            else:
                # Primer cierre
                cierre_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_registro_cierre
                    (id, empresa_id, registro_id, fecha, qty_terminada, merma_qty,
                     costo_mp, costo_servicios, otros_costos, costo_cif, costo_total,
                     costo_unit_pt, costo_unitario_final, pt_ingreso_id,
                     cerrado_por, observacion_cierre, estado_cierre, snapshot_json)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'CERRADO', $17)
                """,
                    cierre_id, empresa_id, registro_id, fecha_cierre,
                    qty_terminada, merma_qty,
                    costo_mp, costo_servicios, otros_costos, costo_cif, costo_total_final,
                    costo_unitario_final, costo_unitario_final, ingreso_id,
                    usuario_cierre, data.observacion_cierre,
                    json.dumps(snapshot, default=str)
                )

            # Liberar reservas pendientes
            reservas = await conn.fetch("""
                SELECT rl.id, rl.item_id, rl.talla_id,
                       rl.cantidad_reservada - rl.cantidad_liberada as pendiente
                FROM prod_inventario_reservas_linea rl
                JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
                WHERE r.registro_id = $1 AND r.estado = 'ACTIVA'
                AND rl.cantidad_reservada > rl.cantidad_liberada
            """, registro_id)

            for rl in reservas:
                pendiente = float(rl['pendiente'])
                if pendiente > 0:
                    await conn.execute("""
                        UPDATE prod_inventario_reservas_linea
                        SET cantidad_liberada = cantidad_reservada, updated_at = NOW()
                        WHERE id = $1
                    """, rl['id'])
                    await conn.execute("""
                        UPDATE prod_registro_requerimiento_mp
                        SET cantidad_reservada = cantidad_reservada - $1, updated_at = NOW()
                        WHERE registro_id = $2 AND item_id = $3
                        AND ($4::varchar IS NULL OR talla_id = $4)
                    """, pendiente, registro_id, rl['item_id'], rl['talla_id'])

            # Cerrar reservas
            await conn.execute("""
                UPDATE prod_inventario_reservas SET estado = 'CERRADA', updated_at = NOW()
                WHERE registro_id = $1 AND estado = 'ACTIVA'
            """, registro_id)

            # Actualizar estado del registro
            await conn.execute("""
                UPDATE prod_registros SET estado = 'CERRADA', estado_op = 'CERRADA' WHERE id = $1
            """, registro_id)

            # Auditoria (dentro de transaccion - atomico)
            await audit_log(conn, get_usuario(current_user), "CONFIRM", "produccion", "prod_registro_cierre", registro_id,
                datos_despues={"estado_cierre": "CERRADO", "costo_mp": round(costo_mp, 2),
                               "costo_servicios": round(costo_servicios, 2), "otros_costos": round(otros_costos, 2),
                               "costo_cif": round(costo_cif, 2),
                               "costo_total_final": round(costo_total_final, 2), "qty_terminada": qty_terminada},
                observacion=data.observacion_cierre, linea_negocio_id=reg.get('linea_negocio_id'),
                referencia=cierre_id)

            return {
                "message": f"Cierre completado para OP {reg['n_corte']}",
                "cierre_id": cierre_id,
                "ingreso_pt_id": ingreso_id,
                "qty_terminada": qty_terminada,
                "merma_qty": merma_qty,
                "costo_mp": round(costo_mp, 2),
                "costo_servicios": round(costo_servicios, 2),
                "otros_costos": round(otros_costos, 2),
                "costo_cif": round(costo_cif, 2),
                "cif_detalle": cif,
                "costo_total_final": round(costo_total_final, 2),
                "costo_unitario_final": round(costo_unitario_final, 6),
                "costo_total": round(costo_total_final, 2),
                "costo_unit_pt": round(costo_unitario_final, 6),
                "estado_cierre": "CERRADO",
                "snapshot_guardado": True,
            }


@router.get("/registros/{registro_id}/cierre-produccion")
async def get_cierre(registro_id: str, current_user: dict = Depends(get_current_user)):
    """Obtiene datos del cierre congelado si existe, incluyendo historial de reapertura."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cierre = await conn.fetchrow("""
            SELECT c.*, i.codigo as pt_codigo, i.nombre as pt_nombre
            FROM prod_registro_cierre c
            LEFT JOIN prod_inventario_ingresos ing ON c.pt_ingreso_id = ing.id
            LEFT JOIN prod_inventario i ON ing.item_id = i.id
            WHERE c.registro_id = $1
        """, registro_id)
        if not cierre:
            return None

        result = row_to_dict(cierre)

        # Parsear snapshot_json
        if result.get("snapshot_json"):
            if isinstance(result["snapshot_json"], str):
                try:
                    result["snapshot_json"] = json.loads(result["snapshot_json"])
                except (ValueError, TypeError):
                    pass

        return result


@router.post("/registros/{registro_id}/reabrir-cierre")
async def reabrir_cierre(registro_id: str, data: ReaperturaInput, current_user: dict = Depends(get_current_user)):
    """Reapertura controlada de un cierre. Requiere motivo. Revierte estado e ingreso PT."""
    if not data.motivo or len(data.motivo.strip()) < 5:
        raise HTTPException(status_code=400, detail="Debe proporcionar un motivo de reapertura (minimo 5 caracteres)")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            cierre = await conn.fetchrow(
                "SELECT * FROM prod_registro_cierre WHERE registro_id = $1", registro_id
            )
            if not cierre:
                raise HTTPException(status_code=404, detail="No existe cierre para este registro")

            if cierre.get("estado_cierre") != "CERRADO":
                raise HTTPException(status_code=400, detail="El cierre ya esta reabierto o no tiene estado CERRADO")

            # Validar que el PT generado no tenga movimientos posteriores
            if cierre.get("pt_ingreso_id"):
                salidas_pt = await conn.fetchval("""
                    SELECT COUNT(*) FROM prod_inventario_salidas
                    WHERE item_id = (SELECT item_id FROM prod_inventario_ingresos WHERE id = $1)
                      AND fecha >= $2
                """, cierre["pt_ingreso_id"], cierre.get("fecha"))
                if salidas_pt and salidas_pt > 0:
                    raise HTTPException(
                        status_code=409,
                        detail=f"No se puede reabrir: el PT generado ya tiene {salidas_pt} salida(s) de inventario posteriores al cierre. "
                               "Revierta esas salidas primero para evitar inconsistencias de stock."
                    )

            usuario = current_user.get("username", current_user.get("nombre", "sistema"))
            ahora = datetime.now(timezone.utc).replace(tzinfo=None)

            # Revertir ingreso PT (devolver stock y borrar ingreso)
            if cierre.get("pt_ingreso_id"):
                ingreso = await conn.fetchrow(
                    "SELECT item_id, cantidad FROM prod_inventario_ingresos WHERE id = $1",
                    cierre["pt_ingreso_id"]
                )
                if ingreso:
                    await conn.execute("""
                        UPDATE prod_inventario
                        SET stock_actual = COALESCE(stock_actual, 0) - $1
                        WHERE id = $2
                    """, float(ingreso["cantidad"]), ingreso["item_id"])

                # Quitar FK y luego borrar ingreso
                await conn.execute(
                    "UPDATE prod_registro_cierre SET pt_ingreso_id = NULL WHERE registro_id = $1",
                    registro_id
                )
                await conn.execute(
                    "DELETE FROM prod_inventario_ingresos WHERE id = $1",
                    cierre["pt_ingreso_id"]
                )

            # Marcar cierre como reabierto
            await conn.execute("""
                UPDATE prod_registro_cierre SET
                    estado_cierre = 'REABIERTO',
                    reabierto_por = $2,
                    reabierto_at = $3,
                    motivo_reapertura = $4,
                    updated_at = NOW()
                WHERE registro_id = $1
            """, registro_id, usuario, ahora, data.motivo.strip())

            # Devolver estado del registro al anterior (Producto Terminado como default razonable)
            await conn.execute("""
                UPDATE prod_registros SET estado = 'Producto Terminado', estado_op = 'EN_PROCESO' WHERE id = $1
            """, registro_id)

            # Auditoria (dentro de transaccion - atomico)
            reg_row = await conn.fetchrow("SELECT linea_negocio_id FROM prod_registros WHERE id = $1", registro_id)
            await audit_log(conn, get_usuario(current_user), "REOPEN", "produccion", "prod_registro_cierre", registro_id,
                datos_antes={"estado_cierre": "CERRADO", "costo_total": float(cierre.get('costo_total') or cierre.get('costo_total_final') or 0)},
                datos_despues={"estado_cierre": "REABIERTO", "motivo_reapertura": data.motivo.strip()},
                linea_negocio_id=reg_row['linea_negocio_id'] if reg_row else None)

            return {
                "message": "Cierre reabierto exitosamente",
                "registro_id": registro_id,
                "reabierto_por": usuario,
                "reabierto_at": ahora.isoformat(),
                "motivo": data.motivo.strip(),
            }


# ==================== PDF BALANCE ====================

@router.get("/registros/{registro_id}/balance-pdf")
async def get_balance_pdf(registro_id: str, current_user: dict = Depends(get_current_user)):
    """Genera PDF detallado del balance del lote"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from fastapi.responses import StreamingResponse
    import io

    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        modelo = await conn.fetchrow("SELECT m.nombre, ma.nombre as marca_nombre FROM prod_modelos m LEFT JOIN prod_marcas ma ON m.marca_id = ma.id WHERE m.id = $1", reg['modelo_id']) if reg['modelo_id'] else None
        tallas = await conn.fetch("SELECT talla_id, cantidad_real FROM prod_registro_tallas WHERE registro_id = $1", registro_id)
        total_prendas = sum(int(t['cantidad_real']) for t in tallas)

        tallas_info = json.loads(reg['tallas']) if reg.get('tallas') else []
        tallas_map_nombre = {t.get('id', t.get('talla_id', '')): t.get('nombre', t.get('talla', '')) for t in tallas_info}

        movs = await conn.fetch("""
            SELECT m.*, s.nombre as servicio_nombre
            FROM prod_movimientos_produccion m
            LEFT JOIN prod_servicios_produccion s ON m.servicio_id = s.id
            WHERE m.registro_id = $1 ORDER BY m.fecha_inicio
        """, registro_id)

        mermas = await conn.fetch("SELECT * FROM prod_mermas WHERE registro_id = $1", registro_id)
        total_mermas = sum(float(m.get('cantidad', 0) or 0) for m in mermas)

        cierre = await conn.fetchrow("SELECT * FROM prod_registro_cierre WHERE registro_id = $1", registro_id)

        salidas = await conn.fetch("""
            SELECT s.*, i.nombre as item_nombre, i.codigo as item_codigo
            FROM prod_inventario_salidas s
            JOIN prod_inventario i ON s.item_id = i.id
            WHERE s.registro_id = $1
        """, registro_id)
        total_costo_mp = sum(float(s.get('costo_total', 0) or 0) for s in salidas)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm, leftMargin=2*cm, rightMargin=2*cm)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=16, spaceAfter=6)
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Heading2'], fontSize=12, spaceAfter=4)
        normal = styles['Normal']

        elements = []

        elements.append(Paragraph(f"Balance del Lote - {reg['n_corte']}", title_style))
        elements.append(Paragraph(f"Modelo: {modelo['nombre'] if modelo else 'N/A'} | Marca: {modelo['marca_nombre'] if modelo and modelo.get('marca_nombre') else 'N/A'}", normal))
        estado_label = reg['estado']
        if cierre and cierre.get('estado_cierre') == 'CERRADO':
            estado_label += " [CERRADO]"
        elements.append(Paragraph(f"Estado: {estado_label} | Fecha: {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')}", normal))
        elements.append(Spacer(1, 0.5*cm))

        # Tallas
        elements.append(Paragraph("Distribucion por Tallas", subtitle_style))
        talla_data = [['Talla', 'Cantidad']]
        for t in tallas:
            nombre = tallas_map_nombre.get(t['talla_id'], t['talla_id'])
            talla_data.append([nombre, str(int(t['cantidad_real']))])
        talla_data.append(['TOTAL', str(total_prendas)])
        t_table = Table(talla_data, colWidths=[8*cm, 4*cm])
        t_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f0f9ff')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(t_table)
        elements.append(Spacer(1, 0.5*cm))

        # Balance cantidades
        elements.append(Paragraph("Balance de Cantidades", subtitle_style))
        en_produccion = total_prendas - int(total_mermas)
        bal_data = [
            ['Concepto', 'Cantidad'],
            ['Cantidad Inicial', str(total_prendas)],
            ['En Produccion', str(en_produccion)],
            ['Mermas / Faltantes', str(int(total_mermas))],
        ]
        bal_table = Table(bal_data, colWidths=[8*cm, 4*cm])
        bal_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(bal_table)
        elements.append(Spacer(1, 0.5*cm))

        # Movimientos
        if movs:
            elements.append(Paragraph("Movimientos de Produccion", subtitle_style))
            mov_data = [['Servicio', 'Enviado', 'Recibido', 'Fecha Envio', 'Estado']]
            for m in movs:
                fecha = str(m['fecha_inicio'])[:10] if m.get('fecha_inicio') else '-'
                estado = 'Completado' if m.get('fecha_fin') else 'En proceso'
                mov_data.append([
                    m.get('servicio_nombre', '-'),
                    str(int(m.get('cantidad_enviada', 0) or 0)),
                    str(int(m.get('cantidad_recibida', 0) or 0)),
                    fecha, estado,
                ])
            mov_table = Table(mov_data, colWidths=[4*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2.5*cm])
            mov_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(mov_table)
            elements.append(Spacer(1, 0.5*cm))

        # Materiales consumidos
        if salidas:
            elements.append(Paragraph("Materiales Consumidos", subtitle_style))
            sal_data = [['Material', 'Cantidad', 'Costo']]
            for s in salidas:
                sal_data.append([
                    s.get('item_nombre', '-'),
                    f"{float(s.get('cantidad', 0)):.1f}",
                    f"S/ {float(s.get('costo_total', 0) or 0):.2f}",
                ])
            sal_data.append(['TOTAL MATERIALES', '', f"S/ {total_costo_mp:.2f}"])
            sal_table = Table(sal_data, colWidths=[6*cm, 3*cm, 3*cm])
            sal_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f0f9ff')),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(sal_table)
            elements.append(Spacer(1, 0.5*cm))

        # Resumen costos (del cierre congelado si existe)
        if cierre:
            elements.append(Paragraph("Resumen de Costos (Congelado)", subtitle_style))
            cost_data = [
                ['Concepto', 'Monto'],
                ['Costo MP (FIFO)', f"S/ {safe_float(cierre.get('costo_mp')):.2f}"],
                ['Costo Servicios', f"S/ {safe_float(cierre.get('costo_servicios')):.2f}"],
                ['Otros Costos', f"S/ {safe_float(cierre.get('otros_costos')):.2f}"],
                ['CIF', f"S/ {safe_float(cierre.get('costo_cif')):.2f}"],
                ['COSTO TOTAL FINAL', f"S/ {safe_float(cierre.get('costo_total')):.2f}"],
                ['Costo Unitario Final', f"S/ {safe_float(cierre.get('costo_unitario_final') or cierre.get('costo_unit_pt')):.6f}"],
            ]
            cost_table = Table(cost_data, colWidths=[8*cm, 4*cm])
            cost_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#dcfce7')),
                ('FONTNAME', (0, -2), (-1, -1), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            elements.append(cost_table)

        doc.build(elements)
        buffer.seek(0)

        filename = f"Balance_{reg['n_corte'].replace(' ', '_')}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
