"""
Router: Fallados v2 — Rediseño UX

Endpoints del nuevo módulo de fallados (no toca el legacy de trazabilidad.py).
Soporta:
  - Lista de cortes pendientes de revisión (operario móvil).
  - Marcar "SIN FALLADOS" (Opción B: una revisión por registro hasta que
    aparezca un fallado posterior — manejado por trigger en SQL).
  - Registrar entregas parciales del flujo SERVICIO.
  - Dar prórroga a un arreglo (con motivo y histórico).
  - Tablero supervisor consolidado por urgencia.

Requiere migración 018_fallados_v2.sql aplicada.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime, timedelta, timezone
import uuid
import json

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict


router = APIRouter(prefix="/api", tags=["fallados-v2"])


# ============================================================================
# CONSTANTES
# ============================================================================
ETAPAS_CALIDAD = ["Para Acabado", "Acabado", "Almacén PT", "Tienda"]
ROLES_PUEDEN_REVISAR = {"admin", "acabado", "supervisor_acabado"}
ROLES_PUEDEN_PRORROGA = {"admin", "supervisor_acabado"}
MAX_PRORROGAS = 2
MAX_DIAS_POR_PRORROGA = 3


def _ensure_rol(user: dict, roles_permitidos: set):
    """Valida que el usuario tenga al menos uno de los roles permitidos."""
    rol = (user.get("rol") or user.get("role") or "").lower()
    if rol not in roles_permitidos:
        raise HTTPException(
            status_code=403,
            detail=f"Acción no permitida para rol '{rol}'. Requiere: {sorted(roles_permitidos)}"
        )


def _user_id(user: dict) -> str:
    return str(user.get("id") or user.get("user_id") or user.get("username") or "unknown")


def _user_name(user: dict) -> str:
    return str(
        user.get("nombre_completo")
        or user.get("nombre")
        or user.get("username")
        or "unknown"
    )


# ============================================================================
# MODELS
# ============================================================================
class RevisarSinFalladosIn(BaseModel):
    observacion: Optional[str] = None


class EntregaParcialIn(BaseModel):
    cant_ok: int = Field(0, ge=0)
    cant_liq: int = Field(0, ge=0)
    cant_merma: int = Field(0, ge=0)
    fecha: Optional[str] = None       # ISO YYYY-MM-DD; default hoy
    observacion: Optional[str] = None


class ProrrogaIn(BaseModel):
    dias_adicionales: int = Field(..., ge=1, le=MAX_DIAS_POR_PRORROGA)
    motivo: str = Field(..., min_length=3, max_length=300)


# ============================================================================
# 1. GET /api/cortes/pendientes-revision
#    Lista de cortes para la pantalla del operario.
# ============================================================================
@router.get("/cortes/pendientes-revision")
async def cortes_pendientes_revision(
    etapa: Optional[str] = Query(None, description="Filtra una etapa específica"),
    q: Optional[str] = Query(None, description="Búsqueda libre (N° corte o modelo)"),
    incluir_resueltos: bool = Query(False, description="Si True, también devuelve los ya revisados sin fallados"),
    empresa_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Regla de visibilidad (Opción B):

    Un corte aparece si:
      - estado IN ('Para Acabado','Acabado','Almacén PT','Tienda')
      - estado_op IN ('ABIERTA','EN_PROCESO')
      - Y al menos una de:
          (a) Nunca fue revisado (no hay fila en prod_revision_calidad), o
          (b) Tiene fallados con saldo pendiente, o
          (c) Tiene arreglos abiertos (cantidad - recuperada - liq - merma > 0)

    Si `incluir_resueltos=True`, también incluye los que solo cumplen "revisado sin fallados".
    """
    if etapa and etapa not in ETAPAS_CALIDAD:
        raise HTTPException(400, f"Etapa inválida. Permitidas: {ETAPAS_CALIDAD}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        conds = [
            "r.estado = ANY($1::varchar[])",
            "r.estado_op IN ('ABIERTA','EN_PROCESO')",
        ]
        params: list = [[etapa] if etapa else ETAPAS_CALIDAD]
        if empresa_id is not None:
            params.append(empresa_id)
            conds.append(f"r.empresa_id = ${len(params)}")
        if q:
            params.append(f"%{q.lower()}%")
            conds.append(
                f"(LOWER(r.n_corte) LIKE ${len(params)} "
                f"OR LOWER(COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo','')) LIKE ${len(params)})"
            )

        where_sql = " AND ".join(conds)

        sql = f"""
            WITH base AS (
                SELECT
                    r.id,
                    r.n_corte,
                    r.estado AS etapa_actual,
                    r.estado_op,
                    r.urgente,
                    r.fecha_entrega_final,
                    r.empresa_id,
                    COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                    COALESCE(ma.nombre,  r.modelo_manual->>'marca_texto')   AS marca,
                    COALESCE(
                        (SELECT SUM(rt.cantidad_real)
                         FROM prod_registro_tallas rt WHERE rt.registro_id = r.id),
                        0
                    ) AS total_prendas,

                    -- Fallados con saldo pendiente
                    COALESCE((
                        SELECT SUM(f.cantidad_detectada)
                        FROM prod_fallados f
                        WHERE f.registro_id = r.id
                          AND COALESCE(f.estado_tela, '') NOT IN ('CERRADO','RECUPERADO','LIQUIDADO')
                    ), 0) AS fallados_pendientes_tela,

                    COALESCE((
                        SELECT SUM(a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma)
                        FROM prod_registro_arreglos a
                        WHERE a.registro_id = r.id
                          AND (a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma) > 0
                    ), 0) AS fallados_pendientes_servicio,

                    -- ¿Algún arreglo vencido?
                    COALESCE((
                        SELECT MIN(a.fecha_limite)
                        FROM prod_registro_arreglos a
                        WHERE a.registro_id = r.id
                          AND (a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma) > 0
                    ), NULL) AS proximo_vencimiento_servicio,

                    -- Revisión activa
                    (SELECT json_build_object(
                                'revisado_por_nombre', rc.revisado_por_nombre,
                                'revisado_at',         rc.revisado_at,
                                'etapa_al_revisar',    rc.etapa_al_revisar
                            )
                     FROM prod_revision_calidad rc
                     WHERE rc.registro_id = r.id) AS revision_activa
                FROM prod_registros r
                LEFT JOIN prod_modelos mod ON mod.id = r.modelo_id
                LEFT JOIN prod_marcas  ma  ON ma.id  = mod.marca_id
                WHERE {where_sql}
            )
            SELECT *,
                   (fallados_pendientes_tela + fallados_pendientes_servicio) AS fallados_pendientes_total
            FROM base
            WHERE
                -- Tiene fallados pendientes (siempre se muestra)
                (fallados_pendientes_tela + fallados_pendientes_servicio) > 0
                -- O nunca fue revisado
                OR revision_activa IS NULL
                {"OR revision_activa IS NOT NULL" if incluir_resueltos else ""}
            ORDER BY
                -- 1) Vencidos primero
                CASE WHEN proximo_vencimiento_servicio IS NOT NULL
                          AND proximo_vencimiento_servicio < CURRENT_DATE THEN 0 ELSE 1 END,
                -- 2) Con fallados pendientes
                CASE WHEN (fallados_pendientes_tela + fallados_pendientes_servicio) > 0 THEN 0 ELSE 1 END,
                -- 3) Urgentes
                CASE WHEN urgente THEN 0 ELSE 1 END,
                -- 4) Más antiguos primero
                fecha_entrega_final NULLS LAST,
                n_corte
        """
        rows = await conn.fetch(sql, *params)

        items = []
        hoy = date.today()
        for row in rows:
            d = row_to_dict(row)
            # Determinar estado visual
            tot_pend = int(d.get("fallados_pendientes_total") or 0)
            rev = d.get("revision_activa")
            prox = d.get("proximo_vencimiento_servicio")

            if tot_pend > 0:
                if prox and isinstance(prox, date) and prox < hoy:
                    estado_visual = "con_fallados_vencido"
                else:
                    estado_visual = "con_fallados"
            elif rev:
                estado_visual = "revisado_ok"
            else:
                estado_visual = "sin_revisar"
            d["estado_visual"] = estado_visual

            # Serializar fechas
            for f in ("fecha_entrega_final", "proximo_vencimiento_servicio"):
                if d.get(f) and not isinstance(d[f], str):
                    d[f] = str(d[f])
            items.append(d)

        # Conteos por etapa para los chips de filtro
        conteo_sql = f"""
            SELECT r.estado, COUNT(*)::int AS n
            FROM prod_registros r
            WHERE r.estado = ANY($1::varchar[])
              AND r.estado_op IN ('ABIERTA','EN_PROCESO')
              {('AND r.empresa_id = $2' if empresa_id is not None else '')}
              AND (
                NOT EXISTS (SELECT 1 FROM prod_revision_calidad rc WHERE rc.registro_id = r.id)
                OR EXISTS (
                    SELECT 1 FROM prod_fallados f
                    WHERE f.registro_id = r.id
                      AND COALESCE(f.estado_tela, '') NOT IN ('CERRADO','RECUPERADO','LIQUIDADO')
                )
                OR EXISTS (
                    SELECT 1 FROM prod_registro_arreglos a
                    WHERE a.registro_id = r.id
                      AND (a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma) > 0
                )
              )
            GROUP BY r.estado
        """
        conteo_params = [ETAPAS_CALIDAD]
        if empresa_id is not None:
            conteo_params.append(empresa_id)
        conteo_rows = await conn.fetch(conteo_sql, *conteo_params)
        conteos_por_etapa = {etapa: 0 for etapa in ETAPAS_CALIDAD}
        for r in conteo_rows:
            conteos_por_etapa[r["estado"]] = r["n"]

        return {
            "items": items,
            "conteos_por_etapa": conteos_por_etapa,
            "total": len(items),
        }


# ============================================================================
# 2. POST /api/cortes/{registro_id}/revisar  (marca SIN FALLADOS)
# ============================================================================
@router.post("/cortes/{registro_id}/revisar")
async def revisar_corte(
    registro_id: str,
    input: RevisarSinFalladosIn,
    current_user: dict = Depends(get_current_user),
):
    """Marca un corte como 'revisado sin fallados' (Opción B).

    Reglas:
      - Solo roles 'admin' o 'acabado'/'supervisor_acabado'.
      - El registro debe estar en una etapa de calidad.
      - Si ya existía una revisión, se sobrescribe (idempotente).
      - Si después se agrega un fallado a este registro, el trigger
        fn_archivar_revision_al_fallado mueve la fila al historial y la borra.
    """
    _ensure_rol(current_user, ROLES_PUEDEN_REVISAR)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            registro = await conn.fetchrow(
                "SELECT id, estado, estado_op FROM prod_registros WHERE id = $1",
                registro_id,
            )
            if not registro:
                raise HTTPException(404, f"Registro {registro_id} no existe")
            if registro["estado"] not in ETAPAS_CALIDAD:
                raise HTTPException(
                    400,
                    f"Registro está en etapa '{registro['estado']}', no aplica revisión de calidad",
                )

            uid = _user_id(current_user)
            uname = _user_name(current_user)
            obs = (input.observacion or "").strip() or None

            # Upsert: si existe, sobrescribir; si no, insertar
            await conn.execute(
                """
                INSERT INTO prod_revision_calidad
                    (id, registro_id, etapa_al_revisar, revisado_por,
                     revisado_por_nombre, revisado_at, sin_fallados, observacion)
                VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, $6)
                ON CONFLICT (registro_id) DO UPDATE
                    SET etapa_al_revisar    = EXCLUDED.etapa_al_revisar,
                        revisado_por        = EXCLUDED.revisado_por,
                        revisado_por_nombre = EXCLUDED.revisado_por_nombre,
                        revisado_at         = NOW(),
                        observacion         = EXCLUDED.observacion
                """,
                str(uuid.uuid4()), registro_id, registro["estado"],
                uid, uname, obs,
            )

    return {"ok": True, "registro_id": registro_id, "revisado_por": uname}


# ============================================================================
# 3. POST /api/arreglos/{arreglo_id}/entregas  (entrega parcial SERVICIO)
# ============================================================================
@router.post("/arreglos/{arreglo_id}/entregas")
async def registrar_entrega_parcial(
    arreglo_id: str,
    input: EntregaParcialIn,
    current_user: dict = Depends(get_current_user),
):
    """Registra una entrega parcial del flujo SERVICIO.

    - Inserta fila en prod_arreglo_entregas (histórico).
    - Suma a los totales en prod_registro_arreglos (cantidad_recuperada,
      cantidad_liquidacion, cantidad_merma).
    - Valida que la suma no exceda la cantidad enviada.
    """
    total_nuevo = input.cant_ok + input.cant_liq + input.cant_merma
    if total_nuevo == 0:
        raise HTTPException(400, "Indica al menos una cantidad > 0")

    fecha_entrega = (
        date.fromisoformat(input.fecha[:10]) if input.fecha else date.today()
    )
    if fecha_entrega > date.today():
        raise HTTPException(400, "La fecha no puede ser futura")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            arreglo = await conn.fetchrow(
                """SELECT id, cantidad, cantidad_recuperada,
                          cantidad_liquidacion, cantidad_merma
                   FROM prod_registro_arreglos
                   WHERE id = $1 FOR UPDATE""",
                arreglo_id,
            )
            if not arreglo:
                raise HTTPException(404, f"Arreglo {arreglo_id} no existe")

            ya_resuelto = int(arreglo["cantidad_recuperada"] or 0) + \
                          int(arreglo["cantidad_liquidacion"] or 0) + \
                          int(arreglo["cantidad_merma"] or 0)
            pendiente = int(arreglo["cantidad"] or 0) - ya_resuelto
            if total_nuevo > pendiente:
                raise HTTPException(
                    400,
                    f"La entrega ({total_nuevo}) excede el saldo pendiente ({pendiente})",
                )

            # Insertar entrega
            await conn.execute(
                """
                INSERT INTO prod_arreglo_entregas
                    (id, arreglo_id, fecha, cant_ok, cant_liq, cant_merma,
                     observacion, registrado_por, registrado_por_nombre)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                str(uuid.uuid4()), arreglo_id, fecha_entrega,
                input.cant_ok, input.cant_liq, input.cant_merma,
                (input.observacion or "").strip() or None,
                _user_id(current_user), _user_name(current_user),
            )

            # Actualizar totales del arreglo
            await conn.execute(
                """
                UPDATE prod_registro_arreglos
                   SET cantidad_recuperada  = COALESCE(cantidad_recuperada, 0)  + $1,
                       cantidad_liquidacion = COALESCE(cantidad_liquidacion, 0) + $2,
                       cantidad_merma       = COALESCE(cantidad_merma, 0)       + $3
                 WHERE id = $4
                """,
                input.cant_ok, input.cant_liq, input.cant_merma, arreglo_id,
            )

            # Devolver estado actualizado
            new = await conn.fetchrow(
                """SELECT cantidad, cantidad_recuperada, cantidad_liquidacion,
                          cantidad_merma,
                          (cantidad - cantidad_recuperada - cantidad_liquidacion - cantidad_merma) AS pendiente
                   FROM prod_registro_arreglos WHERE id = $1""",
                arreglo_id,
            )

    return {
        "ok": True,
        "arreglo_id": arreglo_id,
        "fecha": str(fecha_entrega),
        "totales": row_to_dict(new),
    }


# ============================================================================
# 4. POST /api/arreglos/{arreglo_id}/prorroga
# ============================================================================
@router.post("/arreglos/{arreglo_id}/prorroga")
async def dar_prorroga(
    arreglo_id: str,
    input: ProrrogaIn,
    current_user: dict = Depends(get_current_user),
):
    """Otorga una prórroga al arreglo.

    Reglas:
      - Solo admin o supervisor de acabado.
      - Máximo MAX_PRORROGAS prórrogas por arreglo.
      - Cada prórroga máximo MAX_DIAS_POR_PRORROGA días.
      - Guarda histórico en columna `prorrogas` (JSONB).
      - Si fecha_limite_original está vacía, la setea = fecha_limite actual.
    """
    _ensure_rol(current_user, ROLES_PUEDEN_PRORROGA)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            a = await conn.fetchrow(
                """SELECT id, fecha_limite, fecha_limite_original,
                          COALESCE(prorrogas, '[]'::jsonb) AS prorrogas,
                          cantidad, cantidad_recuperada,
                          cantidad_liquidacion, cantidad_merma
                   FROM prod_registro_arreglos
                   WHERE id = $1 FOR UPDATE""",
                arreglo_id,
            )
            if not a:
                raise HTTPException(404, f"Arreglo {arreglo_id} no existe")

            ya_resuelto = int(a["cantidad_recuperada"] or 0) + \
                          int(a["cantidad_liquidacion"] or 0) + \
                          int(a["cantidad_merma"] or 0)
            if ya_resuelto >= int(a["cantidad"] or 0):
                raise HTTPException(400, "El arreglo ya está completado, no requiere prórroga")

            prorrogas_actuales = a["prorrogas"]
            if isinstance(prorrogas_actuales, str):
                prorrogas_actuales = json.loads(prorrogas_actuales)
            if len(prorrogas_actuales) >= MAX_PRORROGAS:
                raise HTTPException(
                    400,
                    f"Máximo {MAX_PRORROGAS} prórrogas alcanzado. Pasar a facturación.",
                )

            fecha_anterior = a["fecha_limite"]
            fecha_nueva = fecha_anterior + timedelta(days=input.dias_adicionales)
            fecha_original = a["fecha_limite_original"] or fecha_anterior

            nueva_entrada = {
                "fecha_anterior": str(fecha_anterior),
                "fecha_nueva": str(fecha_nueva),
                "dias": input.dias_adicionales,
                "motivo": input.motivo.strip(),
                "por_usuario_id": _user_id(current_user),
                "por_usuario_nombre": _user_name(current_user),
                "at": datetime.now(timezone.utc).isoformat(),
            }
            prorrogas_nuevas = prorrogas_actuales + [nueva_entrada]

            await conn.execute(
                """
                UPDATE prod_registro_arreglos
                   SET fecha_limite          = $1,
                       fecha_limite_original = $2,
                       prorrogas             = $3::jsonb
                 WHERE id = $4
                """,
                fecha_nueva, fecha_original,
                json.dumps(prorrogas_nuevas), arreglo_id,
            )

    return {
        "ok": True,
        "arreglo_id": arreglo_id,
        "fecha_limite_nueva": str(fecha_nueva),
        "prorrogas_usadas": len(prorrogas_nuevas),
        "prorrogas_restantes": MAX_PRORROGAS - len(prorrogas_nuevas),
    }


# ============================================================================
# 5. GET /api/fallados/tablero  (tablero supervisor por urgencia)
# ============================================================================
@router.get("/fallados/tablero")
async def tablero_supervisor(
    servicio_id: Optional[str] = None,
    marca_id: Optional[str] = None,
    empresa_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    """Tablero único del supervisor — fallados/arreglos agrupados por urgencia.

    Devuelve 5 grupos:
      - sin_asignar     : fallados sin enviar a arreglo
      - vencidos        : fecha_limite < hoy, con saldo
      - por_vencer      : fecha_limite en próximos 3 días
      - en_proceso      : resto abierto
      - resueltos_hoy   : completados hoy
    Y KPIs por grupo (conteo + prendas).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conds = ["1=1"]
        params: list = []
        if empresa_id is not None:
            params.append(empresa_id)
            conds.append(f"r.empresa_id = ${len(params)}")
        if servicio_id:
            params.append(servicio_id)
            conds.append(f"a.servicio_id = ${len(params)}")
        if marca_id:
            params.append(marca_id)
            conds.append(f"mod.marca_id = ${len(params)}")
        where_sql = " AND ".join(conds)

        # Arreglos abiertos (con saldo) + clasificación
        rows = await conn.fetch(f"""
            SELECT a.id AS arreglo_id,
                   a.registro_id,
                   r.n_corte,
                   COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto')     AS marca,
                   sp.nombre AS servicio,
                   pp.nombre AS persona,
                   a.fecha_envio, a.fecha_limite, a.fecha_limite_original,
                   a.cantidad, a.cantidad_recuperada, a.cantidad_liquidacion,
                   a.cantidad_merma,
                   (a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma) AS pendiente,
                   COALESCE(a.marcado_para_cobro, FALSE) AS marcado_para_cobro,
                   COALESCE(a.cobrado, FALSE)             AS cobrado,
                   COALESCE(jsonb_array_length(COALESCE(a.prorrogas, '[]'::jsonb)), 0) AS num_prorrogas
            FROM prod_registro_arreglos a
            JOIN prod_registros r ON r.id = a.registro_id
            LEFT JOIN prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN prod_marcas  ma  ON ma.id  = mod.marca_id
            LEFT JOIN prod_servicios_produccion sp ON sp.id = a.servicio_id
            LEFT JOIN prod_personas_produccion  pp ON pp.id = a.persona_id
            WHERE {where_sql}
              AND (a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma) > 0
        """, *params)

        # Fallados sin asignar (TELA sin arreglo aún)
        sin_asignar_rows = await conn.fetch(f"""
            SELECT r.id AS registro_id, r.n_corte,
                   COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto')    AS marca,
                   (
                     COALESCE((SELECT SUM(f.cantidad_detectada) FROM prod_fallados f
                               WHERE f.registro_id = r.id
                                 AND COALESCE(f.estado_tela,'') NOT IN ('CERRADO','RECUPERADO','LIQUIDADO')), 0)
                     - COALESCE((SELECT SUM(a.cantidad) FROM prod_registro_arreglos a WHERE a.registro_id = r.id), 0)
                   ) AS pendiente_sin_asignar
            FROM prod_registros r
            LEFT JOIN prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN prod_marcas  ma  ON ma.id  = mod.marca_id
            WHERE r.estado_op IN ('ABIERTA','EN_PROCESO')
              { ('AND r.empresa_id = $1' if empresa_id is not None else '') }
        """, *([empresa_id] if empresa_id is not None else []))

        hoy = date.today()
        en_3d = hoy + timedelta(days=3)

        grupos = {
            "vencidos": [],
            "por_vencer": [],
            "en_proceso": [],
            "resueltos_hoy": [],  # placeholder
            "sin_asignar": [],
        }

        for row in rows:
            d = row_to_dict(row)
            fl = row["fecha_limite"]
            if fl and fl < hoy:
                grupos["vencidos"].append(d)
            elif fl and fl <= en_3d:
                grupos["por_vencer"].append(d)
            else:
                grupos["en_proceso"].append(d)
            for f in ("fecha_envio", "fecha_limite", "fecha_limite_original"):
                if d.get(f) and not isinstance(d[f], str):
                    d[f] = str(d[f])

        for row in sin_asignar_rows:
            d = row_to_dict(row)
            if int(d.get("pendiente_sin_asignar") or 0) > 0:
                grupos["sin_asignar"].append(d)

        # KPIs
        def _kpi(items, key="pendiente"):
            return {
                "n_arreglos": len(items),
                "prendas": sum(int(i.get(key, 0) or 0) for i in items),
            }

        kpis = {
            "sin_asignar": _kpi(grupos["sin_asignar"], key="pendiente_sin_asignar"),
            "vencidos":    _kpi(grupos["vencidos"]),
            "por_vencer":  _kpi(grupos["por_vencer"]),
            "en_proceso":  _kpi(grupos["en_proceso"]),
        }
        return {"grupos": grupos, "kpis": kpis, "hoy": str(hoy)}
