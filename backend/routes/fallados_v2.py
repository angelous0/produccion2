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
ETAPAS_CALIDAD = ["Para Acabado", "Acabado", "Almacen PT", "Tienda"]
ROLES_PUEDEN_REVISAR = {"admin", "acabado", "supervisor_acabado"}
ROLES_PUEDEN_PRORROGA = {"admin", "supervisor_acabado"}
MAX_PRORROGAS = 2
MIN_DIAS_PRORROGA = 1
MAX_DIAS_PRORROGA = 14


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
    # Contadores comunes a TELA y SERVICIO
    cant_ok: int = Field(0, ge=0)
    cant_no_devuelto: int = Field(0, ge=0)
    # Solo TELA (arreglo interno): distinguir Leve vs Grave
    cant_lq_leve: int = Field(0, ge=0)
    cant_lq_grave: int = Field(0, ge=0)
    # Solo SERVICIO (proveedor): un único concepto de liquidación
    cant_liquidacion: int = Field(0, ge=0)
    # Solo SERVICIO: si TRUE y cant_liquidacion>0, marca el arreglo para cobro
    enviar_a_facturacion: bool = False
    fecha: Optional[str] = None       # ISO YYYY-MM-DD; default hoy
    observacion: Optional[str] = None


class ProrrogaIn(BaseModel):
    # Campo nuevo: `dias` (1..14). Mantenemos alias `dias_adicionales` para
    # compatibilidad con clientes existentes.
    dias: Optional[int] = Field(None, ge=MIN_DIAS_PRORROGA, le=MAX_DIAS_PRORROGA)
    dias_adicionales: Optional[int] = Field(None, ge=MIN_DIAS_PRORROGA, le=MAX_DIAS_PRORROGA)
    motivo: Optional[str] = Field(None, max_length=300)


class FalladoConAsignacionIn(BaseModel):
    """Crea un fallado y opcionalmente el arreglo en una sola transacción.

    - Si causa != 'Tela'  → persona_id, fecha_limite y servicio_id son OBLIGATORIOS.
    - Si causa == 'Tela'  → solo se crea el fallado.
    """
    cantidad: int = Field(..., gt=0)
    causa: str = Field(..., description="Costura | Tela | Lavado | Estampado | Otro")
    observacion: Optional[str] = None
    persona_id: Optional[str] = None
    fecha_limite: Optional[str] = None    # ISO YYYY-MM-DD
    servicio_id: Optional[str] = None
    fecha_envio: Optional[str] = None     # ISO YYYY-MM-DD; default hoy


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
      - estado IN ('Para Acabado','Acabado','Almacen PT','Tienda')
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
    """Registra una entrega parcial. Semántica condicional según tipo:

      - SERVICIO (arreglo a proveedor externo, `servicio_id IS NOT NULL`):
            OK / Liquidación / No devuelto.
            Si `enviar_a_facturacion=True` y `cant_liquidacion>0`, además
            marca el arreglo `marcado_para_cobro=TRUE` (entra al flujo de
            cobro en Calidad → Fallados y Arreglos → Sin marcar). Idempotente.
      - TELA (arreglo interno, `servicio_id IS NULL`):
            OK / LQ Leve / LQ Grave / No devuelto.
            No expone el checkbox de facturación.

    Validaciones (422):
      - SERVICIO rechaza `cant_lq_leve>0` o `cant_lq_grave>0`.
      - TELA      rechaza `cant_liquidacion>0`.

    Saldos del arreglo (agregados):
      - cantidad_recuperada  += cant_ok
      - cantidad_liquidacion += cant_liquidacion             (servicio)
                              + (cant_lq_leve + cant_lq_grave) (tela)
      - cantidad_merma       += cant_no_devuelto
    `cant_no_devuelto` se registra como pérdida en el histórico pero NO toca
    distribución ni almacén.
    """
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
                          cantidad_liquidacion, cantidad_merma,
                          servicio_id,
                          COALESCE(marcado_para_cobro, FALSE) AS marcado_para_cobro
                   FROM prod_registro_arreglos
                   WHERE id = $1 FOR UPDATE""",
                arreglo_id,
            )
            if not arreglo:
                raise HTTPException(404, f"Arreglo {arreglo_id} no existe")

            es_servicio = arreglo["servicio_id"] is not None

            # Validación condicional por tipo (422 — payload inválido para el contexto)
            if es_servicio:
                if input.cant_lq_leve > 0 or input.cant_lq_grave > 0:
                    raise HTTPException(
                        422,
                        "Los arreglos de servicio no aceptan LQ Leve / LQ Grave. "
                        "Usá `cant_liquidacion`.",
                    )
            else:
                if input.cant_liquidacion > 0:
                    raise HTTPException(
                        422,
                        "Los arreglos de tela no aceptan `cant_liquidacion`. "
                        "Usá `cant_lq_leve` y/o `cant_lq_grave`.",
                    )
                if input.enviar_a_facturacion:
                    raise HTTPException(
                        422,
                        "`enviar_a_facturacion` solo aplica a arreglos de servicio.",
                    )

            total_nuevo = (
                input.cant_ok + input.cant_lq_leve + input.cant_lq_grave
                + input.cant_liquidacion + input.cant_no_devuelto
            )
            if total_nuevo == 0:
                raise HTTPException(400, "Indica al menos una cantidad > 0")

            ya_resuelto = int(arreglo["cantidad_recuperada"] or 0) + \
                          int(arreglo["cantidad_liquidacion"] or 0) + \
                          int(arreglo["cantidad_merma"] or 0)
            pendiente = int(arreglo["cantidad"] or 0) - ya_resuelto
            if total_nuevo > pendiente:
                raise HTTPException(
                    400,
                    f"La entrega ({total_nuevo}) excede el saldo pendiente ({pendiente})",
                )

            # Insertar entrega (histórico granular). cant_liquidacion solo se
            # llena en servicio; cant_lq_leve/grave solo en tela.
            await conn.execute(
                """
                INSERT INTO prod_arreglo_entregas
                    (id, arreglo_id, fecha, cant_ok, cant_lq_leve, cant_lq_grave,
                     cant_liquidacion, cant_no_devuelto,
                     observacion, registrado_por, registrado_por_nombre)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                str(uuid.uuid4()), arreglo_id, fecha_entrega,
                input.cant_ok, input.cant_lq_leve, input.cant_lq_grave,
                input.cant_liquidacion, input.cant_no_devuelto,
                (input.observacion or "").strip() or None,
                _user_id(current_user), _user_name(current_user),
            )

            # Saldo del arreglo: liquidacion agrega del concepto que corresponda
            delta_liq = (
                input.cant_liquidacion if es_servicio
                else (input.cant_lq_leve + input.cant_lq_grave)
            )
            await conn.execute(
                """
                UPDATE prod_registro_arreglos
                   SET cantidad_recuperada  = COALESCE(cantidad_recuperada, 0)  + $1,
                       cantidad_liquidacion = COALESCE(cantidad_liquidacion, 0) + $2,
                       cantidad_merma       = COALESCE(cantidad_merma, 0)       + $3
                 WHERE id = $4
                """,
                input.cant_ok, delta_liq, input.cant_no_devuelto, arreglo_id,
            )

            # Si servicio + checkbox tildado + hay liquidación: marcar para cobro
            marcado_para_cobro_nuevo = bool(arreglo["marcado_para_cobro"])
            if (es_servicio
                and input.enviar_a_facturacion
                and input.cant_liquidacion > 0
                and not arreglo["marcado_para_cobro"]):
                motivo = f"Liquidación servicio: {input.cant_liquidacion} pzs"
                await conn.execute(
                    """
                    UPDATE prod_registro_arreglos
                       SET marcado_para_cobro     = TRUE,
                           marcado_por_usuario_id = $1,
                           marcado_por_nombre     = $2,
                           fecha_marcado          = NOW(),
                           motivo_marcado         = $3
                     WHERE id = $4
                    """,
                    _user_id(current_user), _user_name(current_user),
                    motivo, arreglo_id,
                )
                await conn.execute(
                    """
                    INSERT INTO prod_arreglos_audit
                        (arreglo_id, accion, usuario_id, usuario_nombre,
                         motivo, fecha, estado_nuevo)
                    VALUES ($1, 'marcar_cobro', $2, $3, $4, NOW(),
                            jsonb_build_object(
                                'marcado_para_cobro', TRUE,
                                'cant_liquidacion', $5::int,
                                'origen', 'entrega_parcial'
                            ))
                    """,
                    arreglo_id, _user_id(current_user), _user_name(current_user),
                    motivo, input.cant_liquidacion,
                )
                marcado_para_cobro_nuevo = True

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
        "tipo_arreglo": "servicio" if es_servicio else "tela",
        "marcado_para_cobro": marcado_para_cobro_nuevo,
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
      - `dias` debe estar entre MIN_DIAS_PRORROGA (1) y MAX_DIAS_PRORROGA (14).
      - Acepta `dias` o `dias_adicionales` (alias de compatibilidad).
      - Motivo opcional (puede estar vacío).
      - Guarda histórico en columna `prorrogas` (JSONB).
      - Si fecha_limite_original está vacía, la setea = fecha_limite actual.
    """
    _ensure_rol(current_user, ROLES_PUEDEN_PRORROGA)

    dias = input.dias if input.dias is not None else input.dias_adicionales
    if dias is None:
        raise HTTPException(400, "Falta el campo `dias`")
    if dias < MIN_DIAS_PRORROGA or dias > MAX_DIAS_PRORROGA:
        raise HTTPException(
            400,
            f"`dias` debe estar entre {MIN_DIAS_PRORROGA} y {MAX_DIAS_PRORROGA}",
        )

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
            fecha_nueva = fecha_anterior + timedelta(days=dias)
            fecha_original = a["fecha_limite_original"] or fecha_anterior

            nueva_entrada = {
                "fecha_anterior": str(fecha_anterior),
                "fecha_nueva": str(fecha_nueva),
                "dias": dias,
                "motivo": (input.motivo or "").strip() or None,
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
    corte_id: Optional[str] = None,
    registro_id: Optional[str] = None,
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

    Filtros opcionales:
      - corte_id (alias registro_id): filtra a un solo corte.
    """
    # Alias: corte_id y registro_id son equivalentes
    filtro_registro = corte_id or registro_id

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
        if filtro_registro:
            params.append(filtro_registro)
            conds.append(f"a.registro_id = ${len(params)}")
        where_sql = " AND ".join(conds)

        # Arreglos abiertos (con saldo) + clasificación + resumen historial
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
                   CASE WHEN a.servicio_id IS NOT NULL THEN 'servicio' ELSE 'tela' END AS tipo_arreglo,
                   COALESCE(jsonb_array_length(COALESCE(a.prorrogas, '[]'::jsonb)), 0) AS num_prorrogas,
                   COALESCE(e.tot_ok, 0)            AS hist_ok,
                   COALESCE(e.tot_lq_leve, 0)       AS hist_lq_leve,
                   COALESCE(e.tot_lq_grave, 0)      AS hist_lq_grave,
                   COALESCE(e.tot_liquidacion, 0)   AS hist_liquidacion,
                   COALESCE(e.tot_no_devuelto, 0)   AS hist_no_devuelto
            FROM prod_registro_arreglos a
            JOIN prod_registros r ON r.id = a.registro_id
            LEFT JOIN prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN prod_marcas  ma  ON ma.id  = mod.marca_id
            LEFT JOIN prod_servicios_produccion sp ON sp.id = a.servicio_id
            LEFT JOIN prod_personas_produccion  pp ON pp.id = a.persona_id
            LEFT JOIN LATERAL (
                SELECT SUM(cant_ok)          AS tot_ok,
                       SUM(cant_lq_leve)     AS tot_lq_leve,
                       SUM(cant_lq_grave)    AS tot_lq_grave,
                       SUM(cant_liquidacion) AS tot_liquidacion,
                       SUM(cant_no_devuelto) AS tot_no_devuelto
                FROM prod_arreglo_entregas
                WHERE arreglo_id = a.id
            ) e ON TRUE
            WHERE {where_sql}
              AND (a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma) > 0
        """, *params)

        # Fallados sin asignar (TELA sin arreglo aún)
        sa_conds = ["r.estado_op IN ('ABIERTA','EN_PROCESO')"]
        sa_params: list = []
        if empresa_id is not None:
            sa_params.append(empresa_id)
            sa_conds.append(f"r.empresa_id = ${len(sa_params)}")
        if filtro_registro:
            sa_params.append(filtro_registro)
            sa_conds.append(f"r.id = ${len(sa_params)}")
        sa_where = " AND ".join(sa_conds)

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
            WHERE {sa_where}
        """, *sa_params)

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


# ============================================================================
# 6. POST /api/cortes/{registro_id}/fallado-con-asignacion
#    Crea fallado + arreglo en una sola transacción (UX del drawer del operario).
# ============================================================================
@router.post("/cortes/{registro_id}/fallado-con-asignacion")
async def crear_fallado_con_asignacion(
    registro_id: str,
    input: FalladoConAsignacionIn,
    current_user: dict = Depends(get_current_user),
):
    """Crea un fallado y opcionalmente el arreglo, según la causa.

    - Si `causa == 'Tela'` → solo crea prod_fallados (causa='tela', estado_tela='EVALUANDO').
    - Si `causa != 'Tela'`  → exige servicio_id + persona_id + fecha_limite,
      crea prod_fallados (causa='servicio') + prod_registro_arreglos en la misma
      transacción. fecha_limite_original = fecha_limite.
    - El "chip" (Costura/Lavado/Estampado/Otro) se preserva como prefijo en la
      observación del fallado, para mantener la trazabilidad del taller.
    """
    causa_chip = (input.causa or "").strip()
    if not causa_chip:
        raise HTTPException(400, "Falta `causa`")
    causa_lower = causa_chip.lower()
    es_tela = (causa_lower == "tela")

    if not es_tela:
        if not input.servicio_id:
            raise HTTPException(400, f"`servicio_id` es obligatorio cuando causa='{causa_chip}'")
        if not input.persona_id:
            raise HTTPException(400, f"`persona_id` es obligatorio cuando causa='{causa_chip}'")
        if not input.fecha_limite:
            raise HTTPException(400, f"`fecha_limite` es obligatoria cuando causa='{causa_chip}'")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            reg = await conn.fetchrow(
                "SELECT id FROM prod_registros WHERE id = $1",
                registro_id,
            )
            if not reg:
                raise HTTPException(404, f"Registro {registro_id} no existe")

            uname = _user_name(current_user)
            obs_prefix = f"[{causa_chip}]"
            obs_final = f"{obs_prefix} {input.observacion}".strip() if input.observacion else obs_prefix

            # 1) Insertar fallado
            fallado_id = str(uuid.uuid4())
            causa_db = "tela" if es_tela else "servicio"
            estado_tela = "EVALUANDO" if es_tela else None
            fecha_det = date.today()

            await conn.execute(
                """
                INSERT INTO prod_fallados
                    (id, registro_id, cantidad_detectada, fecha_deteccion,
                     observacion, created_by, causa, estado_tela)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                fallado_id, registro_id, input.cantidad, fecha_det,
                obs_final, uname, causa_db, estado_tela,
            )

            arreglo_id = None
            fecha_limite_str = None
            fecha_envio_str = None
            if not es_tela:
                # 2) Insertar arreglo
                arreglo_id = str(uuid.uuid4())
                fecha_envio = (
                    date.fromisoformat(input.fecha_envio[:10])
                    if input.fecha_envio else date.today()
                )
                fecha_limite = date.fromisoformat(input.fecha_limite[:10])
                if fecha_limite < fecha_envio:
                    raise HTTPException(
                        400,
                        "fecha_limite no puede ser anterior a fecha_envio",
                    )

                await conn.execute(
                    """
                    INSERT INTO prod_registro_arreglos
                        (id, registro_id, cantidad, servicio_id, persona_id,
                         fecha_envio, fecha_limite, fecha_limite_original,
                         estado, observacion, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10)
                    """,
                    arreglo_id, registro_id, input.cantidad,
                    input.servicio_id, input.persona_id,
                    fecha_envio, fecha_limite,
                    'EN_ARREGLO', obs_final, uname,
                )
                fecha_envio_str = str(fecha_envio)
                fecha_limite_str = str(fecha_limite)

    return {
        "ok": True,
        "fallado_id": fallado_id,
        "arreglo_id": arreglo_id,
        "fecha_envio": fecha_envio_str,
        "fecha_limite": fecha_limite_str,
        "causa": causa_db,
        "chip": causa_chip,
    }


# ============================================================================
# 7. GET /api/cortes/{registro_id}/persona-sugerida
#    Devuelve la persona/servicio del último movimiento del corte hacia un
#    servicio externo. Sirve para pre-seleccionar en el drawer "+ Fallado".
#    204 No Content si el corte nunca salió a un servicio externo.
# ============================================================================
@router.get("/cortes/{registro_id}/persona-sugerida")
async def persona_sugerida(
    registro_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Última persona/servicio externo donde se mandó el corte.

    Se considera "salida a servicio externo" todo movimiento con
    `servicio_id IS NOT NULL` y `persona_id IS NOT NULL` (no hay columna
    `tipo`; el modelo del proyecto no la usa). Se toma el más reciente por
    `fecha_inicio DESC NULLS LAST, created_at DESC`.

    Respuesta:
      - 200: { persona_id, persona_nombre, servicio_id, servicio_nombre }
      - 204: si no hay ningún movimiento que califique.
    """
    from fastapi import Response

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT m.persona_id, m.servicio_id,
                   pp.nombre AS persona_nombre,
                   sp.nombre AS servicio_nombre
              FROM prod_movimientos_produccion m
              LEFT JOIN prod_personas_produccion  pp ON pp.id = m.persona_id
              LEFT JOIN prod_servicios_produccion sp ON sp.id = m.servicio_id
             WHERE m.registro_id = $1
               AND m.servicio_id IS NOT NULL
               AND m.persona_id  IS NOT NULL
             ORDER BY m.fecha_inicio DESC NULLS LAST, m.created_at DESC
             LIMIT 1
            """,
            registro_id,
        )
        if not row:
            return Response(status_code=204)
        return {
            "persona_id":      row["persona_id"],
            "persona_nombre":  row["persona_nombre"],
            "servicio_id":     row["servicio_id"],
            "servicio_nombre": row["servicio_nombre"],
        }
