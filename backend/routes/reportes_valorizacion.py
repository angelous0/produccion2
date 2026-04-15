"""
Router: Reportes de Valorización (MP, WIP, PT)
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict

router = APIRouter(prefix="/api", tags=["reportes-valorizacion"])


@router.get("/reportes/inventario-mp-valorizado")
async def reporte_mp_valorizado(
    empresa_id: int = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """Reporte de inventario MP valorizado (stock disponible y su valor FIFO)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT 
                i.id, i.codigo, i.nombre, i.unidad_medida, i.control_por_rollos,
                i.stock_actual,
                -- Valor del stock actual: sum(cantidad_disponible * costo_unitario) de ingresos con stock
                COALESCE((
                    SELECT SUM(ing.cantidad_disponible * ing.costo_unitario)
                    FROM prod_inventario_ingresos ing
                    WHERE ing.item_id = i.id AND ing.cantidad_disponible > 0
                ), 0) as valor_stock,
                -- Costo promedio ponderado
                CASE WHEN i.stock_actual > 0 THEN
                    COALESCE((
                        SELECT SUM(ing.cantidad_disponible * ing.costo_unitario) / NULLIF(SUM(ing.cantidad_disponible), 0)
                        FROM prod_inventario_ingresos ing
                        WHERE ing.item_id = i.id AND ing.cantidad_disponible > 0
                    ), 0)
                ELSE 0 END as costo_promedio,
                -- Total reservado
                COALESCE((
                    SELECT SUM(rl.cantidad_reservada - rl.cantidad_liberada)
                    FROM prod_inventario_reservas_linea rl
                    JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
                    WHERE rl.item_id = i.id AND r.estado = 'ACTIVA'
                ), 0) as reservado
            FROM prod_inventario i
            WHERE i.tipo_articulo IS DISTINCT FROM 'PT'
            ORDER BY i.codigo
        """)
        
        items = []
        total_valor = 0
        for r in rows:
            d = row_to_dict(r)
            d['stock_actual'] = float(d['stock_actual'] or 0)
            d['valor_stock'] = round(float(d['valor_stock'] or 0), 2)
            d['costo_promedio'] = round(float(d['costo_promedio'] or 0), 4)
            d['reservado'] = float(d['reservado'] or 0)
            d['disponible'] = max(0, d['stock_actual'] - d['reservado'])
            total_valor += d['valor_stock']
            items.append(d)
        
        return {
            "items": items,
            "resumen": {
                "total_items": len(items),
                "total_valor": round(total_valor, 2)
            }
        }


@router.get("/reportes/wip-legacy")
async def reporte_wip(
    empresa_id: int = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """Reporte WIP: registros en proceso con costo MP + servicios + total"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registros = await conn.fetch("""
            SELECT r.id, r.n_corte, r.estado, r.fecha_creacion,
                   m.nombre as modelo_nombre, ma.nombre as marca_nombre,
                   r.pt_item_id,
                   pt.codigo as pt_codigo, pt.nombre as pt_nombre,
                   -- Total prendas
                   COALESCE((SELECT SUM(cantidad_real) FROM prod_registro_tallas WHERE registro_id = r.id), 0) as total_prendas,
                   -- Costo MP (salidas FIFO)
                   COALESCE((SELECT SUM(costo_total) FROM prod_inventario_salidas WHERE registro_id = r.id), 0) as costo_mp,
                   -- Costo Servicios
                   COALESCE((SELECT SUM(monto) FROM prod_registro_costos_servicio WHERE registro_id = r.id), 0) as costo_servicios
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_inventario pt ON r.pt_item_id = pt.id
            WHERE r.estado NOT IN ('CERRADA', 'ANULADA')
            ORDER BY r.fecha_creacion DESC
        """)
        
        items = []
        total_wip = 0
        for r in registros:
            d = row_to_dict(r)
            costo_mp = float(d['costo_mp'] or 0)
            costo_serv = float(d['costo_servicios'] or 0)
            costo_total = costo_mp + costo_serv
            d['costo_mp'] = round(costo_mp, 2)
            d['costo_servicios'] = round(costo_serv, 2)
            d['costo_total'] = round(costo_total, 2)
            d['total_prendas'] = int(d['total_prendas'] or 0)
            total_wip += costo_total
            items.append(d)
        
        return {
            "registros": items,
            "resumen": {
                "total_registros": len(items),
                "total_wip": round(total_wip, 2)
            }
        }


@router.get("/reportes/inventario-pt-valorizado")
async def reporte_pt_valorizado(
    empresa_id: int = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """Reporte inventario PT valorizado: stock PT y valoración por ingresos de cierre"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT 
                i.id, i.codigo, i.nombre, i.unidad_medida,
                i.stock_actual,
                -- Valor del stock (from ingresos con stock disponible)
                COALESCE((
                    SELECT SUM(ing.cantidad_disponible * ing.costo_unitario)
                    FROM prod_inventario_ingresos ing
                    WHERE ing.item_id = i.id AND ing.cantidad_disponible > 0
                ), 0) as valor_stock,
                -- Costo promedio
                CASE WHEN i.stock_actual > 0 THEN
                    COALESCE((
                        SELECT SUM(ing.cantidad_disponible * ing.costo_unitario) / NULLIF(SUM(ing.cantidad_disponible), 0)
                        FROM prod_inventario_ingresos ing
                        WHERE ing.item_id = i.id AND ing.cantidad_disponible > 0
                    ), 0)
                ELSE 0 END as costo_promedio,
                -- Count de OPs cerradas que ingresaron este PT
                (SELECT COUNT(*) FROM prod_registro_cierre c 
                 JOIN prod_inventario_ingresos ing ON c.pt_ingreso_id = ing.id 
                 WHERE ing.item_id = i.id) as ops_cerradas
            FROM prod_inventario i
            WHERE i.tipo_articulo = 'PT'
            ORDER BY i.codigo
        """)
        
        items = []
        total_valor = 0
        for r in rows:
            d = row_to_dict(r)
            d['stock_actual'] = float(d['stock_actual'] or 0)
            d['valor_stock'] = round(float(d['valor_stock'] or 0), 2)
            d['costo_promedio'] = round(float(d['costo_promedio'] or 0), 4)
            d['ops_cerradas'] = int(d['ops_cerradas'] or 0)
            total_valor += d['valor_stock']
            items.append(d)
        
        return {
            "items": items,
            "resumen": {
                "total_items": len(items),
                "total_valor": round(total_valor, 2)
            }
        }


@router.post("/inventario/ingresos/from-finanzas")
async def ingreso_from_finanzas(data: dict, current_user: dict = Depends(get_current_user)):
    """Endpoint para recibir ingresos de MP desde módulo de finanzas"""
    import uuid as _uuid
    
    required = ['empresa_id', 'item_id', 'cantidad', 'costo_unitario']
    for field in required:
        if field not in data:
            raise HTTPException(status_code=400, detail=f"Campo requerido: {field}")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify item exists
        item = await conn.fetchrow("SELECT id, control_por_rollos FROM prod_inventario WHERE id = $1", data['item_id'])
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado en inventario")
        
        # Idempotency check
        if data.get('fin_origen_tipo') and data.get('fin_origen_id'):
            existing = await conn.fetchrow("""
                SELECT id FROM prod_inventario_ingresos
                WHERE fin_origen_tipo = $1 AND fin_origen_id = $2 AND item_id = $3
            """, data['fin_origen_tipo'], data['fin_origen_id'], data['item_id'])
            if existing:
                raise HTTPException(status_code=409, detail="Ingreso ya registrado (duplicado)")
        
        async with conn.transaction():
            ingreso_id = str(_uuid.uuid4())
            cantidad = float(data['cantidad'])
            costo_unitario = float(data['costo_unitario'])
            
            await conn.execute("""
                INSERT INTO prod_inventario_ingresos 
                (id, item_id, cantidad, cantidad_disponible, costo_unitario, 
                 proveedor, numero_documento, observaciones, fecha, empresa_id,
                 fin_origen_tipo, fin_origen_id, fin_numero_doc)
                VALUES ($1, $2, $3, $3, $4, $5, $6, $7, COALESCE($8, NOW()), $9, $10, $11, $12)
            """,
                ingreso_id, data['item_id'], cantidad, costo_unitario,
                data.get('proveedor_texto', ''),
                data.get('fin_numero_doc', ''),
                data.get('observaciones', ''),
                data.get('fecha'),
                data['empresa_id'],
                data.get('fin_origen_tipo'),
                data.get('fin_origen_id'),
                data.get('fin_numero_doc')
            )
            
            # Update stock
            await conn.execute("""
                UPDATE prod_inventario SET stock_actual = COALESCE(stock_actual, 0) + $1
                WHERE id = $2
            """, cantidad, data['item_id'])
            
            return {
                "message": "Ingreso desde finanzas registrado",
                "ingreso_id": ingreso_id,
                "item_id": data['item_id'],
                "cantidad": cantidad,
                "costo_unitario": costo_unitario,
                "valor_total": round(cantidad * costo_unitario, 2)
            }


@router.get("/empresas")
async def get_empresas(current_user: dict = Depends(get_current_user)):
    """Lista empresas disponibles desde finanzas2"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, nombre, ruc FROM finanzas2.cont_empresa WHERE activo = true ORDER BY nombre
        """)
        return [row_to_dict(r) for r in rows]
