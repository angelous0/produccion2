"""
Router: Órdenes de Producción
CRUD para prod_registros (OP)
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime, date
import json

router = APIRouter(prefix="/api", tags=["ordenes"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict, validar_registro_activo


# ==================== PYDANTIC MODELS ====================

class TallaCantidad(BaseModel):
    talla_id: str
    cantidad: int = 0


class OrdenCreate(BaseModel):
    empresa_id: int = 7
    n_corte: str
    modelo_id: str
    pt_item_id: Optional[str] = None
    estado_op: str = "ABIERTA"
    etapa_codigo: Optional[str] = None
    urgente: bool = False
    observaciones: str = ""
    tallas: List[TallaCantidad] = []


class OrdenUpdate(BaseModel):
    n_corte: Optional[str] = None
    modelo_id: Optional[str] = None
    pt_item_id: Optional[str] = None
    estado_op: Optional[str] = None
    etapa_codigo: Optional[str] = None
    urgente: Optional[bool] = None
    observaciones: Optional[str] = None


class TallasBulkUpdate(BaseModel):
    tallas: List[TallaCantidad]


ESTADOS_OP = ['ABIERTA', 'EN_PROCESO', 'CERRADA', 'ANULADA']


# ==================== ENDPOINTS ====================

@router.get("/ordenes")
async def get_ordenes(
    empresa_id: int = Query(7),
    estado_op: Optional[str] = None,
    etapa_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Lista órdenes de producción con filtros"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT r.*, 
                   m.nombre as modelo_nombre,
                   ma.nombre as marca_nombre,
                   pt.codigo as pt_codigo, pt.nombre as pt_nombre,
                   e.codigo as etapa_codigo, e.nombre as etapa_nombre,
                   COALESCE(w.costo_mp, 0) as costo_mp,
                   COALESCE(w.costo_servicio, 0) as costo_servicio,
                   COALESCE(w.costo_total, 0) as costo_wip
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_inventario pt ON r.pt_item_id = pt.id
            LEFT JOIN prod_orden_etapa e ON r.etapa_actual_id = e.id
            LEFT JOIN v_wip_resumen w ON r.id = w.orden_id
            WHERE r.empresa_id = $1
        """
        params = [empresa_id]
        
        if estado_op:
            params.append(estado_op)
            query += f" AND r.estado_op = ${len(params)}"
        
        if etapa_id:
            params.append(etapa_id)
            query += f" AND r.etapa_actual_id = ${len(params)}"
        
        query += " ORDER BY r.fecha_creacion DESC"
        
        rows = await conn.fetch(query, *params)
        
        result = []
        for r in rows:
            d = row_to_dict(r)
            # Get total prendas
            total = await conn.fetchval(
                "SELECT COALESCE(SUM(cantidad_real), 0) FROM prod_registro_tallas WHERE registro_id = $1",
                d['id']
            )
            d['total_prendas'] = int(total or 0)
            result.append(d)
        
        return result


@router.get("/ordenes/{orden_id}")
async def get_orden(
    orden_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene detalle completo de una orden"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        orden = await conn.fetchrow("""
            SELECT r.*, 
                   m.nombre as modelo_nombre,
                   ma.nombre as marca_nombre,
                   pt.codigo as pt_codigo, pt.nombre as pt_nombre,
                   e.codigo as etapa_codigo, e.nombre as etapa_nombre
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_inventario pt ON r.pt_item_id = pt.id
            LEFT JOIN prod_orden_etapa e ON r.etapa_actual_id = e.id
            WHERE r.id = $1
        """, orden_id)
        
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        
        d = row_to_dict(orden)
        
        # Tallas
        tallas = await conn.fetch("""
            SELECT rt.*, tc.nombre as talla_nombre, tc.orden
            FROM prod_registro_tallas rt
            LEFT JOIN prod_tallas_catalogo tc ON rt.talla_id = tc.id
            WHERE rt.registro_id = $1
            ORDER BY tc.orden
        """, orden_id)
        d['tallas'] = [row_to_dict(t) for t in tallas]
        d['total_prendas'] = sum(int(t['cantidad_real'] or 0) for t in tallas)
        
        # WIP summary
        wip = await conn.fetchrow("""
            SELECT * FROM v_wip_resumen WHERE orden_id = $1
        """, orden_id)
        if wip:
            d['wip'] = row_to_dict(wip)
        else:
            d['wip'] = {'costo_mp': 0, 'costo_servicio': 0, 'costo_total': 0}
        
        return d


@router.post("/ordenes")
async def create_orden(
    data: OrdenCreate,
    current_user: dict = Depends(get_current_user)
):
    """Crea una nueva orden de producción"""
    if data.estado_op and data.estado_op not in ESTADOS_OP:
        raise HTTPException(status_code=400, detail=f"estado_op debe ser uno de: {ESTADOS_OP}")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify modelo exists
        modelo = await conn.fetchrow("SELECT * FROM prod_modelos WHERE id = $1", data.modelo_id)
        if not modelo:
            raise HTTPException(status_code=404, detail="Modelo no encontrado")
        
        # Verify pt_item if provided
        if data.pt_item_id:
            pt = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", data.pt_item_id)
            if not pt:
                raise HTTPException(status_code=404, detail="Item PT no encontrado")
        
        # Get etapa_id from codigo
        etapa_id = None
        if data.etapa_codigo:
            etapa = await conn.fetchrow(
                "SELECT id FROM prod_orden_etapa WHERE empresa_id = $1 AND codigo = $2",
                data.empresa_id, data.etapa_codigo
            )
            if etapa:
                etapa_id = etapa['id']
        else:
            # Default to CORTE
            etapa = await conn.fetchrow(
                "SELECT id FROM prod_orden_etapa WHERE empresa_id = $1 AND codigo = 'CORTE'",
                data.empresa_id
            )
            if etapa:
                etapa_id = etapa['id']
        
        orden_id = str(uuid.uuid4())
        
        # Legacy estado mapping
        estado_legacy = "Para Corte" if data.estado_op == "ABIERTA" else data.estado_op
        
        await conn.execute("""
            INSERT INTO prod_registros 
            (id, empresa_id, n_corte, modelo_id, pt_item_id, estado, estado_op, 
             etapa_actual_id, urgente, fecha_creacion, tallas, distribucion_colores)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), '[]', '[]')
        """, orden_id, data.empresa_id, data.n_corte, data.modelo_id, data.pt_item_id,
             estado_legacy, data.estado_op or 'ABIERTA', etapa_id, data.urgente)
        
        # Create tallas if provided
        if data.tallas:
            for t in data.tallas:
                talla_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_registro_tallas (id, registro_id, talla_id, cantidad_real, empresa_id)
                    VALUES ($1, $2, $3, $4, $5)
                """, talla_id, orden_id, t.talla_id, t.cantidad, data.empresa_id)
        
        return {"id": orden_id, "n_corte": data.n_corte, "estado_op": data.estado_op or 'ABIERTA'}


@router.put("/ordenes/{orden_id}")
async def update_orden(
    orden_id: str,
    data: OrdenUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Actualiza una orden existente"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", orden_id)
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        
        validar_registro_activo(orden, campo_estado='estado_op', contexto='modificar')
        
        if data.estado_op and data.estado_op not in ESTADOS_OP:
            raise HTTPException(status_code=400, detail=f"estado_op debe ser uno de: {ESTADOS_OP}")
        
        updates = []
        params = []
        idx = 1
        
        for field in ['n_corte', 'modelo_id', 'pt_item_id', 'estado_op', 'urgente']:
            val = getattr(data, field, None)
            if val is not None:
                updates.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1
        
        # Handle etapa_codigo -> etapa_actual_id
        if data.etapa_codigo:
            etapa = await conn.fetchrow(
                "SELECT id FROM prod_orden_etapa WHERE empresa_id = $1 AND codigo = $2",
                orden['empresa_id'], data.etapa_codigo
            )
            if etapa:
                updates.append(f"etapa_actual_id = ${idx}")
                params.append(etapa['id'])
                idx += 1
        
        if not updates:
            return row_to_dict(orden)
        
        params.append(orden_id)
        await conn.execute(
            f"UPDATE prod_registros SET {', '.join(updates)} WHERE id = ${idx}",
            *params
        )
        
        updated = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", orden_id)
        return row_to_dict(updated)


@router.put("/ordenes/{orden_id}/tallas")
async def update_tallas(
    orden_id: str,
    data: TallasBulkUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Actualiza cantidades por talla (upsert)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", orden_id)
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        
        validar_registro_activo(orden, campo_estado='estado_op', contexto='modificar tallas')
        
        updated = []
        for t in data.tallas:
            existing = await conn.fetchrow(
                "SELECT id FROM prod_registro_tallas WHERE registro_id = $1 AND talla_id = $2",
                orden_id, t.talla_id
            )
            
            if existing:
                await conn.execute("""
                    UPDATE prod_registro_tallas SET cantidad_real = $1, updated_at = NOW()
                    WHERE id = $2
                """, t.cantidad, existing['id'])
                updated.append({"id": existing['id'], "talla_id": t.talla_id, "cantidad": t.cantidad})
            else:
                new_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_registro_tallas (id, registro_id, talla_id, cantidad_real, empresa_id)
                    VALUES ($1, $2, $3, $4, $5)
                """, new_id, orden_id, t.talla_id, t.cantidad, orden['empresa_id'])
                updated.append({"id": new_id, "talla_id": t.talla_id, "cantidad": t.cantidad})
        
        return {"message": "Tallas actualizadas", "updated": updated}


@router.put("/ordenes/{orden_id}/cambiar-etapa")
async def cambiar_etapa(
    orden_id: str,
    etapa_codigo: str,
    current_user: dict = Depends(get_current_user)
):
    """Cambia la etapa productiva de una orden"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", orden_id)
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        
        validar_registro_activo(orden, campo_estado='estado_op', contexto='cambiar etapa')
        
        etapa = await conn.fetchrow(
            "SELECT * FROM prod_orden_etapa WHERE empresa_id = $1 AND codigo = $2",
            orden['empresa_id'], etapa_codigo
        )
        if not etapa:
            raise HTTPException(status_code=404, detail=f"Etapa '{etapa_codigo}' no encontrada")
        
        # Update estado_op to EN_PROCESO if was ABIERTA
        nuevo_estado_op = orden['estado_op']
        if orden['estado_op'] == 'ABIERTA':
            nuevo_estado_op = 'EN_PROCESO'
        
        await conn.execute("""
            UPDATE prod_registros SET etapa_actual_id = $1, estado = $2, estado_op = $3
            WHERE id = $4
        """, etapa['id'], etapa['nombre'], nuevo_estado_op, orden_id)
        
        return {
            "message": f"Etapa cambiada a {etapa['nombre']}",
            "etapa_codigo": etapa['codigo'],
            "etapa_nombre": etapa['nombre'],
            "estado_op": nuevo_estado_op
        }


@router.get("/ordenes/{orden_id}/resumen-wip")
async def get_resumen_wip(
    orden_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene resumen de WIP de una orden"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        orden = await conn.fetchrow("SELECT id, n_corte FROM prod_registros WHERE id = $1", orden_id)
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        
        wip = await conn.fetchrow("SELECT * FROM v_wip_resumen WHERE orden_id = $1", orden_id)
        
        # Get details
        consumos = await conn.fetch("""
            SELECT c.*, i.codigo as item_codigo, i.nombre as item_nombre
            FROM prod_consumo_mp c
            LEFT JOIN prod_inventario i ON c.item_id = i.id
            WHERE c.orden_id = $1
            ORDER BY c.fecha DESC
        """, orden_id)
        
        servicios = await conn.fetch("""
            SELECT s.*, srv.nombre as servicio_nombre, p.nombre as persona_nombre
            FROM prod_servicio_orden s
            LEFT JOIN prod_servicios_produccion srv ON s.servicio_id = srv.id
            LEFT JOIN prod_personas_produccion p ON s.persona_id = p.id
            WHERE s.orden_id = $1
            ORDER BY s.fecha_inicio DESC
        """, orden_id)
        
        return {
            "orden_id": orden_id,
            "n_corte": orden['n_corte'],
            "resumen": row_to_dict(wip) if wip else {
                "costo_mp": 0, "costo_servicio": 0, "costo_total": 0
            },
            "consumos": [row_to_dict(c) for c in consumos],
            "servicios": [row_to_dict(s) for s in servicios]
        }


@router.get("/etapas")
async def get_etapas(
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user)
):
    """Lista etapas productivas"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM prod_orden_etapa 
            WHERE empresa_id = $1 AND activo = true
            ORDER BY orden
        """, empresa_id)
        return [row_to_dict(r) for r in rows]
