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
    destino: str = 'lavanderia'            # legacy (texto libre)
    observaciones: Optional[str] = None
    persona_lavanderia_id: Optional[str] = None  # legacy: solo lavandería
    colores: List[ColorMuestraInput] = []  # ⬅ ahora opcional (puede ser vacío)
    # ── Campos nuevos (Sprint 43) ──
    destino_tipo: Optional[str] = None     # 'lavanderia' | 'diseno' (si None, se infiere)
    persona_id: Optional[str] = None       # ⬅ generaliza persona_lavanderia_id (vale para diseño también)
    cantidad_total: Optional[int] = None   # cantidad a nivel muestra (requerido si no hay colores)
    motivo_diseno: Optional[str] = None    # 'medidas' | 'evaluacion' | 'consulta' | 'otro' (solo destino=diseno)


class MuestraRetornoInput(BaseModel):
    fecha_retorno: date
    observaciones: Optional[str] = None
    # ── Campos nuevos (Sprint 43) ──
    cantidad_devuelta: Optional[int] = None  # parcial: 4 de 6. Si None → todo devuelto.
    obs_no_devuelto: Optional[str] = None    # por qué no volvieron todas


class PasoLavanderiaInput(BaseModel):
    """Cuerpo para pasar una muestra que estaba en Diseño a una Lavandería."""
    persona_lavanderia_id: str
    fecha_paso_lavanderia: date
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

    # Mapeo de IDs de personas → nombre. Incluye:
    #   - persona_lavanderia_id (legacy)
    #   - persona_id (genérico nuevo: para Lavandería o Diseño)
    #   - persona_lavanderia_posterior_id (Diseño → Lavandería)
    persona_ids = set()
    for m in muestras:
        for k in ('persona_lavanderia_id', 'persona_id', 'persona_lavanderia_posterior_id'):
            v = m.get(k) if isinstance(m, dict) or hasattr(m, 'get') else None
            try:
                v = m[k]
            except (KeyError, IndexError, TypeError):
                v = None
            if v:
                persona_ids.add(v)

    persona_map = {}
    if persona_ids:
        rows = await conn.fetch(
            "SELECT id, nombre FROM prod_personas_produccion WHERE id = ANY($1::varchar[])",
            list(persona_ids),
        )
        persona_map = {r['id']: r['nombre'] for r in rows}

    result = []
    for m in muestras:
        cols = por_muestra.get(m['id'], [])
        md = dict(m)

        # Cantidad total efectiva: usar columna explícita si existe, sino sumar colores
        # (mantiene compatibilidad con muestras viejas que sumaban desde colores).
        cantidad_total_col = md.get('cantidad_total')
        cantidad_total_eff = cantidad_total_col if cantidad_total_col is not None else sum(c['cantidad'] for c in cols)

        # Estado calculado para clientes viejos (basado en fecha_retorno + decisiones)
        # Para clientes nuevos exponemos también estado_muestra explícito.
        estado_legacy = _estado_muestra(md.get('fecha_retorno'), cols)

        pid_lav = md.get('persona_lavanderia_id')
        pid_gen = md.get('persona_id')
        pid_post = md.get('persona_lavanderia_posterior_id')

        # Inferir estado_muestra si está NULL (compatibilidad con muestras viejas
        # creadas antes de Sprint 43 / sin que se haya corrido la migración):
        #   - si está poblado → usarlo
        #   - si tiene fecha_retorno → 'devuelta'
        #   - sino → 'en_destino'
        estado_eff = md.get('estado_muestra')
        if not estado_eff:
            estado_eff = 'devuelta' if md.get('fecha_retorno') else 'en_destino'

        result.append({
            **md,
            "colores": cols,
            "cantidad_total": cantidad_total_eff,
            "estado": estado_legacy,                                # legacy (calculado)
            "estado_muestra": estado_eff,                           # nuevo (inferido si NULL)
            "destino_tipo": md.get('destino_tipo') or 'lavanderia', # default seguro
            "lavanderia_nombre": persona_map.get(pid_lav) if pid_lav else None,
            "persona_nombre": persona_map.get(pid_gen or pid_lav) if (pid_gen or pid_lav) else None,
            "lavanderia_posterior_nombre": persona_map.get(pid_post) if pid_post else None,
        })
    return result


# ──────────────── Endpoints ────────────────

_MUESTRA_COLS = """
    id, registro_id, fecha_envio, fecha_retorno, destino,
    observaciones, persona_lavanderia_id, created_at, created_by,
    reenviada_desde_id,
    destino_tipo, persona_id, cantidad_total, estado_muestra,
    cantidad_devuelta, fecha_paso_lavanderia,
    persona_lavanderia_posterior_id, motivo_diseno, obs_no_devuelto
"""


@router.get("/registros/{registro_id}/muestras-lavanderia")
async def listar_muestras(registro_id: str, _user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        muestras = await conn.fetch(f"""
            SELECT {_MUESTRA_COLS}
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


@router.get("/muestras-lavanderia/personas-diseno")
async def listar_personas_diseno(_user=Depends(get_current_user)):
    """Personas con servicio 'Diseño' activo. Espejo de listar_lavanderias."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Acepta 'Diseño' (con tilde) o 'Diseno' por seguridad
        servicio = await conn.fetchrow(
            "SELECT id FROM prod_servicios_produccion "
            "WHERE LOWER(nombre) IN ('diseño', 'diseno') "
            "ORDER BY orden ASC, nombre ASC LIMIT 1"
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
    """Crea una muestra (v2).

    Reglas de validación:
      - destino_tipo: 'lavanderia' (default) o 'diseno'.
      - Para destino='diseno' NO se piden colores (la muestra es para medidas).
      - Para destino='lavanderia' los colores son OPCIONALES: se pueden agregar
        después. Si se mandan, sus cantidades suman cantidad_total.
      - cantidad_total: requerida. Si hay colores y no se manda, se infiere
        como suma de colores. Si no hay colores, debe ser > 0.
      - persona_id (nuevo) generaliza persona_lavanderia_id. Si no se manda
        persona_id pero sí persona_lavanderia_id, se usa éste último (compat).
    """
    # ── Normalización destino_tipo ──
    destino_tipo = (input.destino_tipo or input.destino or 'lavanderia').lower()
    if destino_tipo not in ('lavanderia', 'diseno'):
        # Acepta 'diseño' con tilde por si el cliente lo manda así
        if destino_tipo == 'diseño':
            destino_tipo = 'diseno'
        else:
            raise HTTPException(400, "destino_tipo debe ser 'lavanderia' o 'diseno'")

    # ── persona_id efectivo ──
    persona_id_eff = input.persona_id or input.persona_lavanderia_id
    # Para lavandería seguimos manteniendo persona_lavanderia_id por compat con queries viejas
    persona_lav_eff = input.persona_lavanderia_id if destino_tipo == 'lavanderia' else None
    if destino_tipo == 'lavanderia' and not persona_lav_eff and persona_id_eff:
        persona_lav_eff = persona_id_eff  # si solo mandaron persona_id, lo replicamos

    # ── Validación de colores según destino ──
    if destino_tipo == 'diseno' and input.colores:
        raise HTTPException(
            400,
            "Las muestras a Diseño no llevan colores. Si después se pasan a una lavandería, "
            "ahí se podrán agregar colores."
        )

    # ── Cantidad total efectiva ──
    cantidad_colores = sum(c.cantidad for c in input.colores) if input.colores else 0
    if input.cantidad_total is not None:
        cantidad_total_eff = input.cantidad_total
        if cantidad_total_eff <= 0:
            raise HTTPException(400, "cantidad_total debe ser mayor a 0")
        # Si vienen colores Y cantidad_total, no nos peleamos: usamos el explícito
        # pero validamos coherencia razonable.
        if input.colores and cantidad_colores != cantidad_total_eff:
            # Toleramos el desfase pero lo registramos en observaciones para no perder info.
            # En el futuro esto podría ser warning visible al usuario.
            pass
    else:
        if not input.colores:
            raise HTTPException(
                400,
                "Debes indicar cantidad_total cuando no agregás colores."
            )
        cantidad_total_eff = cantidad_colores

    # ── Motivo de diseño solo aplica para destino=diseno ──
    motivo_diseno_eff = input.motivo_diseno if destino_tipo == 'diseno' else None

    pool = await get_pool()
    username = current_user.get('username')
    async with pool.acquire() as conn:
        reg = await conn.fetchval("SELECT id FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(404, "Registro no encontrado")

        async with conn.transaction():
            muestra_id = await conn.fetchval("""
                INSERT INTO prod_registro_muestras
                    (registro_id, fecha_envio, destino, observaciones, created_by,
                     persona_lavanderia_id, destino_tipo, persona_id, cantidad_total,
                     estado_muestra, motivo_diseno)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'en_destino', $10)
                RETURNING id
            """,
                registro_id, input.fecha_envio, input.destino, input.observaciones, username,
                persona_lav_eff, destino_tipo, persona_id_eff, cantidad_total_eff,
                motivo_diseno_eff,
            )

            for c in input.colores:
                await conn.execute("""
                    INSERT INTO prod_registro_muestra_colores
                        (muestra_id, color_id, color_nombre, cantidad, observaciones_envio)
                    VALUES ($1, $2, $3, $4, $5)
                """, muestra_id, c.color_id, c.color_nombre, c.cantidad, c.observaciones_envio)

            row = await conn.fetchrow(f"""
                SELECT {_MUESTRA_COLS}
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
    """Marca la muestra como devuelta (total o parcial).

    Si `cantidad_devuelta` no se manda → asume devolución total (= cantidad_total).
    Si se manda < cantidad_total → retorno parcial: las faltantes quedan registradas
    pero NO se descuentan del stock (decisión actual del negocio).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        actual = await conn.fetchrow(
            "SELECT id, cantidad_total, estado_muestra FROM prod_registro_muestras WHERE id = $1",
            muestra_id,
        )
        if not actual:
            raise HTTPException(404, "Muestra no encontrada")

        if actual['estado_muestra'] in ('paso_a_lavanderia',):
            raise HTTPException(
                400,
                "Esta muestra ya fue pasada a una lavandería. No se puede marcar como devuelta."
            )

        # Calculamos cantidad devuelta efectiva
        cantidad_total = actual['cantidad_total']
        if input.cantidad_devuelta is None:
            cantidad_dev_eff = cantidad_total  # devolución total
        else:
            if input.cantidad_devuelta < 0:
                raise HTTPException(400, "cantidad_devuelta no puede ser negativa")
            if cantidad_total is not None and input.cantidad_devuelta > cantidad_total:
                raise HTTPException(
                    400,
                    f"cantidad_devuelta ({input.cantidad_devuelta}) no puede ser mayor a la enviada ({cantidad_total})"
                )
            cantidad_dev_eff = input.cantidad_devuelta

        await conn.execute("""
            UPDATE prod_registro_muestras
               SET fecha_retorno = $1,
                   observaciones = COALESCE($2, observaciones),
                   cantidad_devuelta = $3,
                   obs_no_devuelto = COALESCE($4, obs_no_devuelto),
                   estado_muestra = 'devuelta'
             WHERE id = $5
        """,
            input.fecha_retorno, input.observaciones, cantidad_dev_eff,
            input.obs_no_devuelto, muestra_id,
        )
        row = await conn.fetchrow(f"""
            SELECT {_MUESTRA_COLS}
              FROM prod_registro_muestras WHERE id = $1
        """, muestra_id)
        return (await _enriquecer_muestras(conn, [row]))[0]


@router.put("/muestras-lavanderia/{muestra_id}/pasar-a-lavanderia")
async def pasar_a_lavanderia(
    muestra_id: int,
    input: PasoLavanderiaInput,
    _user=Depends(get_current_user),
):
    """Una muestra que estaba con Diseño se manda a una Lavandería.

    Después de esto, las prendas dejan de estar "con Diseño" y se cuentan como
    enviadas a esa lavandería. La muestra no vuelve más al corte.
    Estado final: 'paso_a_lavanderia'.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        actual = await conn.fetchrow(
            "SELECT id, destino_tipo, estado_muestra, registro_id "
            "  FROM prod_registro_muestras WHERE id = $1",
            muestra_id,
        )
        if not actual:
            raise HTTPException(404, "Muestra no encontrada")

        if actual['destino_tipo'] != 'diseno':
            raise HTTPException(
                400,
                "Solo se pueden pasar a lavandería las muestras que estaban en Diseño."
            )
        if actual['estado_muestra'] != 'en_destino':
            raise HTTPException(
                400,
                f"La muestra está en estado '{actual['estado_muestra']}'. Solo se puede pasar a lavandería cuando está 'en_destino'."
            )

        # Verificamos que la persona destino exista
        persona = await conn.fetchval(
            "SELECT id FROM prod_personas_produccion WHERE id = $1",
            input.persona_lavanderia_id,
        )
        if not persona:
            raise HTTPException(404, "Lavandería destino no encontrada")

        await conn.execute("""
            UPDATE prod_registro_muestras
               SET estado_muestra = 'paso_a_lavanderia',
                   fecha_paso_lavanderia = $1,
                   persona_lavanderia_posterior_id = $2,
                   observaciones = COALESCE(observaciones || E'\n', '') ||
                                   COALESCE($3, '')
             WHERE id = $4
        """,
            input.fecha_paso_lavanderia, input.persona_lavanderia_id,
            input.observaciones, muestra_id,
        )
        row = await conn.fetchrow(f"""
            SELECT {_MUESTRA_COLS}
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
        row = await conn.fetchrow(f"""
            SELECT {_MUESTRA_COLS}
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
        # Al deshacer el retorno, también limpiamos los campos de parcial
        # y volvemos a estado 'en_destino'.
        await conn.execute("""
            UPDATE prod_registro_muestras
               SET fecha_retorno = NULL,
                   cantidad_devuelta = NULL,
                   obs_no_devuelto = NULL,
                   estado_muestra = 'en_destino'
             WHERE id = $1
        """, muestra_id)
        row = await conn.fetchrow(f"""
            SELECT {_MUESTRA_COLS}
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

        # La cantidad de la nueva muestra (hija) = suma de cantidades rechazadas
        cantidad_total_hija = sum(int(c['cantidad']) for c in rechazados)

        async with conn.transaction():
            nueva_id = await conn.fetchval("""
                INSERT INTO prod_registro_muestras
                    (registro_id, fecha_envio, destino, observaciones, created_by,
                     reenviada_desde_id, persona_lavanderia_id,
                     destino_tipo, persona_id, cantidad_total, estado_muestra)
                VALUES ($1, $2, 'lavanderia', $3, $4, $5, $6,
                        'lavanderia', $6, $7, 'en_destino')
                RETURNING id
            """,
                padre['registro_id'], input.fecha_envio, input.observaciones, username,
                muestra_id, persona_id_hija, cantidad_total_hija,
            )

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

            row = await conn.fetchrow(f"""
                SELECT {_MUESTRA_COLS}
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


# ──────────────── Lista global v2 (Sprint 43) ────────────────

# Umbral de "demorada" — muestras en_destino que llevan más días sin volver.
# Por ahora fijo en 5 para ambos destinos; configurable en el futuro si hace falta.
DIAS_DEMORADA = 5


@router.get("/muestras")
async def listar_muestras_global(
    estado: str = Query('sin_volver', description="sin_volver|en_destino|devuelta|paso_a_lavanderia|cerrada_en_lavanderia|demoradas|todas"),
    destino_tipo: Optional[str] = Query(None, description="lavanderia|diseno"),
    search: Optional[str] = Query(None, description="busca en n_corte, modelo o nombre de persona"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _user=Depends(get_current_user),
):
    """Lista global de muestras (v2) usada por la pantalla móvil 'Envíos de muestra'.

    Devuelve `{ kpis, items, total }`. Cada item incluye datos del corte y el
    nombre de la persona (lavandería o diseño) para que la lista pueda
    renderizarse sin más fetches.
    """
    pool = await get_pool()

    # Expresión SQL que infiere el estado_muestra para registros viejos donde
    # la columna está NULL (porque el backfill no se ejecutó todavía o las
    # muestras se crearon antes de Sprint 43). Inferencia:
    #   - si la columna tiene valor → usarla
    #   - si tiene fecha_retorno → 'devuelta'
    #   - sino → 'en_destino'
    EST = (
        "CASE "
        "WHEN m.estado_muestra IS NOT NULL THEN m.estado_muestra "
        "WHEN m.fecha_retorno IS NOT NULL THEN 'devuelta' "
        "ELSE 'en_destino' END"
    )
    # Versión sin alias para usar en la subquery de KPIs
    EST_KPI = (
        "CASE "
        "WHEN estado_muestra IS NOT NULL THEN estado_muestra "
        "WHEN fecha_retorno IS NOT NULL THEN 'devuelta' "
        "ELSE 'en_destino' END"
    )
    # destino_tipo default = 'lavanderia' (todas las muestras viejas eran a lavandería)
    DEST = "COALESCE(m.destino_tipo, 'lavanderia')"

    async with pool.acquire() as conn:
        params: list = []
        idx = 1
        conditions: list = []

        # ── Filtros ──
        if destino_tipo:
            if destino_tipo not in ('lavanderia', 'diseno'):
                raise HTTPException(400, "destino_tipo debe ser 'lavanderia' o 'diseno'")
            params.append(destino_tipo); conditions.append(f"{DEST} = ${idx}"); idx += 1

        # Filtros por estado (usando inferencia para tolerar NULLs)
        if estado == 'sin_volver':
            conditions.append(f"{EST} = 'en_destino'")
        elif estado == 'demoradas':
            conditions.append(f"{EST} = 'en_destino' AND (CURRENT_DATE - m.fecha_envio) >= {int(DIAS_DEMORADA)}")
        elif estado in ('en_destino', 'devuelta', 'paso_a_lavanderia', 'cerrada_en_lavanderia'):
            params.append(estado); conditions.append(f"{EST} = ${idx}"); idx += 1
        elif estado == 'todas':
            pass
        else:
            raise HTTPException(400, f"estado inválido: {estado}")

        # Búsqueda libre
        if search:
            like = f"%{search.strip()}%"
            params.append(like); s_n = idx; idx += 1
            params.append(like); s_m = idx; idx += 1
            params.append(like); s_p = idx; idx += 1
            conditions.append(
                f"(r.n_corte ILIKE ${s_n} "
                f"OR COALESCE(mo.nombre, r.modelo_manual->>'nombre_modelo') ILIKE ${s_m} "
                f"OR EXISTS (SELECT 1 FROM prod_personas_produccion p "
                f"            WHERE p.id IN (m.persona_id, m.persona_lavanderia_id) AND p.nombre ILIKE ${s_p}))"
            )

        where_sql = (" WHERE " + " AND ".join(conditions)) if conditions else ""

        # ── KPIs (sobre el universo total, tolerante a NULLs) ──
        kpis_row = await conn.fetchrow(f"""
            SELECT
                COUNT(*) FILTER (WHERE {EST_KPI} = 'en_destino') AS sin_volver,
                COUNT(*) FILTER (WHERE {EST_KPI} = 'en_destino'
                                  AND (CURRENT_DATE - fecha_envio) >= {int(DIAS_DEMORADA)}) AS demoradas,
                COUNT(*) FILTER (WHERE {EST_KPI} IN ('devuelta', 'paso_a_lavanderia', 'cerrada_en_lavanderia')) AS cerradas,
                COUNT(*) AS total
              FROM prod_registro_muestras
        """)

        # ── Total filtrado (para paginación) ──
        total_row = await conn.fetchval(f"""
            SELECT COUNT(*)
              FROM prod_registro_muestras m
              JOIN prod_registros r ON r.id = m.registro_id
              LEFT JOIN prod_modelos mo ON mo.id = r.modelo_id
              {where_sql}
        """, *params)

        # ── Items ──
        params_items = params + [limit, offset]
        rows = await conn.fetch(f"""
            SELECT m.id, m.registro_id, m.fecha_envio, m.fecha_retorno,
                   m.destino, m.observaciones, m.persona_lavanderia_id,
                   m.created_at, m.created_by, m.reenviada_desde_id,
                   m.destino_tipo, m.persona_id, m.cantidad_total, m.estado_muestra,
                   m.cantidad_devuelta, m.fecha_paso_lavanderia,
                   m.persona_lavanderia_posterior_id, m.motivo_diseno, m.obs_no_devuelto,
                   r.n_corte, r.estado AS estado_corte,
                   COALESCE(mo.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
                   (CURRENT_DATE - m.fecha_envio) AS dias_envio
              FROM prod_registro_muestras m
              JOIN prod_registros r ON r.id = m.registro_id
              LEFT JOIN prod_modelos mo ON mo.id = r.modelo_id
              {where_sql}
             ORDER BY m.fecha_envio DESC, m.id DESC
             LIMIT ${idx} OFFSET ${idx+1}
        """, *params_items)

        enriquecidas = await _enriquecer_muestras(conn, rows)

        # Marcamos cada item con la bandera "demorada" para que el cliente la pinte fácil
        items = []
        for m in enriquecidas:
            dias = m.get('dias_envio')
            items.append({
                **m,
                "demorada": (
                    m.get('estado_muestra') == 'en_destino'
                    and dias is not None
                    and dias >= DIAS_DEMORADA
                ),
                # Helpers ISO para fechas (frontend lo agradece)
                "fecha_envio": m['fecha_envio'].isoformat() if m.get('fecha_envio') else None,
                "fecha_retorno": m['fecha_retorno'].isoformat() if m.get('fecha_retorno') else None,
                "fecha_paso_lavanderia": m['fecha_paso_lavanderia'].isoformat() if m.get('fecha_paso_lavanderia') else None,
                "created_at": m['created_at'].isoformat() if m.get('created_at') else None,
            })

        return {
            "kpis": {
                "sin_volver": kpis_row['sin_volver'] or 0,
                "demoradas": kpis_row['demoradas'] or 0,
                "cerradas": kpis_row['cerradas'] or 0,
                "total": kpis_row['total'] or 0,
            },
            "items": items,
            "total": total_row or 0,
            "dias_demorada": DIAS_DEMORADA,
        }
