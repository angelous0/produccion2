"""
Router: Costos de Servicio por Registro (WIP)
CRUD para prod_registro_costos_servicio
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from datetime import date
from db import get_pool
from auth import get_current_user
from helpers import row_to_dict

router = APIRouter(prefix="/api", tags=["costos-servicio"])


class CostoServicioCreate(BaseModel):
    empresa_id: int
    registro_id: str
    fecha: Optional[date] = None
    descripcion: str
    proveedor_texto: Optional[str] = None
    monto: float
    fin_origen_tipo: Optional[str] = None
    fin_origen_id: Optional[str] = None


class CostoServicioUpdate(BaseModel):
    fecha: Optional[date] = None
    descripcion: Optional[str] = None
    proveedor_texto: Optional[str] = None
    monto: Optional[float] = None


@router.get("/registros/{registro_id}/costos-servicio")
async def get_costos_servicio(registro_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM prod_registro_costos_servicio
            WHERE registro_id = $1
            ORDER BY fecha DESC, created_at DESC
        """, registro_id)
        
        total = await conn.fetchval("""
            SELECT COALESCE(SUM(monto), 0) FROM prod_registro_costos_servicio
            WHERE registro_id = $1
        """, registro_id)
        
        return {
            "costos": [row_to_dict(r) for r in rows],
            "total": float(total)
        }


@router.post("/registros/{registro_id}/costos-servicio")
async def create_costo_servicio(registro_id: str, data: CostoServicioCreate, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify registro exists and is not closed
        reg = await conn.fetchrow("SELECT id, estado FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        if reg['estado'] in ('CERRADA', 'ANULADA'):
            raise HTTPException(status_code=400, detail=f"OP {reg['estado']}: no se pueden agregar costos")
        
        # Usar empresa_id válida de cont_empresa (FK a finanzas2.cont_empresa)
        empresa_id_valida = await conn.fetchval(
            "SELECT id FROM finanzas2.cont_empresa ORDER BY id LIMIT 1"
        ) or 7
        
        row = await conn.fetchrow("""
            INSERT INTO prod_registro_costos_servicio 
            (empresa_id, registro_id, fecha, descripcion, proveedor_texto, monto, fin_origen_tipo, fin_origen_id)
            VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, $7, $8)
            RETURNING *
        """, empresa_id_valida, registro_id, data.fecha, data.descripcion,
            data.proveedor_texto, data.monto, data.fin_origen_tipo, data.fin_origen_id)
        
        return row_to_dict(row)


@router.put("/registros/{registro_id}/costos-servicio/{costo_id}")
async def update_costo_servicio(registro_id: str, costo_id: str, data: CostoServicioUpdate, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM prod_registro_costos_servicio WHERE id = $1 AND registro_id = $2", 
            costo_id, registro_id
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Costo no encontrado")
        
        updates = []
        params = []
        idx = 1
        for field in ['fecha', 'descripcion', 'proveedor_texto', 'monto']:
            val = getattr(data, field, None)
            if val is not None:
                updates.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1
        
        if not updates:
            return row_to_dict(existing)
        
        updates.append(f"updated_at = NOW()")
        params.append(costo_id)
        
        row = await conn.fetchrow(
            f"UPDATE prod_registro_costos_servicio SET {', '.join(updates)} WHERE id = ${idx} RETURNING *",
            *params
        )
        return row_to_dict(row)


@router.delete("/registros/{registro_id}/costos-servicio/{costo_id}")
async def delete_costo_servicio(registro_id: str, costo_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        deleted = await conn.fetchrow(
            "DELETE FROM prod_registro_costos_servicio WHERE id = $1 AND registro_id = $2 RETURNING id",
            costo_id, registro_id
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Costo no encontrado")
        return {"message": "Costo eliminado"}
