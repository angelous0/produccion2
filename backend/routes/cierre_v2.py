"""
Router: Cierre de Producción
Lógica de cierre de OP + Ingreso de PT
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime, date

router = APIRouter(prefix="/api", tags=["cierre"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth import get_current_user
from helpers import row_to_dict


# ==================== PYDANTIC MODELS ====================

class CierreRequest(BaseModel):
    cantidad_terminada: Optional[int] = None
    otros_costos: float = 0
    observaciones: str = ""


class CierreConfirmar(BaseModel):
    cantidad_terminada: int
    otros_costos: float = 0
    observaciones: str = ""
    almacen_destino_id: Optional[str] = None


# ==================== HELPER FUNCTIONS ====================

async def calcular_wip(conn, orden_id: str):
    """Calcula WIP actual de una orden"""
    wip = await conn.fetchrow("SELECT * FROM v_wip_resumen WHERE orden_id = $1", orden_id)
    if wip:
        return {
            "costo_mp": float(wip['costo_mp'] or 0),
            "costo_servicio": float(wip['costo_servicio'] or 0),
            "costo_ajuste": float(wip['costo_ajuste'] or 0),
            "costo_total": float(wip['costo_total'] or 0)
        }
    return {"costo_mp": 0, "costo_servicio": 0, "costo_ajuste": 0, "costo_total": 0}


async def get_total_prendas(conn, orden_id: str):
    """Obtiene total de prendas de una orden"""
    total = await conn.fetchval(
        "SELECT COALESCE(SUM(cantidad_real), 0) FROM prod_registro_tallas WHERE registro_id = $1",
        orden_id
    )
    return int(total or 0)


# ==================== ENDPOINTS ====================

@router.get("/ordenes/{orden_id}/cierre/preview")
async def preview_cierre(
    orden_id: str,
    otros_costos: float = Query(0),
    current_user: dict = Depends(get_current_user)
):
    """
    Preview del cierre de una orden.
    Muestra el costo acumulado y el costo unitario estimado.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        orden = await conn.fetchrow("""
            SELECT r.*, 
                   m.nombre as modelo_nombre,
                   pt.codigo as pt_codigo, pt.nombre as pt_nombre
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_inventario pt ON r.pt_item_id = pt.id
            WHERE r.id = $1
        """, orden_id)
        
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        
        # Check if already closed
        cierre_existente = await conn.fetchrow(
            "SELECT * FROM prod_registro_cierre WHERE registro_id = $1",
            orden_id
        )
        if cierre_existente:
            return {
                "ya_cerrada": True,
                "cierre": row_to_dict(cierre_existente),
                "message": "Esta orden ya fue cerrada"
            }
        
        # Calculate WIP
        wip = await calcular_wip(conn, orden_id)
        total_prendas = await get_total_prendas(conn, orden_id)
        
        costo_total = wip['costo_total'] + otros_costos
        costo_unitario = costo_total / total_prendas if total_prendas > 0 else 0
        
        # Get consumos detail
        consumos = await conn.fetch("""
            SELECT c.*, i.codigo as item_codigo, i.nombre as item_nombre
            FROM prod_consumo_mp c
            LEFT JOIN prod_inventario i ON c.item_id = i.id
            WHERE c.orden_id = $1
            ORDER BY c.fecha
        """, orden_id)
        
        # Get servicios detail
        servicios = await conn.fetch("""
            SELECT s.*, srv.nombre as servicio_nombre, p.nombre as persona_nombre
            FROM prod_servicio_orden s
            LEFT JOIN prod_servicios_produccion srv ON s.servicio_id = srv.id
            LEFT JOIN prod_personas_produccion p ON s.persona_id = p.id
            WHERE s.orden_id = $1
            ORDER BY s.fecha_inicio
        """, orden_id)
        
        return {
            "ya_cerrada": False,
            "orden_id": orden_id,
            "n_corte": orden['n_corte'],
            "modelo_nombre": orden.get('modelo_nombre'),
            "pt_item_id": orden.get('pt_item_id'),
            "pt_codigo": orden.get('pt_codigo'),
            "pt_nombre": orden.get('pt_nombre'),
            "total_prendas": total_prendas,
            "costos": {
                "costo_mp": round(wip['costo_mp'], 2),
                "costo_servicios": round(wip['costo_servicio'], 2),
                "costo_ajustes": round(wip['costo_ajuste'], 2),
                "otros_costos": round(otros_costos, 2),
                "costo_total": round(costo_total, 2),
                "costo_unitario": round(costo_unitario, 6)
            },
            "detalle_consumos": [row_to_dict(c) for c in consumos],
            "detalle_servicios": [row_to_dict(s) for s in servicios],
            "puede_cerrar": orden.get('pt_item_id') is not None and total_prendas > 0
        }


@router.post("/ordenes/{orden_id}/cierre")
async def ejecutar_cierre(
    orden_id: str,
    data: CierreConfirmar,
    current_user: dict = Depends(get_current_user)
):
    """
    Ejecuta el cierre de una orden de producción.
    1. Calcula costo final
    2. Crea registro de cierre
    3. Genera ingreso de PT
    4. Actualiza stock de PT
    5. Marca la orden como CERRADA
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Validate orden
            orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", orden_id)
            if not orden:
                raise HTTPException(status_code=404, detail="Orden no encontrada")
            
            if orden['estado_op'] == 'CERRADA':
                raise HTTPException(status_code=400, detail="Esta orden ya está cerrada")
            
            if orden['estado_op'] == 'ANULADA':
                raise HTTPException(status_code=400, detail="No se puede cerrar una orden anulada")
            
            if not orden.get('pt_item_id'):
                raise HTTPException(
                    status_code=400, 
                    detail="La orden no tiene asignado un Producto Terminado (PT)"
                )
            
            # Validate PT item
            pt_item = await conn.fetchrow(
                "SELECT * FROM prod_inventario WHERE id = $1",
                orden['pt_item_id']
            )
            if not pt_item:
                raise HTTPException(status_code=400, detail="Item PT no encontrado")
            
            if data.cantidad_terminada <= 0:
                raise HTTPException(status_code=400, detail="La cantidad terminada debe ser mayor a 0")
            
            # Calculate WIP
            wip = await calcular_wip(conn, orden_id)
            
            costo_mp = wip['costo_mp']
            costo_servicios = wip['costo_servicio']
            costo_total = wip['costo_total'] + data.otros_costos
            costo_unitario = costo_total / data.cantidad_terminada
            
            # Check if cierre already exists
            existing_cierre = await conn.fetchrow(
                "SELECT id FROM prod_registro_cierre WHERE registro_id = $1",
                orden_id
            )
            if existing_cierre:
                raise HTTPException(status_code=400, detail="Ya existe un cierre para esta orden")
            
            # Create cierre record
            cierre_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_registro_cierre 
                (id, empresa_id, registro_id, fecha, qty_terminada, 
                 costo_mp, costo_servicios, costo_total, costo_unit_pt)
                VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8)
            """, cierre_id, orden['empresa_id'], orden_id, data.cantidad_terminada,
                 costo_mp, costo_servicios, costo_total, costo_unitario)
            
            # Create ingreso de PT
            ingreso_pt_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_ingreso_pt 
                (id, empresa_id, cierre_id, orden_id, item_pt_id, cantidad, 
                 costo_unitario, costo_total, almacen_destino_id, fecha)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE)
            """, ingreso_pt_id, orden['empresa_id'], cierre_id, orden_id,
                 orden['pt_item_id'], data.cantidad_terminada, costo_unitario,
                 costo_total, data.almacen_destino_id)
            
            # Create ingreso in prod_inventario_ingresos for kardex
            ingreso_inv_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_inventario_ingresos 
                (id, item_id, fecha, cantidad, cantidad_disponible, costo_unitario, 
                 proveedor, observaciones, empresa_id)
                VALUES ($1, $2, CURRENT_DATE, $3, $3, $4, 'Producción Interna', $5, $6)
            """, ingreso_inv_id, orden['pt_item_id'], data.cantidad_terminada,
                 costo_unitario, f"Cierre OP {orden['n_corte']}. {data.observaciones}",
                 orden['empresa_id'])
            
            # Update prod_ingreso_pt with ingreso_inventario_id
            await conn.execute("""
                UPDATE prod_ingreso_pt SET ingreso_inventario_id = $1 WHERE id = $2
            """, ingreso_inv_id, ingreso_pt_id)
            
            # Update cierre with pt_ingreso_id
            await conn.execute("""
                UPDATE prod_registro_cierre SET pt_ingreso_id = $1 WHERE id = $2
            """, ingreso_inv_id, cierre_id)
            
            # Update PT item stock
            await conn.execute("""
                UPDATE prod_inventario 
                SET stock_actual = COALESCE(stock_actual, 0) + $1
                WHERE id = $2
            """, data.cantidad_terminada, orden['pt_item_id'])
            
            # Mark orden as CERRADA
            await conn.execute("""
                UPDATE prod_registros 
                SET estado_op = 'CERRADA', estado = 'CERRADA'
                WHERE id = $1
            """, orden_id)
            
            return {
                "success": True,
                "cierre_id": cierre_id,
                "ingreso_pt_id": ingreso_pt_id,
                "ingreso_inventario_id": ingreso_inv_id,
                "resumen": {
                    "orden_id": orden_id,
                    "n_corte": orden['n_corte'],
                    "pt_item_id": orden['pt_item_id'],
                    "pt_codigo": pt_item['codigo'],
                    "pt_nombre": pt_item['nombre'],
                    "cantidad_terminada": data.cantidad_terminada,
                    "costo_mp": round(costo_mp, 2),
                    "costo_servicios": round(costo_servicios, 2),
                    "otros_costos": round(data.otros_costos, 2),
                    "costo_total": round(costo_total, 2),
                    "costo_unitario": round(costo_unitario, 6)
                }
            }


@router.get("/ordenes/{orden_id}/cierre")
async def get_cierre(
    orden_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene el cierre de una orden si existe"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cierre = await conn.fetchrow("""
            SELECT c.*, 
                   r.n_corte, r.modelo_id,
                   pt.codigo as pt_codigo, pt.nombre as pt_nombre,
                   ipt.cantidad as pt_cantidad
            FROM prod_registro_cierre c
            JOIN prod_registros r ON c.registro_id = r.id
            LEFT JOIN prod_inventario pt ON r.pt_item_id = pt.id
            LEFT JOIN prod_ingreso_pt ipt ON ipt.cierre_id = c.id
            WHERE c.registro_id = $1
        """, orden_id)
        
        if not cierre:
            return {"existe": False, "message": "Esta orden no tiene cierre"}
        
        return {"existe": True, "cierre": row_to_dict(cierre)}


@router.post("/ordenes/{orden_id}/anular-cierre")
async def anular_cierre(
    orden_id: str,
    motivo: str = "",
    current_user: dict = Depends(get_current_user)
):
    """
    Anula el cierre de una orden (revierte el ingreso de PT).
    Operación delicada - solo si no hay movimientos posteriores del PT.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            cierre = await conn.fetchrow(
                "SELECT * FROM prod_registro_cierre WHERE registro_id = $1",
                orden_id
            )
            if not cierre:
                raise HTTPException(status_code=404, detail="No existe cierre para esta orden")
            
            orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", orden_id)
            
            # Get ingreso_pt
            ingreso_pt = await conn.fetchrow(
                "SELECT * FROM prod_ingreso_pt WHERE cierre_id = $1",
                cierre['id']
            )
            
            if ingreso_pt:
                # Check if PT has been consumed
                pt_stock = await conn.fetchval(
                    "SELECT stock_actual FROM prod_inventario WHERE id = $1",
                    ingreso_pt['item_pt_id']
                )
                if float(pt_stock or 0) < float(ingreso_pt['cantidad']):
                    raise HTTPException(
                        status_code=400,
                        detail="No se puede anular: el PT ya tiene movimientos de salida"
                    )
                
                # Revert PT stock
                await conn.execute("""
                    UPDATE prod_inventario 
                    SET stock_actual = stock_actual - $1
                    WHERE id = $2
                """, ingreso_pt['cantidad'], ingreso_pt['item_pt_id'])
                
                # Delete ingreso de inventario
                if ingreso_pt['ingreso_inventario_id']:
                    await conn.execute(
                        "DELETE FROM prod_inventario_ingresos WHERE id = $1",
                        ingreso_pt['ingreso_inventario_id']
                    )
                
                # Delete ingreso_pt
                await conn.execute("DELETE FROM prod_ingreso_pt WHERE id = $1", ingreso_pt['id'])
            
            # Delete cierre
            await conn.execute("DELETE FROM prod_registro_cierre WHERE id = $1", cierre['id'])
            
            # Reopen orden
            await conn.execute("""
                UPDATE prod_registros 
                SET estado_op = 'EN_PROCESO', estado = 'En Proceso'
                WHERE id = $1
            """, orden_id)
            
            return {
                "success": True,
                "message": f"Cierre anulado. Orden {orden['n_corte']} reabierta.",
                "motivo": motivo
            }
