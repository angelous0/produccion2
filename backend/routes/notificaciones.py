"""
Notificaciones in-app (bell + badge móvil/web).

Tabla: prod_notificaciones (creada en startup_ddl.ensure_notificaciones_tables).

Filosofía:
  - Una fila = una notificación dirigida a una audiencia (no a un usuario).
  - `leida_por` (JSONB array) lleva los user_id que ya la vieron.
  - Audiencia se evalúa al leer: el GET filtra qué notificaciones le tocan
    al usuario según su rol + servicios.
  - Admin ve absolutamente todo.

Endpoints expuestos:
  GET    /api/notificaciones
  GET    /api/notificaciones/contador
  POST   /api/notificaciones/:id/marcar-leida
  POST   /api/notificaciones/marcar-todas-leidas
  POST   /api/notificaciones/test      (utilidad: crear notif manual para probar UI)

Helpers (usados por otros routers vía import):
  await crear_notificacion(conn, tipo=..., severidad=..., titulo=..., ...)
"""
import json
import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth_utils import get_current_user
from helpers import row_to_dict, parse_jsonb

router = APIRouter(prefix="/api", tags=["Notificaciones"])


# ─── Modelos ────────────────────────────────────────────────────────────────

class Audiencia(BaseModel):
    roles: List[str] = []      # Si vacío, ven todos los roles.
    servicios: List[str] = []  # Si vacío, ven todos los servicios.


class NotifTestInput(BaseModel):
    tipo: str = "test"
    severidad: str = "info"  # urgente | atencion | info | ok
    titulo: str
    mensaje: str = ""
    registro_id: Optional[str] = None
    entidad_tipo: Optional[str] = None
    entidad_id: Optional[str] = None
    audiencia: Optional[Audiencia] = None


# ─── Helper interno: crear notificación ────────────────────────────────────

async def crear_notificacion(
    conn,
    *,
    tipo: str,
    severidad: str = "info",
    titulo: str,
    mensaje: str = "",
    registro_id: Optional[str] = None,
    entidad_tipo: Optional[str] = None,
    entidad_id: Optional[str] = None,
    audiencia: Optional[dict] = None,
    origen: str = "trigger_sync",
    dedup_minutos: int = 0,
) -> Optional[str]:
    """Crea una notificación. Devuelve su id (o None si fue deduplicada).

    Parámetros:
      tipo, severidad, titulo, mensaje: contenido visible.
      registro_id, entidad_tipo, entidad_id: deep link.
      audiencia: { roles: [...], servicios: [...] }. Vacío = todos.
      origen: 'trigger_sync' | 'cron' | 'manual'.
      dedup_minutos: si > 0, evita crear una notificación equivalente
        (mismo tipo + entidad) que ya exista en los últimos N minutos.

    Pensado para llamarse desde otros routers dentro de su propia transacción:
        from routes.notificaciones import crear_notificacion
        await crear_notificacion(conn, tipo='incidencia_nueva', ...)
    """
    severidad = severidad if severidad in ('urgente', 'atencion', 'info', 'ok') else 'info'

    if dedup_minutos and entidad_tipo and entidad_id:
        exists = await conn.fetchval(
            """SELECT 1 FROM prod_notificaciones
                WHERE tipo = $1
                  AND entidad_tipo = $2
                  AND entidad_id = $3
                  AND created_at > NOW() - ($4 || ' minutes')::interval
                LIMIT 1""",
            tipo, entidad_tipo, str(entidad_id), str(int(dedup_minutos)),
        )
        if exists:
            return None

    notif_id = str(uuid.uuid4())
    audiencia_json = json.dumps(audiencia or {})
    await conn.execute(
        """INSERT INTO prod_notificaciones
            (id, tipo, severidad, titulo, mensaje, registro_id,
             entidad_tipo, entidad_id, audiencia, leida_por, origen, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, '[]'::jsonb, $10, NOW())""",
        notif_id, tipo, severidad, titulo, mensaje, registro_id,
        entidad_tipo, str(entidad_id) if entidad_id else None,
        audiencia_json, origen,
    )
    return notif_id


# ─── Filtrado por audiencia ────────────────────────────────────────────────

def _le_aplica_al_usuario(audiencia: dict, user: dict) -> bool:
    """Determina si una notificación le toca a un usuario según su rol/servicios/username.

    Reglas:
      - audiencia.usernames tiene mi username: True (mención directa, gana sobre todo).
      - admin: siempre True (ve todo).
      - audiencia vacía o sin filtros: True (es para todos).
      - audiencia.roles tiene el rol del usuario: True.
      - audiencia.servicios cruza con servicios del usuario: True.
      - cualquier otro caso: False.
    """
    # Mención directa (Sprint 41) — tiene prioridad sobre admin/roles/servicios:
    # incluso si la audiencia limita por rol, si tu username aparece sos destinatario.
    usernames = (audiencia or {}).get("usernames") or []
    if usernames and (user.get("username") or "") in usernames:
        return True

    if (user.get("rol") or "").lower() == "admin":
        return True
    if not audiencia:
        return True

    roles = audiencia.get("roles") or []
    servicios = audiencia.get("servicios") or []

    if not roles and not servicios and not usernames:
        return True

    if roles and (user.get("rol") or "") in roles:
        return True

    user_servicios = user.get("servicios") or []
    if isinstance(user_servicios, str):
        try:
            user_servicios = json.loads(user_servicios)
        except Exception:
            user_servicios = []
    user_servicio_ids = set()
    for s in user_servicios:
        if isinstance(s, dict) and s.get("servicio_id"):
            user_servicio_ids.add(str(s["servicio_id"]))
        elif isinstance(s, str):
            user_servicio_ids.add(s)
    if servicios and any(str(sid) in user_servicio_ids for sid in servicios):
        return True

    return False


def _marcar_leida_flag(row_dict: dict, user_id: str) -> dict:
    """Añade el campo `leida: bool` mirando leida_por."""
    leida_por = parse_jsonb(row_dict.get("leida_por")) or []
    row_dict["leida"] = str(user_id) in [str(x) for x in leida_por]
    row_dict["audiencia"] = parse_jsonb(row_dict.get("audiencia")) or {}
    return row_dict


# ─── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/notificaciones")
async def listar_notificaciones(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    solo_no_leidas: bool = Query(False),
    severidad: Optional[str] = Query(None),
    tipo: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Devuelve las notificaciones que le tocan al usuario, más recientes primero.

    Filtra en aplicación (no SQL puro) porque la audiencia es compleja.
    Trae un buffer mayor al `limit` para no perder filas tras el filtro.
    """
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        conds = ["1=1"]
        params = []
        if severidad:
            params.append(severidad)
            conds.append(f"severidad = ${len(params)}")
        if tipo:
            params.append(tipo)
            conds.append(f"tipo = ${len(params)}")

        where = " AND ".join(conds)
        buffer = max(limit * 4, 200)
        sql = f"""SELECT * FROM prod_notificaciones
                   WHERE {where}
                   ORDER BY created_at DESC
                   LIMIT {int(buffer)}"""
        rows = await conn.fetch(sql, *params)

        items = []
        for r in rows:
            d = row_to_dict(r)
            aud = parse_jsonb(d.get("audiencia")) or {}
            if not _le_aplica_al_usuario(aud, current_user):
                continue
            d = _marcar_leida_flag(d, current_user.get("id") or current_user.get("username"))
            if solo_no_leidas and d["leida"]:
                continue
            items.append(d)
            if len(items) >= limit + offset:
                break

        return {
            "items": items[offset:offset + limit],
            "total": len(items),
        }


@router.get("/notificaciones/contador")
async def contador_no_leidas(current_user: dict = Depends(get_current_user)):
    """Cantidad de no leídas que le tocan al usuario (badge del bell)."""
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, severidad, audiencia, leida_por
                 FROM prod_notificaciones
                ORDER BY created_at DESC
                LIMIT 500"""
        )
        user_id = current_user.get("id") or current_user.get("username")
        total = 0
        por_severidad = {"urgente": 0, "atencion": 0, "info": 0, "ok": 0}
        for r in rows:
            aud = parse_jsonb(r["audiencia"]) or {}
            if not _le_aplica_al_usuario(aud, current_user):
                continue
            leida_por = parse_jsonb(r["leida_por"]) or []
            if str(user_id) in [str(x) for x in leida_por]:
                continue
            total += 1
            sev = r["severidad"] or "info"
            if sev in por_severidad:
                por_severidad[sev] += 1
        return {"total": total, "por_severidad": por_severidad}


@router.post("/notificaciones/{notif_id}/marcar-leida")
async def marcar_leida(notif_id: str, current_user: dict = Depends(get_current_user)):
    from server import get_pool
    pool = await get_pool()
    user_id = str(current_user.get("id") or current_user.get("username"))
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, leida_por FROM prod_notificaciones WHERE id = $1",
            notif_id,
        )
        if not row:
            raise HTTPException(404, "Notificación no encontrada")
        leida_por = parse_jsonb(row["leida_por"]) or []
        if user_id in [str(x) for x in leida_por]:
            return {"ok": True, "ya_estaba": True}
        leida_por.append(user_id)
        await conn.execute(
            "UPDATE prod_notificaciones SET leida_por = $1::jsonb WHERE id = $2",
            json.dumps(leida_por), notif_id,
        )
        return {"ok": True}


@router.post("/notificaciones/marcar-todas-leidas")
async def marcar_todas_leidas(current_user: dict = Depends(get_current_user)):
    """Marca como leídas todas las notificaciones que le tocan al usuario actual."""
    from server import get_pool
    pool = await get_pool()
    user_id = str(current_user.get("id") or current_user.get("username"))
    actualizadas = 0
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, audiencia, leida_por
                 FROM prod_notificaciones
                ORDER BY created_at DESC
                LIMIT 500"""
        )
        for r in rows:
            aud = parse_jsonb(r["audiencia"]) or {}
            if not _le_aplica_al_usuario(aud, current_user):
                continue
            leida_por = parse_jsonb(r["leida_por"]) or []
            if user_id in [str(x) for x in leida_por]:
                continue
            leida_por.append(user_id)
            await conn.execute(
                "UPDATE prod_notificaciones SET leida_por = $1::jsonb WHERE id = $2",
                json.dumps(leida_por), r["id"],
            )
            actualizadas += 1
    return {"ok": True, "actualizadas": actualizadas}


@router.post("/notificaciones/test")
async def crear_notificacion_test(
    input: NotifTestInput,
    current_user: dict = Depends(get_current_user),
):
    """Crea una notificación manualmente — útil mientras no hay triggers reales.

    Solo admin para evitar abuso.
    """
    if (current_user.get("rol") or "").lower() != "admin":
        raise HTTPException(403, "Solo admin puede crear notificaciones de prueba")
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        aud_dict = input.audiencia.model_dump() if input.audiencia else None
        notif_id = await crear_notificacion(
            conn,
            tipo=input.tipo,
            severidad=input.severidad,
            titulo=input.titulo,
            mensaje=input.mensaje,
            registro_id=input.registro_id,
            entidad_tipo=input.entidad_tipo,
            entidad_id=input.entidad_id,
            audiencia=aud_dict,
            origen="manual",
        )
        return {"ok": True, "id": notif_id}
