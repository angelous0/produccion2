"""
Router: Publicación de Cortes (fotografía + página web).

Controla qué cortes ya fueron fotografiados y publicados en la web.
Solo entran los cortes que llegaron a "Para Acabado" o más adelante.
Cuando ambas casillas están marcadas el corte se considera REALIZADO y
sale de la vista de pendientes (queda accesible en la pestaña Realizados,
y se puede desmarcar).

Se guarda quién y cuándo marcó cada casilla, para poder auditar y deshacer.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

from db import get_pool
from auth_utils import get_current_user

router = APIRouter(prefix="/api", tags=["publicacion-cortes"])


# ============================================================================
# CONSTANTES
# ============================================================================
# Etapas que califican: "Para Acabado" en adelante.
# Nota: se incluye "Producto Terminado", que STAGE_ORDER (reportes_produccion)
# y ETAPAS_CALIDAD (fallados_v2) omiten pese a existir en los datos.
ETAPAS_PUBLICABLES = [
    "Para Acabado",
    "Acabado",
    "Producto Terminado",
    "Almacen PT",
    "Tienda",
]


async def init_publicacion_tables():
    """Crea la tabla de publicación (idempotente, corre en cada arranque)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS produccion.prod_corte_publicacion (
                registro_id VARCHAR PRIMARY KEY,
                tiene_foto  BOOLEAN   NOT NULL DEFAULT FALSE,
                foto_por    VARCHAR,
                foto_at     TIMESTAMP,
                en_web      BOOLEAN   NOT NULL DEFAULT FALSE,
                web_por     VARCHAR,
                web_at      TIMESTAMP,
                created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_corte_publicacion_realizado
            ON produccion.prod_corte_publicacion(tiene_foto, en_web)
        """)


# ============================================================================
# MODELOS
# ============================================================================
class MarcarInput(BaseModel):
    tiene_foto: Optional[bool] = None
    en_web: Optional[bool] = None


class MarcarBulkInput(BaseModel):
    registro_ids: List[str]
    tiene_foto: Optional[bool] = None
    en_web: Optional[bool] = None


def _usuario(current_user: dict) -> str:
    return (
        current_user.get("nombre_completo")
        or current_user.get("nombre")
        or current_user.get("username")
        or "sistema"
    )


# ============================================================================
# GET /api/publicacion-cortes
# ============================================================================
@router.get("/publicacion-cortes")
async def listar_publicacion(
    vista: str = Query("pendientes", description="pendientes | realizados | todos"),
    estado: Optional[str] = Query(None),
    marca: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="busca por n° de corte o modelo"),
    current_user: dict = Depends(get_current_user),
):
    """Lista los cortes publicables con su estado de foto/web + KPIs."""
    if vista not in ("pendientes", "realizados", "todos"):
        raise HTTPException(400, "vista debe ser: pendientes, realizados o todos")

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            WITH tallas AS (
              SELECT registro_id, SUM(cantidad_real) AS qty
              FROM prod_registro_tallas GROUP BY registro_id
            )
            SELECT r.id::text                                              AS registro_id,
                   COALESCE(NULLIF(TRIM(r.n_corte), ''), '—')              AS n_corte,
                   r.estado,
                   COALESCE(r.modelo_manual->>'nombre_modelo', '')         AS modelo,
                   COALESCE(mar.nombre, r.modelo_manual->>'marca_texto','') AS marca,
                   COALESCE(ln.nombre, 'Sin línea')                        AS linea_negocio,
                   COALESCE(t.qty, 0)::int                                 AS prendas,
                   r.fecha_envio_tienda,
                   COALESCE(p.tiene_foto, FALSE)                           AS tiene_foto,
                   p.foto_por, p.foto_at,
                   COALESCE(p.en_web, FALSE)                               AS en_web,
                   p.web_por, p.web_at
            FROM prod_registros r
            LEFT JOIN produccion.prod_corte_publicacion p ON p.registro_id = r.id
            LEFT JOIN prod_marcas mar ON mar.id::text = r.modelo_manual->>'marca_id'
            LEFT JOIN finanzas2.cont_linea_negocio ln ON ln.id = r.linea_negocio_id
            LEFT JOIN tallas t ON t.registro_id = r.id
            WHERE r.estado = ANY($1::text[])
              AND COALESCE(r.estado_op, '') <> 'ANULADA'
            ORDER BY r.fecha_creacion DESC
        """, ETAPAS_PUBLICABLES)

        items = []
        kpis = {"pendientes": 0, "solo_foto": 0, "solo_web": 0, "realizados": 0}

        for r in rows:
            foto, web = bool(r["tiene_foto"]), bool(r["en_web"])
            realizado = foto and web

            # KPIs siempre sobre el universo completo (sin filtros de vista)
            if realizado:
                kpis["realizados"] += 1
            else:
                kpis["pendientes"] += 1
                if foto:
                    kpis["solo_foto"] += 1
                elif web:
                    kpis["solo_web"] += 1

            if vista == "pendientes" and realizado:
                continue
            if vista == "realizados" and not realizado:
                continue
            if estado and r["estado"] != estado:
                continue
            if marca and r["marca"] != marca:
                continue
            if q:
                term = q.lower().strip()
                if term not in (r["n_corte"] or "").lower() and term not in (r["modelo"] or "").lower():
                    continue

            items.append({
                "registro_id": r["registro_id"],
                "n_corte": r["n_corte"],
                "estado": r["estado"],
                "modelo": r["modelo"],
                "marca": r["marca"],
                "linea_negocio": r["linea_negocio"],
                "prendas": r["prendas"],
                "tiene_foto": foto,
                "foto_por": r["foto_por"],
                "foto_at": r["foto_at"].isoformat() if r["foto_at"] else None,
                "en_web": web,
                "web_por": r["web_por"],
                "web_at": r["web_at"].isoformat() if r["web_at"] else None,
                "realizado": realizado,
            })

        return {"items": items, "kpis": kpis, "total": len(items)}


# ============================================================================
# PATCH /api/publicacion-cortes/{registro_id}
# ============================================================================
@router.patch("/publicacion-cortes/{registro_id}")
async def marcar_publicacion(
    registro_id: str,
    data: MarcarInput,
    current_user: dict = Depends(get_current_user),
):
    """Marca/desmarca fotografía o página web de un corte.

    Guarda quién y cuándo. Al desmarcar se limpian usuario y fecha, para que
    no quede un rastro que ya no corresponde.
    """
    if data.tiene_foto is None and data.en_web is None:
        raise HTTPException(400, "Indica tiene_foto y/o en_web")

    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow(
            "SELECT id, estado FROM prod_registros WHERE id = $1", registro_id
        )
        if not reg:
            raise HTTPException(404, "Corte no encontrado")
        if reg["estado"] not in ETAPAS_PUBLICABLES:
            raise HTTPException(
                400,
                f"El corte está en '{reg['estado']}'. Solo se publican desde 'Para Acabado' en adelante.",
            )

        usuario = _usuario(current_user)
        ahora = datetime.now(timezone.utc).replace(tzinfo=None)

        await conn.execute("""
            INSERT INTO produccion.prod_corte_publicacion (registro_id)
            VALUES ($1) ON CONFLICT (registro_id) DO NOTHING
        """, registro_id)

        if data.tiene_foto is not None:
            await conn.execute("""
                UPDATE produccion.prod_corte_publicacion
                SET tiene_foto = $1,
                    foto_por   = CASE WHEN $1 THEN $2::varchar ELSE NULL END,
                    foto_at    = CASE WHEN $1 THEN $3::timestamp ELSE NULL END,
                    updated_at = $3::timestamp
                WHERE registro_id = $4
            """, data.tiene_foto, usuario, ahora, registro_id)

        if data.en_web is not None:
            await conn.execute("""
                UPDATE produccion.prod_corte_publicacion
                SET en_web     = $1,
                    web_por    = CASE WHEN $1 THEN $2::varchar ELSE NULL END,
                    web_at     = CASE WHEN $1 THEN $3::timestamp ELSE NULL END,
                    updated_at = $3::timestamp
                WHERE registro_id = $4
            """, data.en_web, usuario, ahora, registro_id)

        fila = await conn.fetchrow("""
            SELECT tiene_foto, foto_por, foto_at, en_web, web_por, web_at
            FROM produccion.prod_corte_publicacion WHERE registro_id = $1
        """, registro_id)

        return {
            "ok": True,
            "registro_id": registro_id,
            "tiene_foto": fila["tiene_foto"],
            "foto_por": fila["foto_por"],
            "foto_at": fila["foto_at"].isoformat() if fila["foto_at"] else None,
            "en_web": fila["en_web"],
            "web_por": fila["web_por"],
            "web_at": fila["web_at"].isoformat() if fila["web_at"] else None,
            "realizado": bool(fila["tiene_foto"] and fila["en_web"]),
        }


# ============================================================================
# POST /api/publicacion-cortes/bulk
# ============================================================================
@router.post("/publicacion-cortes/bulk")
async def marcar_publicacion_bulk(
    data: MarcarBulkInput,
    current_user: dict = Depends(get_current_user),
):
    """Marca varios cortes de una vez (para el backlog histórico)."""
    if not data.registro_ids:
        raise HTTPException(400, "registro_ids no puede estar vacío")
    if data.tiene_foto is None and data.en_web is None:
        raise HTTPException(400, "Indica tiene_foto y/o en_web")

    pool = await get_pool()
    async with pool.acquire() as conn:
        validos = await conn.fetch("""
            SELECT id::text AS id FROM prod_registros
            WHERE id = ANY($1::text[]) AND estado = ANY($2::text[])
              AND COALESCE(estado_op,'') <> 'ANULADA'
        """, data.registro_ids, ETAPAS_PUBLICABLES)
        ids = [v["id"] for v in validos]
        if not ids:
            raise HTTPException(400, "Ningún corte válido (deben estar en 'Para Acabado' o más adelante)")

        usuario = _usuario(current_user)
        ahora = datetime.now(timezone.utc).replace(tzinfo=None)

        async with conn.transaction():
            await conn.execute("""
                INSERT INTO produccion.prod_corte_publicacion (registro_id)
                SELECT unnest($1::text[]) ON CONFLICT (registro_id) DO NOTHING
            """, ids)

            if data.tiene_foto is not None:
                await conn.execute("""
                    UPDATE produccion.prod_corte_publicacion
                    SET tiene_foto = $1,
                        foto_por   = CASE WHEN $1 THEN $2::varchar ELSE NULL END,
                        foto_at    = CASE WHEN $1 THEN $3::timestamp ELSE NULL END,
                        updated_at = $3::timestamp
                    WHERE registro_id = ANY($4::text[])
                """, data.tiene_foto, usuario, ahora, ids)

            if data.en_web is not None:
                await conn.execute("""
                    UPDATE produccion.prod_corte_publicacion
                    SET en_web     = $1,
                        web_por    = CASE WHEN $1 THEN $2::varchar ELSE NULL END,
                        web_at     = CASE WHEN $1 THEN $3::timestamp ELSE NULL END,
                        updated_at = $3::timestamp
                    WHERE registro_id = ANY($4::text[])
                """, data.en_web, usuario, ahora, ids)

        return {"ok": True, "actualizados": len(ids), "omitidos": len(data.registro_ids) - len(ids)}
