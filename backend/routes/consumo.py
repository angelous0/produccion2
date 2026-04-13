"""
Router: Consumo de Materia Prima
CRUD para prod_consumo_mp + WIP
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime, date

router = APIRouter(prefix="/api", tags=["consumo"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict, validar_registro_activo


# ==================== PYDANTIC MODELS ====================

class ConsumoCreate(BaseModel):
    empresa_id: int = 7
    orden_id: str
    item_id: str
    rollo_id: Optional[str] = None
    talla_id: Optional[str] = None
    cantidad: float
    fecha: Optional[date] = None
    observaciones: str = ""


class ConsumoMultiRollo(BaseModel):
    empresa_id: int = 7
    orden_id: str
    item_id: str
    talla_id: Optional[str] = None
    rollos: List[dict]  # [{"rollo_id": "...", "cantidad": 10}, ...]
    fecha: Optional[date] = None
    observaciones: str = ""


# ==================== HELPER FUNCTIONS ====================

async def calcular_costo_fifo(conn, item_id: str, cantidad: float, rollo_id: str = None):
    """
    Calcula el costo FIFO para una cantidad de item.
    Si rollo_id se proporciona, usa el costo del rollo.
    Si no, usa FIFO desde ingresos.
    """
    if rollo_id:
        # Get cost from rollo
        rollo = await conn.fetchrow("""
            SELECT costo_unitario_metro, metros_saldo 
            FROM prod_inventario_rollos WHERE id = $1
        """, rollo_id)
        if rollo:
            costo_unit = float(rollo['costo_unitario_metro'] or 0)
            return costo_unit, cantidad * costo_unit
    
    # FIFO desde ingresos
    ingresos = await conn.fetch("""
        SELECT id, cantidad_disponible, costo_unitario 
        FROM prod_inventario_ingresos 
        WHERE item_id = $1 AND cantidad_disponible > 0
        ORDER BY fecha ASC
    """, item_id)
    
    cantidad_restante = cantidad
    costo_total = 0
    detalle = []
    
    for ing in ingresos:
        if cantidad_restante <= 0:
            break
        
        disponible = float(ing['cantidad_disponible'])
        costo_unit = float(ing['costo_unitario'] or 0)
        consumir = min(disponible, cantidad_restante)
        
        costo_total += consumir * costo_unit
        detalle.append({
            "ingreso_id": ing['id'],
            "cantidad": consumir,
            "costo_unitario": costo_unit
        })
        cantidad_restante -= consumir
    
    costo_promedio = costo_total / cantidad if cantidad > 0 else 0
    return costo_promedio, costo_total, detalle


async def actualizar_stock_fifo(conn, item_id: str, cantidad: float, rollo_id: str = None):
    """
    Actualiza stock usando FIFO.
    Retorna el costo total y detalle FIFO.
    """
    costo_total = 0
    detalle = []
    
    if rollo_id:
        # Descontar del rollo
        rollo = await conn.fetchrow("SELECT * FROM prod_inventario_rollos WHERE id = $1", rollo_id)
        if not rollo:
            raise HTTPException(status_code=404, detail="Rollo no encontrado")
        
        metros_saldo = float(rollo['metros_saldo'] or 0)
        if metros_saldo < cantidad:
            raise HTTPException(
                status_code=400, 
                detail=f"Metraje insuficiente en rollo. Disponible: {metros_saldo}"
            )
        
        costo_unit = float(rollo['costo_unitario_metro'] or 0)
        costo_total = cantidad * costo_unit
        
        await conn.execute("""
            UPDATE prod_inventario_rollos 
            SET metros_saldo = metros_saldo - $1,
                metraje_disponible = metraje_disponible - $1,
                estado = CASE WHEN metros_saldo - $1 <= 0 THEN 'AGOTADO' ELSE estado END
            WHERE id = $2
        """, cantidad, rollo_id)
        
        # Also update ingreso
        await conn.execute("""
            UPDATE prod_inventario_ingresos 
            SET cantidad_disponible = cantidad_disponible - $1
            WHERE id = $2
        """, cantidad, rollo['ingreso_id'])
        
        detalle.append({
            "rollo_id": rollo_id,
            "cantidad": cantidad,
            "costo_unitario": costo_unit
        })
    else:
        # FIFO desde ingresos
        ingresos = await conn.fetch("""
            SELECT * FROM prod_inventario_ingresos 
            WHERE item_id = $1 AND cantidad_disponible > 0
            ORDER BY fecha ASC
        """, item_id)
        
        cantidad_restante = cantidad
        for ing in ingresos:
            if cantidad_restante <= 0:
                break
            
            disponible = float(ing['cantidad_disponible'])
            costo_unit = float(ing['costo_unitario'] or 0)
            consumir = min(disponible, cantidad_restante)
            
            await conn.execute("""
                UPDATE prod_inventario_ingresos 
                SET cantidad_disponible = cantidad_disponible - $1
                WHERE id = $2
            """, consumir, ing['id'])
            
            costo_total += consumir * costo_unit
            detalle.append({
                "ingreso_id": ing['id'],
                "cantidad": consumir,
                "costo_unitario": costo_unit
            })
            cantidad_restante -= consumir
        
        if cantidad_restante > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente. Faltaron: {cantidad_restante}"
            )
    
    # Update item stock
    await conn.execute("""
        UPDATE prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2
    """, cantidad, item_id)
    
    return costo_total, detalle


async def registrar_wip(conn, empresa_id: int, orden_id: str, origen_tipo: str, 
                        origen_id: str, costo: float, fecha, descripcion: str):
    """Registra un movimiento WIP"""
    wip_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO prod_wip_movimiento 
        (id, empresa_id, orden_id, origen_tipo, origen_id, costo, fecha, descripcion)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    """, wip_id, empresa_id, orden_id, origen_tipo, origen_id, costo, fecha, descripcion)
    return wip_id


# ==================== ENDPOINTS ====================

@router.get("/consumos")
async def get_consumos(
    orden_id: Optional[str] = None,
    item_id: Optional[str] = None,
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user)
):
    """Lista consumos de MP con filtros"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT c.*, 
                   i.codigo as item_codigo, i.nombre as item_nombre, i.unidad_medida,
                   r.n_corte as orden_codigo,
                   ro.numero_rollo, ro.tono as rollo_tono
            FROM prod_consumo_mp c
            LEFT JOIN prod_inventario i ON c.item_id = i.id
            LEFT JOIN prod_registros r ON c.orden_id = r.id
            LEFT JOIN prod_inventario_rollos ro ON c.rollo_id = ro.id
            WHERE c.empresa_id = $1
        """
        params = [empresa_id]
        
        if orden_id:
            params.append(orden_id)
            query += f" AND c.orden_id = ${len(params)}"
        
        if item_id:
            params.append(item_id)
            query += f" AND c.item_id = ${len(params)}"
        
        query += " ORDER BY c.fecha DESC, c.created_at DESC"
        
        rows = await conn.fetch(query, *params)
        return [row_to_dict(r) for r in rows]


@router.get("/consumos/{consumo_id}")
async def get_consumo(
    consumo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene detalle de un consumo"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        consumo = await conn.fetchrow("""
            SELECT c.*, 
                   i.codigo as item_codigo, i.nombre as item_nombre,
                   r.n_corte as orden_codigo,
                   ro.numero_rollo, ro.tono
            FROM prod_consumo_mp c
            LEFT JOIN prod_inventario i ON c.item_id = i.id
            LEFT JOIN prod_registros r ON c.orden_id = r.id
            LEFT JOIN prod_inventario_rollos ro ON c.rollo_id = ro.id
            WHERE c.id = $1
        """, consumo_id)
        
        if not consumo:
            raise HTTPException(status_code=404, detail="Consumo no encontrado")
        
        return row_to_dict(consumo)


@router.post("/consumos")
async def create_consumo(
    data: ConsumoCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Registra un consumo de MP para una orden.
    - Valida stock disponible
    - Aplica FIFO o consume del rollo especificado
    - Actualiza WIP
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Validate orden
            orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", data.orden_id)
            if not orden:
                raise HTTPException(status_code=404, detail="Orden no encontrada")
            validar_registro_activo(orden, campo_estado='estado_op', contexto='registrar consumo')

            # Validate item
            item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", data.item_id)
            if not item:
                raise HTTPException(status_code=404, detail="Item no encontrado")

            if item['tipo_item'] == 'SERVICIO':
                raise HTTPException(
                    status_code=400, 
                    detail="No se puede consumir un SERVICIO como materia prima"
                )
            
            # Validate rollo if item controls by rollos
            if item['control_por_rollos']:
                if not data.rollo_id:
                    raise HTTPException(
                        status_code=400, 
                        detail="Este item requiere seleccionar un rollo"
                    )
                rollo = await conn.fetchrow(
                    "SELECT * FROM prod_inventario_rollos WHERE id = $1",
                    data.rollo_id
                )
                if not rollo or rollo['item_id'] != data.item_id:
                    raise HTTPException(status_code=400, detail="Rollo inválido para este item")
            else:
                data.rollo_id = None  # Clear rollo_id if item doesn't use rollos
            
            # Actualizar stock y obtener costo FIFO
            fecha_consumo = data.fecha or date.today()
            costo_total, detalle = await actualizar_stock_fifo(
                conn, data.item_id, data.cantidad, data.rollo_id
            )
            costo_unitario = costo_total / data.cantidad if data.cantidad > 0 else 0
            
            # Create consumo record
            consumo_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_consumo_mp 
                (id, empresa_id, orden_id, item_id, rollo_id, talla_id, 
                 cantidad, costo_unitario, costo_total, fecha, observaciones)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """, consumo_id, data.empresa_id, data.orden_id, data.item_id,
                 data.rollo_id, data.talla_id, data.cantidad, costo_unitario,
                 costo_total, fecha_consumo, data.observaciones)
            
            # Register WIP
            await registrar_wip(
                conn, data.empresa_id, data.orden_id, 'CONSUMO_MP', consumo_id,
                costo_total, fecha_consumo, f"Consumo {item['nombre']}: {data.cantidad} {item['unidad_medida']}"
            )
            
            # Update requerimiento if exists
            if data.talla_id:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp 
                    SET cantidad_consumida = cantidad_consumida + $1, updated_at = NOW()
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, data.cantidad, data.orden_id, data.item_id, data.talla_id)
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp 
                    SET cantidad_consumida = cantidad_consumida + $1, updated_at = NOW()
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, data.cantidad, data.orden_id, data.item_id)
            
            return {
                "id": consumo_id,
                "orden_id": data.orden_id,
                "item_id": data.item_id,
                "rollo_id": data.rollo_id,
                "cantidad": data.cantidad,
                "costo_unitario": round(costo_unitario, 6),
                "costo_total": round(costo_total, 2),
                "detalle_fifo": detalle
            }


@router.post("/consumos/multi-rollo")
async def create_consumo_multi_rollo(
    data: ConsumoMultiRollo,
    current_user: dict = Depends(get_current_user)
):
    """
    Registra consumo de múltiples rollos en una sola operación.
    Cada rollo genera un registro de consumo separado.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Validate orden
            orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", data.orden_id)
            if not orden:
                raise HTTPException(status_code=404, detail="Orden no encontrada")
            validar_registro_activo(orden, campo_estado='estado_op', contexto='registrar consumo')

            # Validate item
            item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", data.item_id)
            if not item:
                raise HTTPException(status_code=404, detail="Item no encontrado")
            if not item['control_por_rollos']:
                raise HTTPException(
                    status_code=400, 
                    detail="Este item no controla por rollos. Use el endpoint normal."
                )
            
            fecha_consumo = data.fecha or date.today()
            consumos_creados = []
            costo_total_global = 0
            cantidad_total = 0
            
            for rollo_data in data.rollos:
                rollo_id = rollo_data.get('rollo_id')
                cantidad = float(rollo_data.get('cantidad', 0))
                
                if cantidad <= 0:
                    continue
                
                # Validate rollo
                rollo = await conn.fetchrow(
                    "SELECT * FROM prod_inventario_rollos WHERE id = $1",
                    rollo_id
                )
                if not rollo or rollo['item_id'] != data.item_id:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Rollo {rollo_id} inválido para este item"
                    )
                
                # Actualizar stock
                costo_total, detalle = await actualizar_stock_fifo(
                    conn, data.item_id, cantidad, rollo_id
                )
                costo_unitario = costo_total / cantidad if cantidad > 0 else 0
                
                # Create consumo
                consumo_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_consumo_mp 
                    (id, empresa_id, orden_id, item_id, rollo_id, talla_id, 
                     cantidad, costo_unitario, costo_total, fecha, observaciones)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """, consumo_id, data.empresa_id, data.orden_id, data.item_id,
                     rollo_id, data.talla_id, cantidad, costo_unitario,
                     costo_total, fecha_consumo, data.observaciones)
                
                # Register WIP
                await registrar_wip(
                    conn, data.empresa_id, data.orden_id, 'CONSUMO_MP', consumo_id,
                    costo_total, fecha_consumo, 
                    f"Consumo {item['nombre']} rollo {rollo['numero_rollo']}: {cantidad}"
                )
                
                consumos_creados.append({
                    "id": consumo_id,
                    "rollo_id": rollo_id,
                    "numero_rollo": rollo['numero_rollo'],
                    "cantidad": cantidad,
                    "costo_total": round(costo_total, 2)
                })
                costo_total_global += costo_total
                cantidad_total += cantidad
            
            # Update requerimiento
            if data.talla_id:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp 
                    SET cantidad_consumida = cantidad_consumida + $1, updated_at = NOW()
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, cantidad_total, data.orden_id, data.item_id, data.talla_id)
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp 
                    SET cantidad_consumida = cantidad_consumida + $1, updated_at = NOW()
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, cantidad_total, data.orden_id, data.item_id)
            
            return {
                "orden_id": data.orden_id,
                "item_id": data.item_id,
                "cantidad_total": cantidad_total,
                "costo_total": round(costo_total_global, 2),
                "consumos": consumos_creados
            }


@router.delete("/consumos/{consumo_id}")
async def delete_consumo(
    consumo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Elimina un consumo y revierte el stock.
    Solo permitido si la orden no está cerrada.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            consumo = await conn.fetchrow("SELECT * FROM prod_consumo_mp WHERE id = $1", consumo_id)
            if not consumo:
                raise HTTPException(status_code=404, detail="Consumo no encontrado")
            
            orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", consumo['orden_id'])
            if orden:
                validar_registro_activo(orden, campo_estado='estado_op', contexto='eliminar consumo')
            
            cantidad = float(consumo['cantidad'])
            item_id = consumo['item_id']
            rollo_id = consumo['rollo_id']
            
            # Revert stock
            await conn.execute("""
                UPDATE prod_inventario SET stock_actual = stock_actual + $1 WHERE id = $2
            """, cantidad, item_id)
            
            if rollo_id:
                await conn.execute("""
                    UPDATE prod_inventario_rollos 
                    SET metros_saldo = metros_saldo + $1,
                        metraje_disponible = metraje_disponible + $1,
                        estado = 'ACTIVO'
                    WHERE id = $2
                """, cantidad, rollo_id)
                
                rollo = await conn.fetchrow("SELECT ingreso_id FROM prod_inventario_rollos WHERE id = $1", rollo_id)
                if rollo:
                    await conn.execute("""
                        UPDATE prod_inventario_ingresos 
                        SET cantidad_disponible = cantidad_disponible + $1
                        WHERE id = $2
                    """, cantidad, rollo['ingreso_id'])
            
            # Delete WIP entry
            await conn.execute("""
                DELETE FROM prod_wip_movimiento 
                WHERE origen_tipo = 'CONSUMO_MP' AND origen_id = $1
            """, consumo_id)
            
            # Update requerimiento
            if consumo['talla_id']:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp 
                    SET cantidad_consumida = GREATEST(0, cantidad_consumida - $1), updated_at = NOW()
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, cantidad, consumo['orden_id'], item_id, consumo['talla_id'])
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp 
                    SET cantidad_consumida = GREATEST(0, cantidad_consumida - $1), updated_at = NOW()
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, cantidad, consumo['orden_id'], item_id)
            
            # Delete consumo
            await conn.execute("DELETE FROM prod_consumo_mp WHERE id = $1", consumo_id)
            
            return {
                "message": "Consumo eliminado y stock revertido",
                "cantidad_revertida": cantidad
            }
