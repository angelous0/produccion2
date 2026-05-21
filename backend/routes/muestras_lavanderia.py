"""
Muestras de lavandería: envíos parciales de un corte a probar colores
antes de procesar la producción completa.

Flujo:
  1. Operario crea muestra → especifica fecha_envio + colores con cantidades.
  2. Mientras fecha_retorno IS NULL, las prendas están "fuera del corte"
     (stock disponible del corte = total - suma de muestras activas).
  3. Cuando vuelven, se setea fecha_retorno → stock se reintegra.
  4. Por cada color de la muestra, se marca decision = 'aprobado' | 'rechazado'
     con correcciones opcionales (notas para reintentar el color rechazado).
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date

from db import get_pool
from auth_utils import get_current_user

router = APIRouter(prefix="/api", tags=["muestras-lavanderia"])


# ──────────────── Modelos ────────────────

class ColorMuestraInput(BaseModel):
    color_id: Optional[str] = None
    color_nombre: str
    cantidad: int = Field(gt=0)
    observaciones_envio: Optional[str] = None


class MuestraCreateInput(BaseModel):
    fecha_envio: date
    destino: str = 'lavanderia'
    observaciones: Optional[str] = None
    persona_lavanderia_id: Optional[str] = None
    colores: List[ColorMuestraInput]


class MuestraRetornoInput(BaseModel):
    fecha_retorno: date
    observaciones: Optional[str] = None


class DecisionColorInput(BaseModel):
    decision: str  # 'aprobado' | 'rechazado'
    correcciones: Optional[str] = None


# ──────────────── Helpers ────────────────

def _estado_muestra(fecha_retorno, colores: list) -> str:
    """Calcula el estado lógico de la muestra a partir de los datos."""
    if fecha_retorno is None:
        return 'enviada'
    decisiones = [c.get('decision') for c in colores]
    pendientes = sum(1 for d in decisiones if d is None)
    aprobados = sum(1 for d in decisiones if d == 'aprobado')
    rechazados = sum(1 for d in decisiones if d == 'rechazado')
    total = len(colores)
    if pendientes > 0:
        return 'pendiente_decision'
    if aprobados == total:
        return 'aprobada'
    if rechazados == total:
        return 'rechazada'
    return 'parcial'


async def _enriquecer_muestras(conn, muestras: list) -> list:
    if not muestras:
        return []
    muestra_ids = [m['id'] for m in muestras]
    colores = await conn.fetch("""
        SELECT id, muestra_id, color_id, color_nombre, cantidad,
               observaciones_envio,
               decision, correcciones, decidido_at, decidido_por
          FROM prod_registro_muestra_colores
         WHERE muestra_id = ANY($1::int[])
         ORDER BY id
    """, muestra_ids)
    por_muestra = {}
    for c in colores:
        por_muestra.setdefault(c['muestra_id'], []).append(dict(c))

    # Mapeo persona_lavanderia_id → nombre
    persona_ids = [m['persona_lavanderia_id'] for m in muestras if m.get('persona_lavanderia_id')]
    persona_map = {}
    if persona_ids:
        rows = await conn.fetch(
            "SELECT id, nombre FROM prod_personas_produccion WHERE id = ANY($1::varchar[])",
            list(set(persona_ids)),
        )
        persona_map = {r['id']: r['nombre'] for r in rows}

    result = []
    for m in muestras:
        cols = por_muestra.get(m['id'], [])
        pid = m.get('persona_lavanderia_id')
        result.append({
            **dict(m),
            "colores": cols,
            "cantidad_total": sum(c['cantidad'] for c in cols),
            "estado": _estado_muestra(m['fecha_retorno'], cols),
            "lavanderia_nombre": persona_map.get(pid) if pid else None,
        })
    return result


# ──────────────── Endpoints ────────────────

@router.get("/registros/{registro_id}/muestras-lavanderia")
async def listar_muestras(registro_id: str, _user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        muestras = await conn.fetch("""
            SELECT id, registro_id, fecha_envio, fecha_retorno, destino,
                   observaciones, persona_lavanderia_id, created_at, created_by
              FROM prod_registro_muestras
             WHERE registro_id = $1
             ORDER BY fecha_envio DESC, id DESC
        """, registro_id)
        return await _enriquecer_muestras(conn, muestras)


@router.get("/muestras-lavanderia/lavanderias")
async def listar_lavanderias(_user=Depends(get_current_user)):
    """Personas con servicio 'Lavandería' activo, ordenadas por nombre."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        servicio = await conn.fetchrow(
            "SELECT id FROM prod_servicios_produccion WHERE nombre ILIKE 'lavander%' ORDER BY orden ASC, nombre ASC LIMIT 1"
        )
        if not servicio:
            return []
        sid = str(servicio['id'])
        rows = await conn.fetch("""
            SELECT id, nombre
              FROM prod_personas_produccion
             WHERE COALESCE(activo, TRUE) = TRUE
               AND servicios @> $1::jsonb
             ORDER BY orden ASC NULLS LAST, nombre ASC
        """, f'[{{"servicio_id":"{sid}"}}]')
        return [{"id": r['id'], "nombre": r['nombre']} for r in rows]


@router.post("/registros/{registro_id}/muestras-lavanderia")
async def crear_muestra(
    registro_id: str,
    input: MuestraCreateInput,
    current_user: dict = Depends(get_current_user),
):
    if not input.colores:
        raise HTTPException(400, "Incluye al menos un color con cantidad > 0")
    pool = await get_pool()
    username = current_user.get('username')
    async with pool.acquire() as conn:
        reg = await conn.fetchval("SELECT id FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(404, "Registro no encontrado")

        async with conn.transaction():
            muestra_id = await conn.fetchval("""
                INSERT INTO prod_registro_muestras
                    (registro_id, fecha_envio, destino, observaciones, created_by, persona_lavanderia_id)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            """, registro_id, input.fecha_envio, input.destino, input.observaciones, username, input.persona_lavanderia_id)

            for c in input.colores:
                await conn.execute("""
                    INSERT INTO prod_registro_muestra_colores
                        (muestra_id, color_id, color_nombre, cantidad, observaciones_envio)
                    VALUES ($1, $2, $3, $4, $5)
                """, muestra_id, c.color_id, c.color_nombre, c.cantidad, c.observaciones_envio)

            row = await conn.fetchrow("""
                SELECT id, registro_id, fecha_envio, fecha_retorno, destino,
                       observaciones, persona_lavanderia_id, created_at, created_by
                  FROM prod_registro_muestras
                 WHERE id = $1
            """, muestra_id)
        return (await _enriquecer_muestras(conn, [row]))[0]


@router.put("/muestras-lavanderia/{muestra_id}/retorno")
async def marcar_retorno(
    muestra_id: int,
    input: MuestraRetornoInput,
    _user=Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existe = await conn.fetchval("SELECT id FROM prod_registro_muestras WHERE id = $1", muestra_id)
        if not existe:
            raise HTTPException(404, "Muestra no encontrada")
        await conn.execute("""
            UPDATE prod_registro_muestras
               SET fecha_retorno = $1,
                   observaciones = COALESCE($2, observaciones)
             WHERE id = $3
        """, input.fecha_retorno, input.observaciones, muestra_id)
        row = await conn.fetchrow("""
            SELECT id, registro_id, fecha_envio, fecha_retorno, destino,
                   observaciones, created_at, created_by
              FROM prod_registro_muestras WHERE id = $1
        """, muestra_id)
        return (await _enriquecer_muestras(conn, [row]))[0]


class MuestraPatchInput(BaseModel):
    persona_lavanderia_id: Optional[str] = None
    observaciones: Optional[str] = None


@router.put("/muestras-lavanderia/{muestra_id}")
async def editar_muestra(
    muestra_id: int,
    input: MuestraPatchInput,
    _user=Depends(get_current_user),
):
    """Edita campos de una muestra existente (lavandería, observaciones).

    Para limpiar la lavandería envía `persona_lavanderia_id: null` explícito.
    Las decisiones de colores y fechas no se tocan acá.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        existe = await conn.fetchval(
            "SELECT id FROM prod_registro_muestras WHERE id = $1", muestra_id
        )
        if not existe:
            raise HTTPException(404, "Muestra no encontrada")
        # Construir UPDATE dinámico solo con campos presentes en el body.
        sets = []
        params: list = []
        body = input.dict(exclude_unset=True)
        if "persona_lavanderia_id" in body:
            params.append(body["persona_lavanderia_id"])
            sets.append(f"persona_lavanderia_id = ${len(params)}")
        if "observaciones" in body:
            params.append(body["observaciones"])
            sets.append(f"observaciones = ${len(params)}")
        if not sets:
            raise HTTPException(400, "Nada que actualizar")
        params.append(muestra_id)
        await conn.execute(
            f"UPDATE prod_registro_muestras SET {', '.join(sets)} WHERE id = ${len(params)}",
            *params,
        )
        row = await conn.fetchrow("""
            SELECT id, registro_id, fecha_envio, fecha_retorno, destino,
                   observaciones, persona_lavanderia_id, created_at, created_by
              FROM prod_registro_muestras WHERE id = $1
        """, muestra_id)
        return (await _enriquecer_muestras(conn, [row]))[0]


@router.delete("/muestras-lavanderia/{muestra_id}/retorno")
async def deshacer_retorno(muestra_id: int, _user=Depends(get_current_user)):
    """Limpia la fecha_retorno (deshace la devolución por error).

    Bloqueado si algún color ya tiene decisión (aprobado/rechazado) — en ese
    caso usar 'reenviar' para crear una muestra hija con los rechazados.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        existe = await conn.fetchval(
            "SELECT id FROM prod_registro_muestras WHERE id = $1", muestra_id
        )
        if not existe:
            raise HTTPException(404, "Muestra no encontrada")
        decididos = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_registro_muestra_colores WHERE muestra_id = $1 AND decision IS NOT NULL",
            muestra_id,
        )
        if decididos and decididos > 0:
            raise HTTPException(
                400,
                "No se puede deshacer la devolución: ya hay colores con decisión. "
                "Si necesitas re-enviar algunos colores rechazados, usa 'Reenviar rechazados'."
            )
        await conn.execute(
            "UPDATE prod_registro_muestras SET fecha_retorno = NULL WHERE id = $1",
            muestra_id,
        )
        row = await conn.fetchrow("""
            SELECT id, registro_id, fecha_envio, fecha_retorno, destino,
                   observaciones, created_at, created_by
              FROM prod_registro_muestras WHERE id = $1
        """, muestra_id)
        return (await _enriquecer_muestras(conn, [row]))[0]


class ReenvioInput(BaseModel):
    fecha_envio: date
    observaciones: Optional[str] = None
    persona_lavanderia_id: Optional[str] = None


@router.post("/muestras-lavanderia/{muestra_id}/reenviar")
async def reenviar_rechazados(
    muestra_id: int,
    input: ReenvioInput,
    current_user: dict = Depends(get_current_user),
):
    """Crea una muestra HIJA con los colores rechazados de la muestra padre.

    La muestra padre queda como está (con sus decisiones). La hija arranca
    'Enviada' con la nueva fecha_envio. Linkage en `reenviada_desde_id`.
    Si no hay colores rechazados, devuelve 400.
    """
    pool = await get_pool()
    username = current_user.get('username')
    async with pool.acquire() as conn:
        padre = await conn.fetchrow(
            "SELECT id, registro_id, persona_lavanderia_id FROM prod_registro_muestras WHERE id = $1",
            muestra_id,
        )
        if not padre:
            raise HTTPException(404, "Muestra padre no encontrada")
        # Si la hija no especifica lavandería, hereda la del padre.
        persona_id_hija = input.persona_lavanderia_id or padre['persona_lavanderia_id']
        rechazados = await conn.fetch("""
            SELECT color_id, color_nombre, cantidad, observaciones_envio, correcciones
              FROM prod_registro_muestra_colores
             WHERE muestra_id = $1 AND decision = 'rechazado'
             ORDER BY id
        """, muestra_id)
        if not rechazados:
            raise HTTPException(400, "Esta muestra no tiene colores rechazados para reenviar")

        async with conn.transaction():
            nueva_id = await conn.fetchval("""
                INSERT INTO prod_registro_muestras
                    (registro_id, fecha_envio, destino, observaciones, created_by, reenviada_desde_id, persona_lavanderia_id)
                VALUES ($1, $2, 'lavanderia', $3, $4, $5, $6)
                RETURNING id
            """, padre['registro_id'], input.fecha_envio, input.observaciones, username, muestra_id, persona_id_hija)

            for c in rechazados:
                # Las correcciones del color original se copian como observación
                # de envío de la hija (para que lavandería sepa qué corregir).
                obs = c['observaciones_envio']
                if c['correcciones']:
                    obs = f"Corrección: {c['correcciones']}" if not obs else f"{obs} · Corrección: {c['correcciones']}"
                await conn.execute("""
                    INSERT INTO prod_registro_muestra_colores
                        (muestra_id, color_id, color_nombre, cantidad, observaciones_envio)
                    VALUES ($1, $2, $3, $4, $5)
                """, nueva_id, c['color_id'], c['color_nombre'], c['cantidad'], obs)

            row = await conn.fetchrow("""
                SELECT id, registro_id, fecha_envio, fecha_retorno, destino,
                       observaciones, persona_lavanderia_id, created_at, created_by
                  FROM prod_registro_muestras WHERE id = $1
            """, nueva_id)
        return (await _enriquecer_muestras(conn, [row]))[0]


@router.put("/muestras-lavanderia/colores/{color_row_id}")
async def decidir_color(
    color_row_id: int,
    input: DecisionColorInput,
    current_user: dict = Depends(get_current_user),
):
    if input.decision not in ('aprobado', 'rechazado'):
        raise HTTPException(400, "decision debe ser 'aprobado' o 'rechazado'")
    pool = await get_pool()
    username = current_user.get('username')
    async with pool.acquire() as conn:
        existe = await conn.fetchval(
            "SELECT id FROM prod_registro_muestra_colores WHERE id = $1", color_row_id
        )
        if not existe:
            raise HTTPException(404, "Color de muestra no encontrado")
        await conn.execute("""
            UPDATE prod_registro_muestra_colores
               SET decision = $1,
                   correcciones = $2,
                   decidido_at = NOW(),
                   decidido_por = $3
             WHERE id = $4
        """, input.decision, input.correcciones, username, color_row_id)
        return {"ok": True}


@router.delete("/muestras-lavanderia/{muestra_id}")
async def eliminar_muestra(muestra_id: int, _user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existe = await conn.fetchval("SELECT id FROM prod_registro_muestras WHERE id = $1", muestra_id)
        if not existe:
            raise HTTPException(404, "Muestra no encontrada")
        await conn.execute("DELETE FROM prod_registro_muestras WHERE id = $1", muestra_id)
        return {"ok": True}


# ──────────────── Reporte global ────────────────

@router.get("/muestras-lavanderia")
async def reporte_muestras(
    empresa_id: int = Query(7),
    solo_en_proceso: bool = Query(True, description="Solo muestras enviadas o pendientes de decisión"),
    estado: Optional[str] = Query(None, description="Filtra por estado calculado: enviada, pendiente_decision, aprobada, rechazada, parcial"),
    marca_id: Optional[str] = None,
    tipo_id: Optional[str] = None,
    n_corte: Optional[str] = None,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    limit: int = Query(500, ge=1, le=2000),
    _user=Depends(get_current_user),
):
    """Listado global de muestras de lavandería con datos del corte asociado.

    Filtros aplicables sobre el registro/corte. El estado de la muestra se
    calcula post-fetch (depende de fecha_retorno + decisión de cada color).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["r.empresa_id = $1"]
        params: list = [empresa_id]
        idx = 2

        if desde:
            params.append(desde)
            conditions.append(f"m.fecha_envio >= ${idx}")
            idx += 1
        if hasta:
            params.append(hasta)
            conditions.append(f"m.fecha_envio <= ${idx}")
            idx += 1
        if n_corte:
            params.append(f"%{n_corte}%")
            conditions.append(f"r.n_corte ILIKE ${idx}")
            idx += 1
        if marca_id:
            params.append(marca_id)
            conditions.append(
                f"(mo.marca_id = ${idx} OR r.modelo_manual->>'marca_id' = ${idx})"
            )
            idx += 1
        if tipo_id:
            params.append(tipo_id)
            conditions.append(
                f"(mo.tipo_id = ${idx} OR r.modelo_manual->>'tipo_id' = ${idx})"
            )
            idx += 1

        where_sql = " AND ".join(conditions)
        params.append(limit)
        limit_idx = idx

        rows = await conn.fetch(f"""
            SELECT m.id, m.registro_id, m.fecha_envio, m.fecha_retorno, m.destino,
                   m.observaciones, m.persona_lavanderia_id, m.created_at, m.created_by,
                   r.n_corte, r.estado AS estado_corte,
                   COALESCE(mo.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                   COALESCE(ma.nombre, mma.nombre, r.modelo_manual->>'marca_texto') AS marca,
                   COALESCE(tp.nombre, mtp.nombre, r.modelo_manual->>'tipo_texto') AS tipo,
                   COALESCE(en.nombre, men.nombre, r.modelo_manual->>'entalle_texto') AS entalle,
                   COALESCE(te.nombre, mte.nombre, r.modelo_manual->>'tela_texto') AS tela,
                   COALESCE(hi.nombre, mhi.nombre, r.modelo_manual->>'hilo_texto') AS hilo
              FROM prod_registro_muestras m
              JOIN prod_registros r       ON r.id = m.registro_id
              LEFT JOIN prod_modelos mo   ON mo.id = r.modelo_id
              LEFT JOIN prod_marcas ma    ON ma.id = mo.marca_id
              LEFT JOIN prod_tipos tp     ON tp.id = mo.tipo_id
              LEFT JOIN prod_entalles en  ON en.id = mo.entalle_id
              LEFT JOIN prod_telas te     ON te.id = mo.tela_id
              LEFT JOIN prod_hilos hi     ON hi.id = mo.hilo_id
              LEFT JOIN prod_marcas mma   ON mma.id::text = r.modelo_manual->>'marca_id'
              LEFT JOIN prod_tipos mtp    ON mtp.id::text = r.modelo_manual->>'tipo_id'
              LEFT JOIN prod_entalles men ON men.id::text = r.modelo_manual->>'entalle_id'
              LEFT JOIN prod_telas mte    ON mte.id::text = r.modelo_manual->>'tela_id'
              LEFT JOIN prod_hilos mhi    ON mhi.id::text = r.modelo_manual->>'hilo_id'
             WHERE {where_sql}
             ORDER BY m.fecha_envio DESC, m.id DESC
             LIMIT ${limit_idx}
        """, *params)

        enriquecidas = await _enriquecer_muestras(conn, rows)

    # Filtro post-fetch por estado (depende del cálculo de _estado_muestra)
    def _pasa(m):
        if solo_en_proceso and m["estado"] not in ("enviada", "pendiente_decision"):
            return False
        if estado and m["estado"] != estado:
            return False
        return True

    result = []
    today = date.today()
    for m in enriquecidas:
        if not _pasa(m):
            continue
        fe = m.get("fecha_envio")
        fr = m.get("fecha_retorno")
        # Días en lavandería: si volvió, diff retorno-envío; si no, hoy-envío.
        if fe:
            ref = fr or today
            dias = (ref - fe).days
        else:
            dias = None
        result.append({
            "id": m["id"],
            "registro_id": m["registro_id"],
            "n_corte": m["n_corte"],
            "modelo": m["modelo"] or "",
            "marca": m["marca"] or "",
            "tipo": m["tipo"] or "",
            "entalle": m["entalle"] or "",
            "tela": m["tela"] or "",
            "hilo": m["hilo"] or "",
            "persona_lavanderia_id": m.get("persona_lavanderia_id"),
            "lavanderia_nombre": m.get("lavanderia_nombre"),
            "estado_corte": m["estado_corte"],
            "estado": m["estado"],
            "fecha_envio": fe.isoformat() if fe else None,
            "fecha_retorno": fr.isoformat() if fr else None,
            "dias_en_lavanderia": dias,
            "destino": m["destino"],
            "observaciones": m["observaciones"],
            "cantidad_total": m["cantidad_total"],
            "colores": [
                {
                    "id": c["id"],
                    "color": c["color_nombre"],
                    "color_nombre": c["color_nombre"],
                    "color_id": c.get("color_id"),
                    "cantidad": c["cantidad"],
                    "observaciones_envio": c.get("observaciones_envio"),
                    "decision": c["decision"],
                    "correcciones": c.get("correcciones"),
                }
                for c in m["colores"]
            ],
            "created_at": m["created_at"].isoformat() if m["created_at"] else None,
            "created_by": m["created_by"],
        })
    return result
