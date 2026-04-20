from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
from helpers import row_to_dict
from auth_utils import get_current_user

router = APIRouter(prefix="/api", tags=["Conversacion"])

TZ_LIMA = timezone(timedelta(hours=-5))


class MensajeCreate(BaseModel):
    autor: str
    mensaje: str
    mensaje_padre_id: Optional[str] = None
    estado: Optional[str] = 'normal'


class MensajeUpdate(BaseModel):
    estado: Optional[str] = None
    fijado: Optional[bool] = None


@router.get("/registros/{registro_id}/conversacion")
async def get_conversacion(registro_id: str):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM prod_conversacion WHERE registro_id = $1 ORDER BY created_at ASC",
            registro_id
        )
        return [row_to_dict(r) for r in rows]


@router.post("/registros/{registro_id}/conversacion")
async def create_mensaje(registro_id: str, input: MensajeCreate, _u=Depends(get_current_user)):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        if not input.mensaje.strip():
            raise HTTPException(status_code=400, detail="El mensaje no puede estar vacio")
        if input.mensaje_padre_id:
            parent = await conn.fetchval(
                "SELECT id FROM prod_conversacion WHERE id = $1 AND registro_id = $2",
                input.mensaje_padre_id, registro_id
            )
            if not parent:
                raise HTTPException(status_code=404, detail="Mensaje padre no encontrado")
        msg_id = str(uuid.uuid4())
        estado = input.estado if input.estado in ('normal', 'importante', 'pendiente', 'resuelto') else 'normal'
        await conn.execute(
            """INSERT INTO prod_conversacion (id, registro_id, mensaje_padre_id, autor, mensaje, estado, fijado, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)""",
            msg_id, registro_id, input.mensaje_padre_id, input.autor.strip(), input.mensaje.strip(), estado,
            datetime.now(timezone.utc).replace(tzinfo=None)
        )
        row = await conn.fetchrow("SELECT * FROM prod_conversacion WHERE id = $1", msg_id)
        return row_to_dict(row)


@router.delete("/conversacion/{mensaje_id}")
async def delete_mensaje(mensaje_id: str, _u=Depends(get_current_user)):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_conversacion WHERE mensaje_padre_id = $1", mensaje_id)
        await conn.execute("DELETE FROM prod_conversacion WHERE id = $1", mensaje_id)
        return {"ok": True}


@router.patch("/conversacion/{mensaje_id}")
async def update_mensaje(mensaje_id: str, input: MensajeUpdate, _u=Depends(get_current_user)):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM prod_conversacion WHERE id = $1", mensaje_id)
        if not row:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")
        if input.estado is not None:
            if input.estado not in ('normal', 'importante', 'pendiente', 'resuelto'):
                raise HTTPException(status_code=400, detail="Estado invalido")
            await conn.execute("UPDATE prod_conversacion SET estado = $1 WHERE id = $2", input.estado, mensaje_id)
        if input.fijado is not None:
            await conn.execute("UPDATE prod_conversacion SET fijado = $1 WHERE id = $2", input.fijado, mensaje_id)
        updated = await conn.fetchrow("SELECT * FROM prod_conversacion WHERE id = $1", mensaje_id)
        return row_to_dict(updated)
