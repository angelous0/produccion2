"""
Router: Rollos de Tela
CRUD para prod_inventario_rollos
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime

router = APIRouter(prefix="/api", tags=["rollos"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict


# ==================== PYDANTIC MODELS ====================

class RolloCreate(BaseModel):
    item_id: str
    ingreso_id: str
    codigo_rollo: str = ""
    lote: Optional[str] = None
    color_id: Optional[str] = None
    tono: Optional[str] = None
    ancho: Optional[float] = None
    metros_iniciales: float
    costo_unitario_metro: float = 0
    observaciones: str = ""


class RolloUpdate(BaseModel):
    codigo_rollo: Optional[str] = None
    lote: Optional[str] = None
    color_id: Optional[str] = None
    tono: Optional[str] = None
    ancho: Optional[float] = None
    observaciones: Optional[str] = None


# ==================== ENDPOINTS ====================

@router.get("/rollos")
async def get_rollos(
    item_id: Optional[str] = None,
    estado: Optional[str] = None,
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user)
):
    """Lista rollos con filtros"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT r.*, 
                   i.codigo as item_codigo, i.nombre as item_nombre
            FROM prod_inventario_rollos r
            LEFT JOIN prod_inventario i ON r.item_id = i.id
            WHERE r.empresa_id = $1
        """
        params = [empresa_id]
        
        if item_id:
            params.append(item_id)
            query += f" AND r.item_id = ${len(params)}"
        
        if estado:
            params.append(estado)
            query += f" AND r.estado = ${len(params)}"
        
        query += " ORDER BY r.created_at DESC"
        
        rows = await conn.fetch(query, *params)
        return [row_to_dict(r) for r in rows]


@router.get("/rollos/{rollo_id}")
async def get_rollo(
    rollo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene detalle de un rollo"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rollo = await conn.fetchrow("""
            SELECT r.*, 
                   i.codigo as item_codigo, i.nombre as item_nombre,
                   ing.costo_unitario as costo_ingreso, ing.proveedor
            FROM prod_inventario_rollos r
            LEFT JOIN prod_inventario i ON r.item_id = i.id
            LEFT JOIN prod_inventario_ingresos ing ON r.ingreso_id = ing.id
            WHERE r.id = $1
        """, rollo_id)
        
        if not rollo:
            raise HTTPException(status_code=404, detail="Rollo no encontrado")
        
        d = row_to_dict(rollo)
        
        # Consumos de este rollo
        consumos = await conn.fetch("""
            SELECT c.*, r.n_corte as orden_codigo
            FROM prod_consumo_mp c
            LEFT JOIN prod_registros r ON c.orden_id = r.id
            WHERE c.rollo_id = $1
            ORDER BY c.fecha DESC
        """, rollo_id)
        d['consumos'] = [row_to_dict(c) for c in consumos]
        
        return d


@router.get("/rollos/disponibles/{item_id}")
async def get_rollos_disponibles(
    item_id: str,
    min_metros: float = Query(0),
    current_user: dict = Depends(get_current_user)
):
    """Lista rollos disponibles para consumo de un item"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        
        if not item['control_por_rollos']:
            raise HTTPException(status_code=400, detail="Este item no controla por rollos")
        
        rollos = await conn.fetch("""
            SELECT r.*, ing.costo_unitario
            FROM prod_inventario_rollos r
            LEFT JOIN prod_inventario_ingresos ing ON r.ingreso_id = ing.id
            WHERE r.item_id = $1 
              AND r.estado = 'ACTIVO' 
              AND r.metros_saldo >= $2
            ORDER BY r.created_at ASC
        """, item_id, min_metros)
        
        result = []
        for r in rollos:
            d = row_to_dict(r)
            d['metros_saldo'] = float(d.get('metros_saldo') or 0)
            d['metros_iniciales'] = float(d.get('metros_iniciales') or 0)
            d['costo_unitario_metro'] = float(d.get('costo_unitario_metro') or d.get('costo_unitario') or 0)
            result.append(d)
        
        return {
            "item_id": item_id,
            "item_nombre": item['nombre'],
            "rollos": result,
            "total_disponible": sum(r['metros_saldo'] for r in result)
        }


@router.post("/rollos")
async def create_rollo(
    data: RolloCreate,
    current_user: dict = Depends(get_current_user)
):
    """Crea un nuevo rollo (normalmente desde ingreso)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify item exists and controls by rollos
        item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", data.item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        if not item['control_por_rollos']:
            raise HTTPException(status_code=400, detail="Este item no controla por rollos")
        
        # Verify ingreso exists
        ingreso = await conn.fetchrow("SELECT * FROM prod_inventario_ingresos WHERE id = $1", data.ingreso_id)
        if not ingreso:
            raise HTTPException(status_code=404, detail="Ingreso no encontrado")
        
        rollo_id = str(uuid.uuid4())
        costo_unitario = data.costo_unitario_metro or float(ingreso.get('costo_unitario') or 0)
        costo_total = data.metros_iniciales * costo_unitario
        
        await conn.execute("""
            INSERT INTO prod_inventario_rollos 
            (id, empresa_id, item_id, ingreso_id, numero_rollo, lote, color_id, tono, ancho,
             metraje, metraje_disponible, metros_iniciales, metros_saldo,
             costo_unitario_metro, costo_total_inicial, observaciones, activo, estado, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $10, $10, $11, $12, $13, true, 'ACTIVO', NOW())
        """, rollo_id, item['empresa_id'], data.item_id, data.ingreso_id,
             data.codigo_rollo, data.lote, data.color_id, data.tono, data.ancho,
             data.metros_iniciales, costo_unitario, costo_total, data.observaciones)
        
        return {
            "id": rollo_id,
            "item_id": data.item_id,
            "metros_iniciales": data.metros_iniciales,
            "metros_saldo": data.metros_iniciales,
            "costo_unitario_metro": costo_unitario,
            "costo_total_inicial": costo_total,
            "estado": "ACTIVO"
        }


@router.put("/rollos/{rollo_id}")
async def update_rollo(
    rollo_id: str,
    data: RolloUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Actualiza datos de un rollo (no cantidades)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rollo = await conn.fetchrow("SELECT * FROM prod_inventario_rollos WHERE id = $1", rollo_id)
        if not rollo:
            raise HTTPException(status_code=404, detail="Rollo no encontrado")
        
        updates = []
        params = []
        idx = 1
        
        field_map = {
            'codigo_rollo': 'numero_rollo',
            'lote': 'lote',
            'color_id': 'color_id',
            'tono': 'tono',
            'ancho': 'ancho',
            'observaciones': 'observaciones'
        }
        
        for py_field, db_field in field_map.items():
            val = getattr(data, py_field, None)
            if val is not None:
                updates.append(f"{db_field} = ${idx}")
                params.append(val)
                idx += 1
        
        if not updates:
            return row_to_dict(rollo)
        
        params.append(rollo_id)
        await conn.execute(
            f"UPDATE prod_inventario_rollos SET {', '.join(updates)} WHERE id = ${idx}",
            *params
        )
        
        updated = await conn.fetchrow("SELECT * FROM prod_inventario_rollos WHERE id = $1", rollo_id)
        return row_to_dict(updated)


@router.post("/rollos/{rollo_id}/baja")
async def dar_baja_rollo(
    rollo_id: str,
    motivo: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Da de baja un rollo"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rollo = await conn.fetchrow("SELECT * FROM prod_inventario_rollos WHERE id = $1", rollo_id)
        if not rollo:
            raise HTTPException(status_code=404, detail="Rollo no encontrado")
        
        if rollo['estado'] == 'BAJA':
            raise HTTPException(status_code=400, detail="El rollo ya está dado de baja")
        
        await conn.execute("""
            UPDATE prod_inventario_rollos 
            SET estado = 'BAJA', activo = false, observaciones = COALESCE(observaciones, '') || ' | BAJA: ' || $2
            WHERE id = $1
        """, rollo_id, motivo)
        
        # Update item stock
        metros_saldo = float(rollo['metros_saldo'] or 0)
        if metros_saldo > 0:
            await conn.execute("""
                UPDATE prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2
            """, metros_saldo, rollo['item_id'])
        
        return {"message": "Rollo dado de baja", "metros_descontados": metros_saldo}
