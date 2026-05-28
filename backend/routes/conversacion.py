from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import re
from helpers import row_to_dict
from auth_utils import get_current_user
from routes.notificaciones import crear_notificacion

router = APIRouter(prefix="/api", tags=["Conversacion"])

TZ_LIMA = timezone(timedelta(hours=-5))

# Regex para extraer @usernames en el texto del mensaje.
# Acepta letras, números, guion bajo y guion (cristian-casas, raul, mirian, etc.)
_MENCION_RE = re.compile(r'@([a-zA-Z0-9_\-]+)')


def _extraer_menciones(texto: str) -> list[str]:
    """Devuelve lista de usernames mencionados (en minúsculas, sin duplicados)."""
    if not texto:
        return []
    encontrados = _MENCION_RE.findall(texto)
    # Normalizamos a minúsculas para que @Mirian == @mirian
    return list({m.lower() for m in encontrados})


async def _notificar_menciones(conn, *, registro_id: str, autor: str, mensaje: str, mensaje_id: str):
    """Por cada @usuario válido en el mensaje, crea una notificación dirigida.

    El filtrado real lo hace el frontend al cargar notificaciones del usuario
    (via prod_notificaciones.audiencia.usernames). Acá solo creamos la fila.
    """
    menciones = _extraer_menciones(mensaje)
    if not menciones:
        return

    # Validar que los usernames existan (para no inflar la tabla con menciones falsas)
    rows = await conn.fetch(
        "SELECT username FROM prod_usuarios WHERE LOWER(username) = ANY($1::text[]) AND activo = TRUE",
        menciones,
    )
    usernames_validos = [r["username"] for r in rows]
    if not usernames_validos:
        return

    # Excerpt del mensaje (máx 120 chars) para mostrar en la notificación
    excerpt = (mensaje or "").strip()
    if len(excerpt) > 120:
        excerpt = excerpt[:117] + "..."

    await crear_notificacion(
        conn,
        tipo="chat_mencion",
        severidad="atencion",
        titulo=f"{autor} te mencionó en un corte",
        mensaje=excerpt,
        registro_id=registro_id,
        entidad_tipo="mensaje",
        entidad_id=mensaje_id,
        audiencia={"usernames": usernames_validos},
        origen="trigger_sync",
        dedup_minutos=0,
    )


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

        # Sprint 41: notificar @menciones (no rompe el flujo si falla)
        try:
            await _notificar_menciones(
                conn,
                registro_id=registro_id,
                autor=input.autor.strip(),
                mensaje=input.mensaje.strip(),
                mensaje_id=msg_id,
            )
        except Exception as e:
            print(f"[chat] No se pudo notificar menciones: {e}")

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
