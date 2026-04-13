"""
Router: Reportes de Producción
Incluye: Valorización MP, WIP, PT, Kardex
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import date, datetime
from io import BytesIO

router = APIRouter(prefix="/api", tags=["reportes"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict


# ==================== REPORTE MP VALORIZADO ====================

@router.get("/reportes/mp-valorizado")
async def get_mp_valorizado(
    empresa_id: int = Query(7),
    categoria: Optional[str] = None,
    linea_negocio_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Inventario de Materia Prima valorizado.
    Muestra stock actual con costo FIFO.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["i.empresa_id = $1", "i.tipo_item IN ('MP', 'AVIO')"]
        params = [empresa_id]
        idx = 2

        if categoria:
            conditions.append(f"i.categoria = ${idx}")
            params.append(categoria)
            idx += 1

        if linea_negocio_id:
            if linea_negocio_id == "global":
                conditions.append("i.linea_negocio_id IS NULL")
            else:
                conditions.append(f"(i.linea_negocio_id = ${idx} OR i.linea_negocio_id IS NULL)")
                params.append(int(linea_negocio_id))
                idx += 1

        where = " AND ".join(conditions)

        rows = await conn.fetch(f"""
            WITH stock_valorizado AS (
                SELECT
                    i.id,
                    i.codigo,
                    i.nombre,
                    i.tipo_item,
                    i.categoria,
                    i.unidad_medida,
                    i.control_por_rollos,
                    i.linea_negocio_id,
                    COALESCE(i.stock_actual, 0) as stock_actual,
                    -- Costo promedio ponderado desde ingresos disponibles
                    COALESCE((
                        SELECT SUM(ing.cantidad_disponible * ing.costo_unitario) / NULLIF(SUM(ing.cantidad_disponible), 0)
                        FROM prod_inventario_ingresos ing
                        WHERE ing.item_id = i.id AND ing.cantidad_disponible > 0
                    ), 0) as costo_promedio,
                    -- Valor total del stock
                    COALESCE((
                        SELECT SUM(ing.cantidad_disponible * ing.costo_unitario)
                        FROM prod_inventario_ingresos ing
                        WHERE ing.item_id = i.id AND ing.cantidad_disponible > 0
                    ), 0) as valor_total,
                    -- Total reservado
                    COALESCE((
                        SELECT SUM(rl.cantidad_reservada - rl.cantidad_liberada)
                        FROM prod_inventario_reservas_linea rl
                        JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
                        WHERE rl.item_id = i.id AND r.estado = 'ACTIVA'
                    ), 0) as total_reservado
                FROM prod_inventario i
                WHERE {where}
            )
            SELECT *,
                   stock_actual - total_reservado as disponible
            FROM stock_valorizado
            WHERE stock_actual > 0 OR total_reservado > 0
            ORDER BY tipo_item, categoria, nombre
        """, *params)
        
        items = []
        total_valor = 0
        
        for r in rows:
            d = row_to_dict(r)
            d['stock_actual'] = float(d.get('stock_actual') or 0)
            d['costo_promedio'] = float(d.get('costo_promedio') or 0)
            d['valor_total'] = float(d.get('valor_total') or 0)
            d['total_reservado'] = float(d.get('total_reservado') or 0)
            d['disponible'] = float(d.get('disponible') or 0)
            
            items.append(d)
            total_valor += d['valor_total']
        
        return {
            "fecha": datetime.now().isoformat(),
            "empresa_id": empresa_id,
            "items": items,
            "resumen": {
                "total_items": len(items),
                "valor_total_inventario": round(total_valor, 2)
            }
        }


# ==================== REPORTE WIP VALORIZADO ====================

@router.get("/reportes/wip")
async def get_wip_valorizado(
    empresa_id: int = Query(7),
    linea_negocio_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Trabajo en Proceso (WIP) valorizado.
    Calcula WIP directamente desde salidas de inventario y movimientos de producción.
    Solo muestra órdenes con estado_op IN ('ABIERTA', 'EN_PROCESO').
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["r.empresa_id = $1", "r.estado_op IN ('ABIERTA', 'EN_PROCESO')"]
        params = [empresa_id]
        idx = 2

        if linea_negocio_id:
            if linea_negocio_id == "global":
                conditions.append("r.linea_negocio_id IS NULL")
            else:
                conditions.append(f"(r.linea_negocio_id = ${idx} OR r.linea_negocio_id IS NULL)")
                params.append(int(linea_negocio_id))
                idx += 1

        where = " AND ".join(conditions)

        rows = await conn.fetch(f"""
            SELECT
                r.id,
                r.n_corte,
                r.estado,
                r.estado_op,
                m.nombre as modelo_nombre,
                pt.codigo as pt_codigo,
                pt.nombre as pt_nombre,
                r.fecha_creacion,
                r.linea_negocio_id,
                COALESCE((
                    SELECT SUM(cantidad_real) FROM prod_registro_tallas WHERE registro_id = r.id
                ), 0) as total_prendas,
                COALESCE((
                    SELECT SUM(s.costo_total) FROM prod_inventario_salidas s WHERE s.registro_id = r.id
                ), 0) as costo_mp,
                COALESCE((
                    SELECT SUM(mp.costo_calculado) FROM prod_movimientos_produccion mp WHERE mp.registro_id = r.id
                ), 0) as costo_servicio
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_inventario pt ON r.pt_item_id = pt.id
            WHERE {where}
            ORDER BY r.fecha_creacion DESC
        """, *params)
        
        ordenes = []
        total_mp = 0
        total_servicio = 0
        total_wip = 0
        
        for r in rows:
            d = row_to_dict(r)
            d['total_prendas'] = int(d.get('total_prendas') or 0)
            d['costo_mp'] = float(d.get('costo_mp') or 0)
            d['costo_servicio'] = float(d.get('costo_servicio') or 0)
            d['costo_wip'] = round(d['costo_mp'] + d['costo_servicio'], 2)
            
            ordenes.append(d)
            total_mp += d['costo_mp']
            total_servicio += d['costo_servicio']
            total_wip += d['costo_wip']
        
        return {
            "fecha": datetime.now().isoformat(),
            "empresa_id": empresa_id,
            "ordenes": ordenes,
            "resumen": {
                "total_ordenes_en_proceso": len(ordenes),
                "total_costo_mp": round(total_mp, 2),
                "total_costo_servicio": round(total_servicio, 2),
                "total_wip": round(total_wip, 2)
            }
        }


# ==================== REPORTE PT VALORIZADO ====================

@router.get("/reportes/pt-valorizado")
async def get_pt_valorizado(
    empresa_id: int = Query(7),
    categoria: Optional[str] = None,
    linea_negocio_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Inventario de Producto Terminado valorizado.
    Muestra stock de PT con costo de producción.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["i.empresa_id = $1", "i.tipo_item = 'PT'"]
        params = [empresa_id]
        idx = 2

        if categoria:
            conditions.append(f"i.categoria = ${idx}")
            params.append(categoria)
            idx += 1

        if linea_negocio_id:
            if linea_negocio_id == "global":
                conditions.append("i.linea_negocio_id IS NULL")
            else:
                conditions.append(f"(i.linea_negocio_id = ${idx} OR i.linea_negocio_id IS NULL)")
                params.append(int(linea_negocio_id))
                idx += 1

        where = " AND ".join(conditions)

        rows = await conn.fetch(f"""
            WITH pt_stock AS (
                SELECT
                    i.id,
                    i.codigo,
                    i.nombre,
                    i.unidad_medida,
                    i.linea_negocio_id,
                    COALESCE(i.stock_actual, 0) as stock_actual,
                    COALESCE((
                        SELECT SUM(ing.cantidad_disponible * ing.costo_unitario) / NULLIF(SUM(ing.cantidad_disponible), 0)
                        FROM prod_inventario_ingresos ing
                        WHERE ing.item_id = i.id AND ing.cantidad_disponible > 0
                    ), 0) as costo_promedio,
                    COALESCE((
                        SELECT SUM(ing.cantidad_disponible * ing.costo_unitario)
                        FROM prod_inventario_ingresos ing
                        WHERE ing.item_id = i.id AND ing.cantidad_disponible > 0
                    ), 0) as valor_total,
                    (
                        SELECT COUNT(*) FROM prod_registro_cierre c
                        JOIN prod_registros r ON c.registro_id = r.id
                        WHERE r.pt_item_id = i.id
                    ) as total_cierres
                FROM prod_inventario i
                WHERE {where}
            )
            SELECT * FROM pt_stock
            WHERE stock_actual > 0 OR total_cierres > 0
            ORDER BY codigo
        """, *params)
        
        items = []
        total_valor = 0
        total_unidades = 0
        
        for r in rows:
            d = row_to_dict(r)
            d['stock_actual'] = float(d.get('stock_actual') or 0)
            d['costo_promedio'] = float(d.get('costo_promedio') or 0)
            d['valor_total'] = float(d.get('valor_total') or 0)
            
            items.append(d)
            total_valor += d['valor_total']
            total_unidades += d['stock_actual']
        
        return {
            "fecha": datetime.now().isoformat(),
            "empresa_id": empresa_id,
            "items": items,
            "resumen": {
                "total_skus": len(items),
                "total_unidades": int(total_unidades),
                "valor_total_pt": round(total_valor, 2)
            }
        }


# ==================== KARDEX POR ITEM ====================

@router.get("/reportes/kardex/{item_id}")
async def get_kardex_item(
    item_id: str,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Kardex de movimientos de un item.
    Incluye ingresos, salidas y ajustes ordenados cronológicamente.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        
        # Build date filters
        date_filter = ""
        params = [item_id]
        if fecha_desde:
            params.append(fecha_desde)
            date_filter += f" AND fecha >= ${len(params)}"
        if fecha_hasta:
            params.append(fecha_hasta)
            date_filter += f" AND fecha <= ${len(params)}"
        
        # Get all movements
        ingresos = await conn.fetch(f"""
            SELECT 
                id, fecha, 'INGRESO' as tipo_mov, 
                cantidad, costo_unitario, costo_total,
                proveedor as referencia, observaciones
            FROM prod_inventario_ingresos
            WHERE item_id = $1 {date_filter}
        """, *params)
        
        salidas = await conn.fetch(f"""
            SELECT 
                id, fecha, 'SALIDA' as tipo_mov,
                -cantidad as cantidad, costo_unitario, -costo_total as costo_total,
                COALESCE(r.n_corte, observaciones) as referencia, s.observaciones
            FROM prod_inventario_salidas s
            LEFT JOIN prod_registros r ON s.registro_id = r.id
            WHERE s.item_id = $1 {date_filter.replace('fecha', 's.fecha')}
        """, *params)
        
        consumos = await conn.fetch(f"""
            SELECT 
                c.id, c.fecha, 'CONSUMO' as tipo_mov,
                -c.cantidad as cantidad, c.costo_unitario, -c.costo_total as costo_total,
                r.n_corte as referencia, c.observaciones
            FROM prod_consumo_mp c
            LEFT JOIN prod_registros r ON c.orden_id = r.id
            WHERE c.item_id = $1 {date_filter.replace('fecha', 'c.fecha')}
        """, *params)
        
        ajustes = await conn.fetch(f"""
            SELECT 
                id, fecha, 'AJUSTE' as tipo_mov,
                diferencia as cantidad, 0 as costo_unitario, 0 as costo_total,
                motivo as referencia, observaciones
            FROM prod_inventario_ajustes
            WHERE item_id = $1 {date_filter}
        """, *params)
        
        # Combine and sort
        movimientos = []
        for m in list(ingresos) + list(salidas) + list(consumos) + list(ajustes):
            d = row_to_dict(m)
            d['cantidad'] = float(d.get('cantidad') or 0)
            d['costo_unitario'] = float(d.get('costo_unitario') or 0)
            d['costo_total'] = float(d.get('costo_total') or 0)
            movimientos.append(d)
        
        movimientos.sort(key=lambda x: (x.get('fecha') or datetime.min, x.get('id', '')))
        
        # Calculate running balance
        saldo = 0
        for m in movimientos:
            saldo += m['cantidad']
            m['saldo'] = round(saldo, 4)
        
        return {
            "item_id": item_id,
            "codigo": item['codigo'],
            "nombre": item['nombre'],
            "tipo_item": item.get('tipo_item', 'MP'),
            "unidad_medida": item['unidad_medida'],
            "stock_actual": float(item['stock_actual'] or 0),
            "filtros": {
                "fecha_desde": str(fecha_desde) if fecha_desde else None,
                "fecha_hasta": str(fecha_hasta) if fecha_hasta else None
            },
            "movimientos": movimientos,
            "total_movimientos": len(movimientos)
        }


# ==================== REPORTE DE ÓRDENES ====================

@router.get("/reportes/ordenes")
async def get_reporte_ordenes(
    empresa_id: int = Query(7),
    estado_op: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Reporte de órdenes de producción con costos.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT 
                r.id,
                r.n_corte,
                r.estado_op,
                e.nombre as etapa_nombre,
                m.nombre as modelo_nombre,
                ma.nombre as marca_nombre,
                pt.codigo as pt_codigo,
                pt.nombre as pt_nombre,
                r.fecha_creacion,
                r.urgente,
                COALESCE((
                    SELECT SUM(cantidad_real) FROM prod_registro_tallas WHERE registro_id = r.id
                ), 0) as total_prendas,
                COALESCE(w.costo_mp, 0) as costo_mp,
                COALESCE(w.costo_servicio, 0) as costo_servicio,
                COALESCE(w.costo_total, 0) as costo_total,
                c.fecha as fecha_cierre,
                c.costo_unit_pt
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_inventario pt ON r.pt_item_id = pt.id
            LEFT JOIN prod_orden_etapa e ON r.etapa_actual_id = e.id
            LEFT JOIN v_wip_resumen w ON r.id = w.orden_id
            LEFT JOIN prod_registro_cierre c ON c.registro_id = r.id
            WHERE r.empresa_id = $1
        """
        params = [empresa_id]
        
        if estado_op:
            params.append(estado_op)
            query += f" AND r.estado_op = ${len(params)}"
        
        if fecha_desde:
            params.append(fecha_desde)
            query += f" AND r.fecha_creacion >= ${len(params)}"
        
        if fecha_hasta:
            params.append(fecha_hasta)
            query += f" AND r.fecha_creacion <= ${len(params)}"
        
        query += " ORDER BY r.fecha_creacion DESC"
        
        rows = await conn.fetch(query, *params)
        
        ordenes = []
        for r in rows:
            d = row_to_dict(r)
            d['total_prendas'] = int(d.get('total_prendas') or 0)
            d['costo_mp'] = float(d.get('costo_mp') or 0)
            d['costo_servicio'] = float(d.get('costo_servicio') or 0)
            d['costo_total'] = float(d.get('costo_total') or 0)
            d['costo_unit_pt'] = float(d.get('costo_unit_pt') or 0)
            ordenes.append(d)
        
        # Summary by estado
        by_estado = {}
        for o in ordenes:
            estado = o['estado_op']
            if estado not in by_estado:
                by_estado[estado] = {"count": 0, "costo_total": 0}
            by_estado[estado]["count"] += 1
            by_estado[estado]["costo_total"] += o['costo_total']
        
        return {
            "fecha": datetime.now().isoformat(),
            "empresa_id": empresa_id,
            "filtros": {
                "estado_op": estado_op,
                "fecha_desde": str(fecha_desde) if fecha_desde else None,
                "fecha_hasta": str(fecha_hasta) if fecha_hasta else None
            },
            "ordenes": ordenes,
            "resumen_por_estado": by_estado,
            "total_ordenes": len(ordenes)
        }


# ==================== RESUMEN GENERAL ====================

@router.get("/reportes/resumen-general")
async def get_resumen_general(
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user)
):
    """
    Resumen general del módulo de producción.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # MP value
        mp_valor = await conn.fetchval("""
            SELECT COALESCE(SUM(ing.cantidad_disponible * ing.costo_unitario), 0)
            FROM prod_inventario_ingresos ing
            JOIN prod_inventario i ON ing.item_id = i.id
            WHERE i.empresa_id = $1 AND i.tipo_item IN ('MP', 'AVIO') AND ing.cantidad_disponible > 0
        """, empresa_id)
        
        # WIP value - Solo órdenes ABIERTA/EN_PROCESO
        wip_valor = await conn.fetchval("""
            SELECT COALESCE(SUM(w.costo_total), 0)
            FROM v_wip_resumen w
            JOIN prod_registros r ON w.orden_id = r.id
            WHERE r.empresa_id = $1 AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
        """, empresa_id)
        
        # PT value
        pt_valor = await conn.fetchval("""
            SELECT COALESCE(SUM(ing.cantidad_disponible * ing.costo_unitario), 0)
            FROM prod_inventario_ingresos ing
            JOIN prod_inventario i ON ing.item_id = i.id
            WHERE i.empresa_id = $1 AND i.tipo_item = 'PT' AND ing.cantidad_disponible > 0
        """, empresa_id)
        
        # Ordenes counts
        ordenes_stats = await conn.fetch("""
            SELECT estado_op, COUNT(*) as count
            FROM prod_registros
            WHERE empresa_id = $1
            GROUP BY estado_op
        """, empresa_id)
        
        ordenes_by_estado = {r['estado_op']: int(r['count']) for r in ordenes_stats}
        
        return {
            "fecha": datetime.now().isoformat(),
            "empresa_id": empresa_id,
            "inventario": {
                "mp_valor": round(float(mp_valor or 0), 2),
                "wip_valor": round(float(wip_valor or 0), 2),
                "pt_valor": round(float(pt_valor or 0), 2),
                "total": round(float(mp_valor or 0) + float(wip_valor or 0) + float(pt_valor or 0), 2)
            },
            "ordenes": ordenes_by_estado,
            "total_ordenes": sum(ordenes_by_estado.values())
        }
