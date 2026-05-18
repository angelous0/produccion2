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
from fastapi import APIRouter, HTTPException, Depends
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

    result = []
    for m in muestras:
        cols = por_muestra.get(m['id'], [])
        result.append({
            **dict(m),
            "colores": cols,
            "cantidad_total": sum(c['cantidad'] for c in cols),
            "estado": _estado_muestra(m['fecha_retorno'], cols),
        })
    return result


# ──────────────── Endpoints ────────────────

@router.get("/registros/{registro_id}/muestras-lavanderia")
async def listar_muestras(registro_id: str, _user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        muestras = await conn.fetch("""
            SELECT id, registro_id, fecha_envio, fecha_retorno, destino,
                   observaciones, created_at, created_by
              FROM prod_registro_muestras
             WHERE registro_id = $1
             ORDER BY fecha_envio DESC, id DESC
        """, registro_id)
        return await _enriquecer_muestras(conn, muestras)


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
                    (registro_id, fecha_envio, destino, observaciones, created_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            """, registro_id, input.fecha_envio, input.destino, input.observaciones, username)

            for c in input.colores:
                await conn.execute("""
                    INSERT INTO prod_registro_muestra_colores
                        (muestra_id, color_id, color_nombre, cantidad, observaciones_envio)
                    VALUES ($1, $2, $3, $4, $5)
                """, muestra_id, c.color_id, c.color_nombre, c.cantidad, c.observaciones_envio)

            row = await conn.fetchrow("""
                SELECT id, registro_id, fecha_envio, fecha_retorno, destino,
                       observaciones, created_at, created_by
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
