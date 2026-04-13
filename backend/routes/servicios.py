"""
Router: Servicios Externos por Orden
CRUD para prod_servicio_orden (NO genera inventario)
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime, date

router = APIRouter(prefix="/api", tags=["servicios"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict, validar_registro_activo


# ==================== PYDANTIC MODELS ====================

class ServicioOrdenCreate(BaseModel):
    empresa_id: int = 7
    orden_id: str
    servicio_id: Optional[str] = None
    persona_id: Optional[str] = None
    proveedor_texto: Optional[str] = None
    documento_tipo: Optional[str] = None
    documento_numero: Optional[str] = None
    descripcion: str = ""
    cantidad_enviada: int = 0
    cantidad_recibida: int = 0
    tarifa_unitaria: float = 0
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    observaciones: str = ""


class ServicioOrdenUpdate(BaseModel):
    servicio_id: Optional[str] = None
    persona_id: Optional[str] = None
    proveedor_texto: Optional[str] = None
    documento_tipo: Optional[str] = None
    documento_numero: Optional[str] = None
    descripcion: Optional[str] = None
    cantidad_enviada: Optional[int] = None
    cantidad_recibida: Optional[int] = None
    tarifa_unitaria: Optional[float] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    observaciones: Optional[str] = None


ESTADOS_SERVICIO = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO']


# ==================== HELPER FUNCTIONS ====================

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


async def actualizar_wip_servicio(conn, servicio_id: str, nuevo_costo: float, fecha, descripcion: str):
    """Actualiza o crea WIP para un servicio"""
    # Delete existing
    await conn.execute("""
        DELETE FROM prod_wip_movimiento 
        WHERE origen_tipo = 'SERVICIO' AND origen_id = $1
    """, servicio_id)
    
    # Create new if costo > 0
    if nuevo_costo > 0:
        servicio = await conn.fetchrow("SELECT * FROM prod_servicio_orden WHERE id = $1", servicio_id)
        if servicio:
            await registrar_wip(
                conn, servicio['empresa_id'], servicio['orden_id'],
                'SERVICIO', servicio_id, nuevo_costo, fecha, descripcion
            )


# ==================== ENDPOINTS ====================

@router.get("/servicios-orden")
async def get_servicios_orden(
    orden_id: Optional[str] = None,
    estado: Optional[str] = None,
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user)
):
    """Lista servicios por orden con filtros"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT s.*, 
                   srv.nombre as servicio_nombre,
                   p.nombre as persona_nombre, p.telefono as persona_telefono,
                   r.n_corte as orden_codigo
            FROM prod_servicio_orden s
            LEFT JOIN prod_servicios_produccion srv ON s.servicio_id = srv.id
            LEFT JOIN prod_personas_produccion p ON s.persona_id = p.id
            LEFT JOIN prod_registros r ON s.orden_id = r.id
            WHERE s.empresa_id = $1
        """
        params = [empresa_id]
        
        if orden_id:
            params.append(orden_id)
            query += f" AND s.orden_id = ${len(params)}"
        
        if estado:
            params.append(estado)
            query += f" AND s.estado = ${len(params)}"
        
        query += " ORDER BY s.fecha_inicio DESC NULLS LAST, s.created_at DESC"
        
        rows = await conn.fetch(query, *params)
        return [row_to_dict(r) for r in rows]


@router.get("/servicios-orden/{servicio_id}")
async def get_servicio_orden(
    servicio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene detalle de un servicio"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        servicio = await conn.fetchrow("""
            SELECT s.*, 
                   srv.nombre as servicio_nombre, srv.tarifa as servicio_tarifa_base,
                   p.nombre as persona_nombre, p.telefono as persona_telefono, p.direccion as persona_direccion,
                   r.n_corte as orden_codigo, r.estado_op as orden_estado
            FROM prod_servicio_orden s
            LEFT JOIN prod_servicios_produccion srv ON s.servicio_id = srv.id
            LEFT JOIN prod_personas_produccion p ON s.persona_id = p.id
            LEFT JOIN prod_registros r ON s.orden_id = r.id
            WHERE s.id = $1
        """, servicio_id)
        
        if not servicio:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        
        return row_to_dict(servicio)


@router.post("/servicios-orden")
async def create_servicio_orden(
    data: ServicioOrdenCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Registra un servicio externo para una orden.
    NO genera movimiento de inventario (los servicios no son stock físico).
    SI genera movimiento de WIP.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Validate orden
            orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", data.orden_id)
            if not orden:
                raise HTTPException(status_code=404, detail="Orden no encontrada")
            validar_registro_activo(orden, campo_estado='estado_op', contexto='agregar servicio')
            
            # Calculate costo_total
            cantidad_merma = max(0, data.cantidad_enviada - data.cantidad_recibida)
            costo_total = data.cantidad_recibida * data.tarifa_unitaria
            
            # Determine estado
            estado = 'PENDIENTE'
            if data.cantidad_recibida > 0:
                estado = 'COMPLETADO'
            elif data.cantidad_enviada > 0:
                estado = 'EN_PROCESO'
            
            servicio_id = str(uuid.uuid4())
            fecha = data.fecha_fin or data.fecha_inicio or date.today()
            
            await conn.execute("""
                INSERT INTO prod_servicio_orden 
                (id, empresa_id, orden_id, servicio_id, persona_id, proveedor_texto,
                 documento_tipo, documento_numero, descripcion,
                 cantidad_enviada, cantidad_recibida, cantidad_merma,
                 tarifa_unitaria, costo_total, fecha_inicio, fecha_fin,
                 estado, observaciones)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            """, servicio_id, data.empresa_id, data.orden_id, data.servicio_id, data.persona_id,
                 data.proveedor_texto, data.documento_tipo, data.documento_numero, data.descripcion,
                 data.cantidad_enviada, data.cantidad_recibida, cantidad_merma,
                 data.tarifa_unitaria, costo_total, data.fecha_inicio, data.fecha_fin,
                 estado, data.observaciones)
            
            # Register WIP if costo > 0
            if costo_total > 0:
                # Get service name for description
                srv_nombre = data.descripcion
                if data.servicio_id:
                    srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", data.servicio_id)
                    if srv:
                        srv_nombre = srv['nombre']
                
                await registrar_wip(
                    conn, data.empresa_id, data.orden_id, 'SERVICIO', servicio_id,
                    costo_total, fecha, f"Servicio: {srv_nombre} ({data.cantidad_recibida} prendas)"
                )
            
            return {
                "id": servicio_id,
                "orden_id": data.orden_id,
                "cantidad_enviada": data.cantidad_enviada,
                "cantidad_recibida": data.cantidad_recibida,
                "cantidad_merma": cantidad_merma,
                "costo_total": round(costo_total, 2),
                "estado": estado
            }


@router.put("/servicios-orden/{servicio_id}")
async def update_servicio_orden(
    servicio_id: str,
    data: ServicioOrdenUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Actualiza un servicio y recalcula WIP"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            servicio = await conn.fetchrow("SELECT * FROM prod_servicio_orden WHERE id = $1", servicio_id)
            if not servicio:
                raise HTTPException(status_code=404, detail="Servicio no encontrado")
            
            orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", servicio['orden_id'])
            if orden:
                validar_registro_activo(orden, campo_estado='estado_op', contexto='modificar servicio')
            
            # Build update
            updates = []
            params = []
            idx = 1
            
            fields = ['servicio_id', 'persona_id', 'proveedor_texto', 'documento_tipo',
                      'documento_numero', 'descripcion', 'cantidad_enviada', 'cantidad_recibida',
                      'tarifa_unitaria', 'fecha_inicio', 'fecha_fin', 'observaciones']
            
            for field in fields:
                val = getattr(data, field, None)
                if val is not None:
                    updates.append(f"{field} = ${idx}")
                    params.append(val)
                    idx += 1
            
            if updates:
                params.append(servicio_id)
                await conn.execute(
                    f"UPDATE prod_servicio_orden SET {', '.join(updates)}, updated_at = NOW() WHERE id = ${idx}",
                    *params
                )
            
            # Reload and recalculate
            servicio = await conn.fetchrow("SELECT * FROM prod_servicio_orden WHERE id = $1", servicio_id)
            
            cantidad_enviada = int(servicio['cantidad_enviada'] or 0)
            cantidad_recibida = int(servicio['cantidad_recibida'] or 0)
            tarifa = float(servicio['tarifa_unitaria'] or 0)
            
            cantidad_merma = max(0, cantidad_enviada - cantidad_recibida)
            costo_total = cantidad_recibida * tarifa
            
            # Determine estado
            estado = servicio['estado']
            if cantidad_recibida > 0:
                estado = 'COMPLETADO'
            elif cantidad_enviada > 0:
                estado = 'EN_PROCESO'
            else:
                estado = 'PENDIENTE'
            
            await conn.execute("""
                UPDATE prod_servicio_orden 
                SET cantidad_merma = $1, costo_total = $2, estado = $3
                WHERE id = $4
            """, cantidad_merma, costo_total, estado, servicio_id)
            
            # Update WIP
            fecha = servicio['fecha_fin'] or servicio['fecha_inicio'] or date.today()
            srv_nombre = servicio['descripcion'] or 'Servicio externo'
            await actualizar_wip_servicio(
                conn, servicio_id, costo_total, fecha,
                f"Servicio: {srv_nombre} ({cantidad_recibida} prendas)"
            )
            
            return {
                "id": servicio_id,
                "cantidad_enviada": cantidad_enviada,
                "cantidad_recibida": cantidad_recibida,
                "cantidad_merma": cantidad_merma,
                "costo_total": round(costo_total, 2),
                "estado": estado
            }


@router.delete("/servicios-orden/{servicio_id}")
async def delete_servicio_orden(
    servicio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Elimina un servicio y su WIP asociado"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            servicio = await conn.fetchrow("SELECT * FROM prod_servicio_orden WHERE id = $1", servicio_id)
            if not servicio:
                raise HTTPException(status_code=404, detail="Servicio no encontrado")
            
            orden = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", servicio['orden_id'])
            if orden:
                validar_registro_activo(orden, campo_estado='estado_op', contexto='eliminar servicio')
            
            # Delete WIP
            await conn.execute("""
                DELETE FROM prod_wip_movimiento 
                WHERE origen_tipo = 'SERVICIO' AND origen_id = $1
            """, servicio_id)
            
            # Delete servicio
            await conn.execute("DELETE FROM prod_servicio_orden WHERE id = $1", servicio_id)
            
            return {"message": "Servicio eliminado"}


@router.post("/servicios-orden/{servicio_id}/completar")
async def completar_servicio(
    servicio_id: str,
    cantidad_recibida: int,
    current_user: dict = Depends(get_current_user)
):
    """Marca un servicio como completado con las prendas recibidas"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            servicio = await conn.fetchrow("SELECT * FROM prod_servicio_orden WHERE id = $1", servicio_id)
            if not servicio:
                raise HTTPException(status_code=404, detail="Servicio no encontrado")
            
            if servicio['estado'] == 'COMPLETADO':
                raise HTTPException(status_code=400, detail="El servicio ya está completado")
            
            cantidad_enviada = int(servicio['cantidad_enviada'] or 0)
            tarifa = float(servicio['tarifa_unitaria'] or 0)
            
            cantidad_merma = max(0, cantidad_enviada - cantidad_recibida)
            costo_total = cantidad_recibida * tarifa
            
            await conn.execute("""
                UPDATE prod_servicio_orden 
                SET cantidad_recibida = $1, cantidad_merma = $2, costo_total = $3, 
                    estado = 'COMPLETADO', fecha_fin = CURRENT_DATE, updated_at = NOW()
                WHERE id = $4
            """, cantidad_recibida, cantidad_merma, costo_total, servicio_id)
            
            # Update WIP
            srv_nombre = servicio['descripcion'] or 'Servicio externo'
            await actualizar_wip_servicio(
                conn, servicio_id, costo_total, date.today(),
                f"Servicio: {srv_nombre} ({cantidad_recibida} prendas)"
            )
            
            return {
                "id": servicio_id,
                "cantidad_recibida": cantidad_recibida,
                "cantidad_merma": cantidad_merma,
                "costo_total": round(costo_total, 2),
                "estado": "COMPLETADO"
            }


@router.get("/ordenes/{orden_id}/servicios")
async def get_servicios_por_orden(
    orden_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Lista todos los servicios de una orden con totales"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        orden = await conn.fetchrow("SELECT id, n_corte FROM prod_registros WHERE id = $1", orden_id)
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        
        servicios = await conn.fetch("""
            SELECT s.*, 
                   srv.nombre as servicio_nombre,
                   p.nombre as persona_nombre
            FROM prod_servicio_orden s
            LEFT JOIN prod_servicios_produccion srv ON s.servicio_id = srv.id
            LEFT JOIN prod_personas_produccion p ON s.persona_id = p.id
            WHERE s.orden_id = $1
            ORDER BY s.fecha_inicio DESC NULLS LAST
        """, orden_id)
        
        total_costo = sum(float(s['costo_total'] or 0) for s in servicios)
        total_prendas = sum(int(s['cantidad_recibida'] or 0) for s in servicios)
        total_merma = sum(int(s['cantidad_merma'] or 0) for s in servicios)
        
        return {
            "orden_id": orden_id,
            "n_corte": orden['n_corte'],
            "servicios": [row_to_dict(s) for s in servicios],
            "resumen": {
                "total_servicios": len(servicios),
                "total_costo": round(total_costo, 2),
                "total_prendas_procesadas": total_prendas,
                "total_merma": total_merma
            }
        }
