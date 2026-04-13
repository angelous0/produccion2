"""
Router: Trazabilidad Simplificada - Fallados + Arreglos V2
- prod_fallados simplificada: fuente oficial de total_fallados
- prod_registro_arreglos: envios a arreglo con resolucion (recuperado/liquidacion/merma)
- Resumen de cantidades en tiempo real
- Estados automaticos: EN_ARREGLO, PARCIAL, COMPLETADO, VENCIDO
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta, timezone
import json
import uuid

router = APIRouter(prefix="/api", tags=["trazabilidad"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict

DIAS_LIMITE_ARREGLO = 3


def safe_int(v):
    try: return int(v or 0)
    except (ValueError, TypeError): return 0

def safe_float(v):
    try: return float(v or 0)
    except (ValueError, TypeError): return 0.0

def parse_jsonb(val):
    if val is None: return []
    if isinstance(val, list): return val
    if isinstance(val, str):
        try: return json.loads(val)
        except (ValueError, json.JSONDecodeError): return []
    return val


# ==================== INIT TABLES ====================

async def init_trazabilidad_tables():
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Tabla simplificada de fallados (fuente oficial de total_fallados)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_fallados (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                cantidad_detectada INT NOT NULL DEFAULT 0,
                fecha DATE,
                observacion TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                created_by VARCHAR
            )
        """)
        # Columnas legacy que pueden existir - agregar created_by si no existe
        for col_sql in [
            "ALTER TABLE prod_fallados ADD COLUMN IF NOT EXISTS created_by VARCHAR",
            "ALTER TABLE prod_fallados ADD COLUMN IF NOT EXISTS observacion TEXT",
        ]:
            try:
                await conn.execute(col_sql)
            except Exception:
                pass

        # Tabla nueva de arreglos V2 (vinculada a registro, no a fallado)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_registro_arreglos (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                cantidad INT NOT NULL DEFAULT 0,
                servicio_id VARCHAR,
                persona_id VARCHAR,
                fecha_envio DATE NOT NULL,
                fecha_limite DATE NOT NULL,
                estado VARCHAR NOT NULL DEFAULT 'EN_ARREGLO',
                cantidad_recuperada INT NOT NULL DEFAULT 0,
                cantidad_liquidacion INT NOT NULL DEFAULT 0,
                cantidad_merma INT NOT NULL DEFAULT 0,
                observacion TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                created_by VARCHAR
            )
        """)

        # Tabla legacy de arreglos (mantener para datos existentes)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_arreglos (
                id VARCHAR PRIMARY KEY,
                fallado_id VARCHAR NOT NULL,
                registro_id VARCHAR NOT NULL,
                cantidad_enviada INT NOT NULL DEFAULT 0,
                cantidad_resuelta INT NOT NULL DEFAULT 0,
                cantidad_no_resuelta INT NOT NULL DEFAULT 0,
                tipo VARCHAR NOT NULL DEFAULT 'ARREGLO_INTERNO',
                servicio_destino_id VARCHAR,
                persona_destino_id VARCHAR,
                fecha_envio DATE,
                fecha_limite DATE,
                fecha_retorno DATE,
                resultado_final VARCHAR DEFAULT 'PENDIENTE',
                estado VARCHAR DEFAULT 'PENDIENTE',
                observaciones TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Tabla legacy de mermas (mantener)
        try:
            await conn.execute("ALTER TABLE prod_mermas ADD COLUMN IF NOT EXISTS tipo VARCHAR DEFAULT 'FALTANTE'")
        except Exception:
            pass


# ==================== MODELS ====================

class FalladoCreate(BaseModel):
    registro_id: str
    cantidad_detectada: int
    fecha_deteccion: Optional[str] = None
    observacion: str = ""

class FalladoUpdate(BaseModel):
    cantidad_detectada: Optional[int] = None
    fecha_deteccion: Optional[str] = None
    observacion: Optional[str] = None

class ArregloCreate(BaseModel):
    cantidad: int
    servicio_id: Optional[str] = None
    persona_id: Optional[str] = None
    fecha_envio: Optional[str] = None
    observacion: str = ""

class ArregloResolucion(BaseModel):
    cantidad_recuperada: int = 0
    cantidad_liquidacion: int = 0
    cantidad_merma: int = 0

class ArregloUpdate(BaseModel):
    cantidad: Optional[int] = None
    servicio_id: Optional[str] = None
    persona_id: Optional[str] = None
    fecha_envio: Optional[str] = None
    observacion: Optional[str] = None
    cantidad_recuperada: Optional[int] = None
    cantidad_liquidacion: Optional[int] = None
    cantidad_merma: Optional[int] = None


# ==================== HELPERS ====================

def _calcular_estado_arreglo(arreglo_row):
    """Calcula el estado real de un arreglo basado en sus datos."""
    rec = safe_int(arreglo_row.get("cantidad_recuperada", 0))
    liq = safe_int(arreglo_row.get("cantidad_liquidacion", 0))
    mer = safe_int(arreglo_row.get("cantidad_merma", 0))
    cant = safe_int(arreglo_row.get("cantidad", 0))
    resuelto = rec + liq + mer

    if resuelto >= cant and cant > 0:
        return "COMPLETADO"

    fecha_limite = arreglo_row.get("fecha_limite")
    if fecha_limite:
        if isinstance(fecha_limite, str):
            try:
                fecha_limite = date.fromisoformat(fecha_limite[:10])
            except (ValueError, TypeError):
                fecha_limite = None
        if fecha_limite and fecha_limite < date.today() and resuelto < cant:
            return "VENCIDO"

    if resuelto > 0 and resuelto < cant:
        return "PARCIAL"

    return "EN_ARREGLO"


async def _get_total_fallados(conn, registro_id: str) -> int:
    """Fuente oficial: SUM(cantidad_detectada) de prod_fallados."""
    val = await conn.fetchval(
        "SELECT COALESCE(SUM(cantidad_detectada), 0) FROM prod_fallados WHERE registro_id = $1",
        registro_id
    )
    return safe_int(val)


async def _get_arreglos_sum(conn, registro_id: str, exclude_id: str = None) -> int:
    """Suma de cantidades en arreglos V2 para un registro."""
    if exclude_id:
        val = await conn.fetchval(
            "SELECT COALESCE(SUM(cantidad), 0) FROM prod_registro_arreglos WHERE registro_id = $1 AND id != $2",
            registro_id, exclude_id
        )
    else:
        val = await conn.fetchval(
            "SELECT COALESCE(SUM(cantidad), 0) FROM prod_registro_arreglos WHERE registro_id = $1",
            registro_id
        )
    return safe_int(val)


async def _actualizar_estados_arreglos(conn, registro_id: str):
    """Recalcula estados de todos los arreglos de un registro."""
    rows = await conn.fetch(
        "SELECT id, cantidad, cantidad_recuperada, cantidad_liquidacion, cantidad_merma, fecha_limite FROM prod_registro_arreglos WHERE registro_id = $1",
        registro_id
    )
    for r in rows:
        nuevo_estado = _calcular_estado_arreglo(dict(r))
        if r.get("estado") != nuevo_estado:
            # No cambiar si ya esta COMPLETADO
            if r.get("estado") == "COMPLETADO":
                continue
            await conn.execute(
                "UPDATE prod_registro_arreglos SET estado = $1 WHERE id = $2",
                nuevo_estado, r["id"]
            )


# ==================== FALLADOS CRUD (simplificado) ====================

@router.get("/fallados")
async def get_fallados(
    registro_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT f.id, f.registro_id, f.cantidad_detectada, f.fecha_deteccion,
                   COALESCE(f.observacion, f.observaciones) as observacion,
                   f.created_at, f.created_by
            FROM prod_fallados f
            WHERE 1=1
        """
        params = []
        if registro_id:
            params.append(registro_id)
            query += f" AND f.registro_id = ${len(params)}"
        query += " ORDER BY f.created_at DESC"
        rows = await conn.fetch(query, *params)
        result = []
        for r in rows:
            d = dict(r)
            for f in ("fecha_deteccion", "created_at"):
                if d.get(f): d[f] = str(d[f])
            result.append(d)
        return result


@router.post("/fallados")
async def create_fallado(
    input: FalladoCreate,
    current_user: dict = Depends(get_current_user),
):
    if input.cantidad_detectada <= 0:
        raise HTTPException(status_code=400, detail="La cantidad detectada debe ser mayor a 0")

    pool = await get_pool()
    async with pool.acquire() as conn:
        fid = str(uuid.uuid4())
        fecha = date.fromisoformat(input.fecha_deteccion[:10]) if input.fecha_deteccion else date.today()
        created_by = current_user.get("username", current_user.get("nombre", "sistema"))

        await conn.execute("""
            INSERT INTO prod_fallados (id, registro_id, cantidad_detectada, fecha_deteccion, observacion, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, fid, input.registro_id, input.cantidad_detectada, fecha, input.observacion, created_by)

        return {"id": fid, "message": "Fallado registrado"}


@router.put("/fallados/{fallado_id}")
async def update_fallado(
    fallado_id: str,
    input: FalladoUpdate,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM prod_fallados WHERE id = $1", fallado_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Fallado no encontrado")

        if input.cantidad_detectada is not None and input.cantidad_detectada <= 0:
            raise HTTPException(status_code=400, detail="La cantidad detectada debe ser mayor a 0")

        # Validar que al reducir fallados no queden arreglos excedidos
        if input.cantidad_detectada is not None:
            registro_id = existing["registro_id"]
            otros_fallados = await conn.fetchval(
                "SELECT COALESCE(SUM(cantidad_detectada), 0) FROM prod_fallados WHERE registro_id = $1 AND id != $2",
                registro_id, fallado_id
            )
            nuevo_total = safe_int(otros_fallados) + input.cantidad_detectada
            arreglos_sum = await _get_arreglos_sum(conn, registro_id)
            if arreglos_sum > nuevo_total:
                raise HTTPException(
                    status_code=400,
                    detail=f"No se puede reducir: hay {arreglos_sum} prendas en arreglos que exceden el nuevo total ({nuevo_total})"
                )

        sets, params = [], []
        if input.cantidad_detectada is not None:
            params.append(input.cantidad_detectada)
            sets.append(f"cantidad_detectada = ${len(params)}")
        if input.observacion is not None:
            params.append(input.observacion)
            sets.append(f"observacion = ${len(params)}")
        if input.fecha_deteccion is not None:
            params.append(date.fromisoformat(input.fecha_deteccion[:10]))
            sets.append(f"fecha_deteccion = ${len(params)}")

        if sets:
            params.append(fallado_id)
            await conn.execute(f"UPDATE prod_fallados SET {', '.join(sets)} WHERE id = ${len(params)}", *params)

        return {"message": "Fallado actualizado"}


@router.delete("/fallados/{fallado_id}")
async def delete_fallado(
    fallado_id: str,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM prod_fallados WHERE id = $1", fallado_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Fallado no encontrado")

        registro_id = existing["registro_id"]
        otros_fallados = await conn.fetchval(
            "SELECT COALESCE(SUM(cantidad_detectada), 0) FROM prod_fallados WHERE registro_id = $1 AND id != $2",
            registro_id, fallado_id
        )
        arreglos_sum = await _get_arreglos_sum(conn, registro_id)
        if arreglos_sum > safe_int(otros_fallados):
            raise HTTPException(
                status_code=400,
                detail=f"No se puede eliminar: hay {arreglos_sum} prendas en arreglos que exceden los fallados restantes ({safe_int(otros_fallados)})"
            )

        await conn.execute("DELETE FROM prod_fallados WHERE id = $1", fallado_id)
        return {"message": "Fallado eliminado"}


# ==================== ARREGLOS V2 CRUD ====================

@router.get("/registros/{registro_id}/arreglos")
async def get_arreglos(
    registro_id: str,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Actualizar estados automaticamente
        await _actualizar_estados_arreglos(conn, registro_id)

        rows = await conn.fetch("""
            SELECT a.*,
                   sp.nombre as servicio_nombre,
                   pp.nombre as persona_nombre
            FROM prod_registro_arreglos a
            LEFT JOIN prod_servicios_produccion sp ON a.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON a.persona_id = pp.id
            WHERE a.registro_id = $1
            ORDER BY a.created_at DESC
        """, registro_id)

        result = []
        for r in rows:
            d = dict(r)
            # Recalcular estado en vivo
            d["estado"] = _calcular_estado_arreglo(d)
            for f in ("fecha_envio", "fecha_limite", "created_at"):
                if d.get(f): d[f] = str(d[f])
            result.append(d)
        return result


@router.post("/registros/{registro_id}/arreglos")
async def create_arreglo(
    registro_id: str,
    input: ArregloCreate,
    current_user: dict = Depends(get_current_user),
):
    if input.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar registro existe
        reg = await conn.fetchrow("SELECT id FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # Validar: SUM(arreglos.cantidad) + nueva <= total_fallados
        total_fallados = await _get_total_fallados(conn, registro_id)
        arreglos_sum = await _get_arreglos_sum(conn, registro_id)
        disponible = total_fallados - arreglos_sum

        if input.cantidad > disponible:
            raise HTTPException(
                status_code=400,
                detail=f"Cantidad ({input.cantidad}) excede el disponible para arreglo ({disponible}). Total fallados: {total_fallados}, ya en arreglo: {arreglos_sum}"
            )

        aid = str(uuid.uuid4())
        fecha_envio = date.fromisoformat(input.fecha_envio[:10]) if input.fecha_envio else date.today()
        fecha_limite = fecha_envio + timedelta(days=DIAS_LIMITE_ARREGLO)
        created_by = current_user.get("username", current_user.get("nombre", "sistema"))

        await conn.execute("""
            INSERT INTO prod_registro_arreglos
                (id, registro_id, cantidad, servicio_id, persona_id, fecha_envio, fecha_limite, estado, observacion, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        """, aid, registro_id, input.cantidad,
            input.servicio_id or None, input.persona_id or None,
            fecha_envio, fecha_limite, 'EN_ARREGLO', input.observacion, created_by)

        return {
            "id": aid,
            "message": "Envio a arreglo creado",
            "fecha_envio": str(fecha_envio),
            "fecha_limite": str(fecha_limite),
        }


@router.put("/arreglos/{arreglo_id}")
async def update_arreglo(
    arreglo_id: str,
    input: ArregloUpdate,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM prod_registro_arreglos WHERE id = $1", arreglo_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Arreglo no encontrado")

        if existing["estado"] == "COMPLETADO":
            raise HTTPException(status_code=400, detail="No se puede editar un arreglo completado")

        registro_id = existing["registro_id"]
        cantidad_final = input.cantidad if input.cantidad is not None else existing["cantidad"]
        rec = input.cantidad_recuperada if input.cantidad_recuperada is not None else existing["cantidad_recuperada"]
        liq = input.cantidad_liquidacion if input.cantidad_liquidacion is not None else existing["cantidad_liquidacion"]
        mer = input.cantidad_merma if input.cantidad_merma is not None else existing["cantidad_merma"]

        # Validar no negativos
        for nombre, val in [("cantidad", cantidad_final), ("cantidad_recuperada", rec), ("cantidad_liquidacion", liq), ("cantidad_merma", mer)]:
            if val < 0:
                raise HTTPException(status_code=400, detail=f"{nombre} no puede ser negativo")

        # Validar resolucion no exceda cantidad
        if rec + liq + mer > cantidad_final:
            raise HTTPException(
                status_code=400,
                detail=f"La resolucion ({rec} + {liq} + {mer} = {rec+liq+mer}) excede la cantidad del arreglo ({cantidad_final})"
            )

        # Si se cambia la cantidad, validar contra total_fallados
        if input.cantidad is not None and input.cantidad != existing["cantidad"]:
            total_fallados = await _get_total_fallados(conn, registro_id)
            arreglos_sum_otros = await _get_arreglos_sum(conn, registro_id, exclude_id=arreglo_id)
            disponible = total_fallados - arreglos_sum_otros
            if input.cantidad > disponible:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cantidad ({input.cantidad}) excede disponible ({disponible})"
                )

        sets, params = [], []
        for field, val in [
            ("cantidad", input.cantidad),
            ("servicio_id", input.servicio_id),
            ("persona_id", input.persona_id),
            ("observacion", input.observacion),
            ("cantidad_recuperada", input.cantidad_recuperada),
            ("cantidad_liquidacion", input.cantidad_liquidacion),
            ("cantidad_merma", input.cantidad_merma),
        ]:
            if val is not None:
                params.append(val if val != "" else None)
                sets.append(f"{field} = ${len(params)}")

        if input.fecha_envio is not None:
            fe = date.fromisoformat(input.fecha_envio[:10])
            params.append(fe)
            sets.append(f"fecha_envio = ${len(params)}")
            fl = fe + timedelta(days=DIAS_LIMITE_ARREGLO)
            params.append(fl)
            sets.append(f"fecha_limite = ${len(params)}")

        # Recalcular estado
        temp = dict(existing)
        if input.cantidad is not None: temp["cantidad"] = input.cantidad
        if input.cantidad_recuperada is not None: temp["cantidad_recuperada"] = input.cantidad_recuperada
        if input.cantidad_liquidacion is not None: temp["cantidad_liquidacion"] = input.cantidad_liquidacion
        if input.cantidad_merma is not None: temp["cantidad_merma"] = input.cantidad_merma
        if input.fecha_envio is not None: temp["fecha_limite"] = date.fromisoformat(input.fecha_envio[:10]) + timedelta(days=DIAS_LIMITE_ARREGLO)
        nuevo_estado = _calcular_estado_arreglo(temp)
        params.append(nuevo_estado)
        sets.append(f"estado = ${len(params)}")

        if sets:
            params.append(arreglo_id)
            await conn.execute(
                f"UPDATE prod_registro_arreglos SET {', '.join(sets)} WHERE id = ${len(params)}",
                *params
            )

        return {"message": "Arreglo actualizado", "estado": nuevo_estado}


@router.delete("/arreglos/{arreglo_id}")
async def delete_arreglo(
    arreglo_id: str,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM prod_registro_arreglos WHERE id = $1", arreglo_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Arreglo no encontrado")
        if existing["estado"] == "COMPLETADO":
            raise HTTPException(status_code=400, detail="No se puede eliminar un arreglo completado")
        await conn.execute("DELETE FROM prod_registro_arreglos WHERE id = $1", arreglo_id)
        return {"message": "Arreglo eliminado"}


# ==================== RESUMEN DE CANTIDADES V2 ====================

@router.get("/registros/{registro_id}/resumen-cantidades")
async def resumen_cantidades(
    registro_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Resumen simplificado del lote:
    total_producido = normal + recuperado + liquidacion + merma + fallado_pendiente
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("""
            SELECT r.id, r.n_corte, r.estado, r.estado_op, r.tallas,
                   r.dividido_desde_registro_id,
                   COALESCE((SELECT SUM(rt.cantidad_real) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id), 0) as cantidad_tallas
            FROM prod_registros r WHERE r.id = $1
        """, registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # Cantidad base (producida)
        cantidad_base = safe_int(reg["cantidad_tallas"])
        if cantidad_base == 0:
            tallas_jsonb = parse_jsonb(reg["tallas"])
            cantidad_base = sum(safe_int(t.get("cantidad", 0)) for t in tallas_jsonb)
        if cantidad_base == 0:
            mov_qty = await conn.fetchval(
                "SELECT cantidad_enviada FROM prod_movimientos_produccion WHERE registro_id = $1 ORDER BY created_at ASC LIMIT 1",
                registro_id
            )
            if mov_qty:
                cantidad_base = safe_int(mov_qty)

        # Hijos (divisiones)
        total_hijos = safe_int(await conn.fetchval(
            "SELECT COALESCE(SUM(rt.cantidad_real),0) FROM prod_registro_tallas rt JOIN prod_registros r ON rt.registro_id = r.id WHERE r.dividido_desde_registro_id = $1",
            registro_id
        ))
        total_producido = cantidad_base + total_hijos

        # Mermas
        merma_total = safe_int(await conn.fetchval(
            "SELECT COALESCE(SUM(cantidad), 0) FROM prod_mermas WHERE registro_id = $1", registro_id
        ))

        # Fallados (fuente oficial)
        total_fallados = await _get_total_fallados(conn, registro_id)

        # Arreglos V2
        arreglos_rows = await conn.fetch(
            "SELECT cantidad, cantidad_recuperada, cantidad_liquidacion, cantidad_merma, estado, fecha_limite FROM prod_registro_arreglos WHERE registro_id = $1",
            registro_id
        )
        total_en_arreglo = sum(safe_int(a["cantidad"]) for a in arreglos_rows)
        total_recuperado = sum(safe_int(a["cantidad_recuperada"]) for a in arreglos_rows)
        total_liquidacion = sum(safe_int(a["cantidad_liquidacion"]) for a in arreglos_rows)
        total_merma_arreglos = sum(safe_int(a["cantidad_merma"]) for a in arreglos_rows)

        # fallado_pendiente = TODO lo no resuelto (sin enviar + enviado sin resolver)
        fallado_pendiente = total_fallados - total_recuperado - total_liquidacion - total_merma_arreglos
        # sin_enviar = lo que aun no se ha mandado a arreglo
        sin_enviar = total_fallados - total_en_arreglo
        # en_arreglo_sin_resolver = enviado pero aun no resuelto
        en_arreglo_sin_resolver = total_en_arreglo - total_recuperado - total_liquidacion - total_merma_arreglos

        # Arreglos vencidos
        arreglos_vencidos = 0
        for a in arreglos_rows:
            estado = _calcular_estado_arreglo(dict(a))
            if estado == "VENCIDO":
                arreglos_vencidos += safe_int(a["cantidad"])

        # Normal = total_producido - total_fallados - mermas - divididos
        normal = total_producido - total_fallados - merma_total - total_hijos

        # Alertas
        alertas = []
        if arreglos_vencidos > 0:
            alertas.append({"tipo": "VENCIDO", "mensaje": f"{arreglos_vencidos} prendas en arreglos vencidos"})
        if merma_total > 0:
            alertas.append({"tipo": "MERMA", "mensaje": f"{merma_total} prendas en mermas"})
        if sin_enviar > 0:
            alertas.append({"tipo": "PENDIENTE", "mensaje": f"{sin_enviar} fallados sin enviar a arreglo"})
        if en_arreglo_sin_resolver > 0:
            alertas.append({"tipo": "EN_PROCESO", "mensaje": f"{en_arreglo_sin_resolver} prendas en arreglo sin resolver"})

        # Ecuacion: normal + recuperado + liquidacion + merma_total_all + fallado_pendiente + divididos = total_producido
        merma_total_all = merma_total + total_merma_arreglos
        ecuacion_valida = (
            max(normal, 0) + total_recuperado + total_liquidacion + merma_total_all + max(fallado_pendiente, 0) + total_hijos
        ) == total_producido if total_producido > 0 else True

        return {
            "registro_id": registro_id,
            "n_corte": reg["n_corte"],
            "estado": reg["estado"],
            # Cifras principales
            "total_producido": total_producido,
            "normal": max(normal, 0),
            "total_fallados": total_fallados,
            "fallado_pendiente": max(fallado_pendiente, 0),
            "recuperado": total_recuperado,
            "liquidacion": total_liquidacion,
            "merma": merma_total,
            "merma_arreglos": total_merma_arreglos,
            "divididos": total_hijos,
            # Arreglos detalle
            "arreglos_vencidos": arreglos_vencidos,
            "total_en_arreglo": total_en_arreglo,
            # Alertas
            "alertas": alertas,
            "ecuacion_valida": ecuacion_valida,
        }


# ==================== TRAZABILIDAD COMPLETA (timeline) ====================

@router.get("/registros/{registro_id}/trazabilidad-completa")
async def trazabilidad_completa(
    registro_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Timeline unificado de eventos del lote."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("""
            SELECT r.id, r.n_corte, r.estado, r.estado_op, r.fecha_creacion,
                   r.fecha_entrega_final, r.urgente, r.dividido_desde_registro_id,
                   m.nombre as modelo_nombre, rp.nombre as ruta_nombre
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_rutas_produccion rp ON m.ruta_produccion_id = rp.id
            WHERE r.id = $1
        """, registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        reg_d = dict(reg)
        for f in ("fecha_creacion", "fecha_entrega_final"):
            if reg_d.get(f): reg_d[f] = str(reg_d[f])

        eventos = []

        # 1. Movimientos
        movs = await conn.fetch("""
            SELECT mp.*, sp.nombre as servicio_nombre, pp.nombre as persona_nombre
            FROM prod_movimientos_produccion mp
            LEFT JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON mp.persona_id = pp.id
            WHERE mp.registro_id = $1
            ORDER BY mp.fecha_inicio ASC NULLS LAST, mp.created_at ASC
        """, registro_id)
        for mv in movs:
            d = dict(mv)
            eventos.append({
                "tipo_evento": "MOVIMIENTO",
                "fecha": str(d.get("fecha_inicio") or d.get("created_at") or ""),
                "servicio": d.get("servicio_nombre", ""),
                "persona": d.get("persona_nombre", ""),
                "cantidad_enviada": safe_int(d.get("cantidad_enviada")),
                "cantidad_recibida": safe_int(d.get("cantidad_recibida")),
                "id": d["id"],
            })

        # 2. Mermas
        mermas = await conn.fetch("""
            SELECT m.*, sp.nombre as servicio_nombre
            FROM prod_mermas m
            LEFT JOIN prod_servicios_produccion sp ON m.servicio_id = sp.id
            WHERE m.registro_id = $1
        """, registro_id)
        for mr in mermas:
            d = dict(mr)
            eventos.append({
                "tipo_evento": "MERMA",
                "fecha": str(d.get("fecha") or d.get("created_at") or ""),
                "cantidad": safe_int(d.get("cantidad")),
                "motivo": d.get("motivo", ""),
                "id": d["id"],
            })

        # 3. Fallados
        fallados = await conn.fetch("SELECT * FROM prod_fallados WHERE registro_id = $1", registro_id)
        for fl in fallados:
            d = dict(fl)
            eventos.append({
                "tipo_evento": "FALLADO",
                "fecha": str(d.get("fecha_deteccion") or d.get("created_at") or ""),
                "cantidad_detectada": safe_int(d.get("cantidad_detectada")),
                "observacion": d.get("observacion") or d.get("observaciones") or "",
                "id": d["id"],
            })

        # 4. Arreglos V2
        arreglos = await conn.fetch("""
            SELECT a.*, sp.nombre as servicio_nombre, pp.nombre as persona_nombre
            FROM prod_registro_arreglos a
            LEFT JOIN prod_servicios_produccion sp ON a.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON a.persona_id = pp.id
            WHERE a.registro_id = $1
        """, registro_id)
        for ar in arreglos:
            d = dict(ar)
            estado = _calcular_estado_arreglo(d)
            eventos.append({
                "tipo_evento": "ARREGLO",
                "fecha": str(d.get("fecha_envio") or d.get("created_at") or ""),
                "cantidad": safe_int(d.get("cantidad")),
                "servicio": d.get("servicio_nombre", ""),
                "persona": d.get("persona_nombre", ""),
                "estado": estado,
                "cantidad_recuperada": safe_int(d.get("cantidad_recuperada")),
                "cantidad_liquidacion": safe_int(d.get("cantidad_liquidacion")),
                "cantidad_merma": safe_int(d.get("cantidad_merma")),
                "fecha_limite": str(d["fecha_limite"]) if d.get("fecha_limite") else None,
                "id": d["id"],
            })

        # 5. Divisiones
        hijos = await conn.fetch("""
            SELECT id, n_corte, estado, division_numero, fecha_creacion,
                   COALESCE((SELECT SUM(rt.cantidad_real) FROM prod_registro_tallas rt WHERE rt.registro_id = h.id),0) as prendas
            FROM prod_registros h
            WHERE h.dividido_desde_registro_id = $1
            ORDER BY h.division_numero
        """, registro_id)
        for h in hijos:
            d = dict(h)
            eventos.append({
                "tipo_evento": "DIVISION",
                "fecha": str(d.get("fecha_creacion") or ""),
                "hijo_id": d["id"],
                "hijo_n_corte": d["n_corte"],
                "prendas": safe_int(d.get("prendas")),
            })

        eventos.sort(key=lambda e: e.get("fecha", ""))

        return {
            "registro": reg_d,
            "eventos": eventos,
            "total_eventos": len(eventos),
        }


# ==================== REPORTE TRAZABILIDAD GENERAL ====================

@router.get("/reporte-trazabilidad")
async def reporte_trazabilidad(
    current_user: dict = Depends(get_current_user),
):
    """Resumen de trazabilidad de todos los registros activos."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registros = await conn.fetch("""
            SELECT r.id, r.n_corte, r.estado, r.estado_op,
                   m.nombre as modelo_nombre, ma.nombre as marca,
                   COALESCE((SELECT SUM(rt.cantidad_real) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id), 0) as cantidad_inicial
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            ORDER BY r.n_corte
        """)

        resultado = []
        for reg in registros:
            rid = reg["id"]
            ci = safe_int(reg["cantidad_inicial"])

            merma = safe_int(await conn.fetchval(
                "SELECT COALESCE(SUM(cantidad),0) FROM prod_mermas WHERE registro_id = $1", rid))
            total_fallados = await _get_total_fallados(conn, rid)

            # Arreglos V2
            arreglos_rows = await conn.fetch(
                "SELECT cantidad, cantidad_recuperada, cantidad_liquidacion, cantidad_merma, estado, fecha_limite FROM prod_registro_arreglos WHERE registro_id = $1", rid)
            total_en_arreglo = sum(safe_int(a["cantidad"]) for a in arreglos_rows)
            recuperado = sum(safe_int(a["cantidad_recuperada"]) for a in arreglos_rows)
            liquidacion = sum(safe_int(a["cantidad_liquidacion"]) for a in arreglos_rows)
            merma_arreglos = sum(safe_int(a["cantidad_merma"]) for a in arreglos_rows)
            fallado_pendiente = total_fallados - total_en_arreglo

            vencidos = 0
            for a in arreglos_rows:
                estado = _calcular_estado_arreglo(dict(a))
                if estado == "VENCIDO":
                    vencidos += safe_int(a["cantidad"])

            normal = max(ci - total_fallados - merma, 0)
            tiene_novedades = total_fallados > 0 or merma > 0

            resultado.append({
                "id": rid,
                "n_corte": reg["n_corte"],
                "estado": reg["estado"],
                "modelo": reg["modelo_nombre"] or "",
                "marca": reg["marca"] or "",
                "cantidad_inicial": ci,
                "normal": normal,
                "total_fallados": total_fallados,
                "fallado_pendiente": max(fallado_pendiente, 0),
                "en_arreglo": total_en_arreglo,
                "recuperado": recuperado,
                "liquidacion": liquidacion,
                "merma": merma,
                "merma_arreglos": merma_arreglos,
                "vencidos": vencidos,
                "tiene_novedades": tiene_novedades,
            })

        totales = {
            "registros": len(resultado),
            "cantidad_inicial": sum(r["cantidad_inicial"] for r in resultado),
            "normal": sum(r["normal"] for r in resultado),
            "total_fallados": sum(r["total_fallados"] for r in resultado),
            "en_arreglo": sum(r["en_arreglo"] for r in resultado),
            "recuperado": sum(r["recuperado"] for r in resultado),
            "liquidacion": sum(r["liquidacion"] for r in resultado),
            "merma": sum(r["merma"] for r in resultado),
            "vencidos": sum(r["vencidos"] for r in resultado),
        }

        return {"registros": resultado, "totales": totales}


# ==================== REPORTES KPI TRAZABILIDAD ====================

@router.get("/reportes/trazabilidad-kpis")
async def reportes_trazabilidad_kpis(
    current_user: dict = Depends(get_current_user),
):
    """KPIs consolidados de trazabilidad."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Mermas por servicio
        mermas_servicio = await conn.fetch("""
            SELECT sp.nombre as servicio,
                   COUNT(*) as eventos,
                   COALESCE(SUM(m.cantidad), 0) as total_prendas
            FROM prod_mermas m
            LEFT JOIN prod_servicios_produccion sp ON m.servicio_id = sp.id
            GROUP BY sp.nombre
            ORDER BY total_prendas DESC
        """)

        # Fallados resumen
        fallados_resumen = await conn.fetchrow(
            "SELECT COUNT(*) as eventos, COALESCE(SUM(cantidad_detectada), 0) as prendas FROM prod_fallados"
        )

        # Arreglos V2 resumen
        arreglos_resumen = await conn.fetchrow("""
            SELECT COUNT(*) as total,
                   COALESCE(SUM(cantidad_recuperada), 0) as recuperadas,
                   COALESCE(SUM(cantidad_liquidacion), 0) as liquidadas,
                   COALESCE(SUM(cantidad_merma), 0) as mermas
            FROM prod_registro_arreglos
        """)

        # Arreglos vencidos
        arreglos_vencidos = await conn.fetch("""
            SELECT a.id, a.registro_id, r.n_corte,
                   sp.nombre as servicio_nombre,
                   pp.nombre as persona_nombre,
                   a.cantidad, a.fecha_envio, a.fecha_limite,
                   a.estado,
                   (CURRENT_DATE - a.fecha_limite::date) as dias_vencido
            FROM prod_registro_arreglos a
            JOIN prod_registros r ON a.registro_id = r.id
            LEFT JOIN prod_servicios_produccion sp ON a.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON a.persona_id = pp.id
            WHERE a.fecha_limite < CURRENT_DATE
              AND (a.cantidad_recuperada + a.cantidad_liquidacion + a.cantidad_merma) < a.cantidad
            ORDER BY a.fecha_limite ASC
        """)

        # Arreglos por responsable
        arreglos_responsable = await conn.fetch("""
            SELECT COALESCE(sp.nombre, pp.nombre, 'Sin asignar') as responsable,
                   COUNT(*) as total_arreglos,
                   COALESCE(SUM(a.cantidad), 0) as prendas_enviadas,
                   COALESCE(SUM(a.cantidad_recuperada), 0) as prendas_recuperadas
            FROM prod_registro_arreglos a
            LEFT JOIN prod_servicios_produccion sp ON a.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON a.persona_id = pp.id
            GROUP BY COALESCE(sp.nombre, pp.nombre, 'Sin asignar')
            ORDER BY total_arreglos DESC
        """)

        # Totales mermas
        totales_mermas = await conn.fetchrow("SELECT COUNT(*) as eventos, COALESCE(SUM(cantidad),0) as prendas FROM prod_mermas")

        return {
            "kpis": {
                "mermas_total": safe_int(totales_mermas["prendas"]),
                "mermas_eventos": safe_int(totales_mermas["eventos"]),
                "fallados_total": safe_int(fallados_resumen["prendas"]),
                "fallados_eventos": safe_int(fallados_resumen["eventos"]),
                "arreglos_total": safe_int(arreglos_resumen["total"]),
                "arreglos_recuperadas": safe_int(arreglos_resumen["recuperadas"]),
                "arreglos_liquidadas": safe_int(arreglos_resumen["liquidadas"]),
                "arreglos_vencidos": len(arreglos_vencidos),
            },
            "mermas_por_servicio": [dict(r) for r in mermas_servicio],
            "arreglos_vencidos": [
                {**dict(r), "fecha_envio": str(r["fecha_envio"]) if r["fecha_envio"] else None,
                 "fecha_limite": str(r["fecha_limite"]) if r["fecha_limite"] else None}
                for r in arreglos_vencidos
            ],
            "arreglos_por_responsable": [dict(r) for r in arreglos_responsable],
        }



# ==================== CONTROL DE FALLADOS (pantalla centralizada) ====================

@router.get("/fallados-control")
async def fallados_control(
    estado: Optional[str] = None,
    servicio_id: Optional[str] = None,
    persona_id: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    solo_vencidos: bool = False,
    solo_pendientes: bool = False,
    linea_negocio_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Vista desglosada: una fila por cada arreglo individual + una fila por cada
    registro que tiene fallados sin asignar a arreglo.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1) Filas de arreglos individuales
        arreglo_rows = await conn.fetch("""
            SELECT a.id as arreglo_id,
                   a.registro_id,
                   r.n_corte,
                   r.estado as estado_op,
                   r.linea_negocio_id,
                   m.nombre as modelo,
                   ma.nombre as marca,
                   ln.nombre as linea_negocio,
                   (SELECT COALESCE(SUM(pf.cantidad_detectada),0) FROM prod_fallados pf WHERE pf.registro_id = r.id) as total_fallados_registro,
                   a.cantidad,
                   a.cantidad as enviado,
                   a.cantidad_recuperada,
                   a.cantidad_liquidacion,
                   a.cantidad_merma,
                   (a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma) as pendiente_arreglo,
                   sp.nombre as servicio,
                   pp.nombre as persona,
                   a.servicio_id,
                   a.persona_id,
                   a.fecha_envio,
                   a.fecha_limite,
                   a.estado,
                   a.created_at
            FROM prod_registro_arreglos a
            JOIN prod_registros r ON a.registro_id = r.id
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON r.linea_negocio_id = ln.id
            LEFT JOIN prod_servicios_produccion sp ON a.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON a.persona_id = pp.id
            ORDER BY
                CASE WHEN a.fecha_limite < CURRENT_DATE
                     AND (a.cantidad_recuperada + a.cantidad_liquidacion + a.cantidad_merma) < a.cantidad
                     THEN 0 ELSE 1 END,
                a.fecha_envio DESC NULLS LAST
        """)

        # 2) Registros con fallados sin asignar (para mostrar como "SIN ARREGLO")
        sin_arreglo_rows = await conn.fetch("""
            SELECT r.id as registro_id,
                   r.n_corte,
                   r.estado as estado_op,
                   r.linea_negocio_id,
                   m.nombre as modelo,
                   ma.nombre as marca,
                   ln.nombre as linea_negocio,
                   fa_sum.total_fallados,
                   COALESCE(aa_sum.total_enviado, 0) as total_enviado,
                   (fa_sum.total_fallados - COALESCE(aa_sum.total_enviado, 0)) as sin_enviar
            FROM prod_registros r
            INNER JOIN (
                SELECT registro_id, COALESCE(SUM(cantidad_detectada),0) as total_fallados
                FROM prod_fallados GROUP BY registro_id HAVING SUM(cantidad_detectada) > 0
            ) fa_sum ON r.id = fa_sum.registro_id
            LEFT JOIN (
                SELECT registro_id, COALESCE(SUM(cantidad),0) as total_enviado
                FROM prod_registro_arreglos GROUP BY registro_id
            ) aa_sum ON r.id = aa_sum.registro_id
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON r.linea_negocio_id = ln.id
            WHERE (fa_sum.total_fallados - COALESCE(aa_sum.total_enviado, 0)) > 0
            ORDER BY (fa_sum.total_fallados - COALESCE(aa_sum.total_enviado, 0)) DESC
        """)

        hoy = date.today()
        resultado = []

        # Procesar arreglos individuales
        for row in arreglo_rows:
            d = dict(row)
            estado_calc = _calcular_estado_arreglo(d)

            # Dias transcurridos
            fecha_envio = d.get("fecha_envio")
            fecha_limite = d.get("fecha_limite")
            if estado_calc == "COMPLETADO":
                # Para completados: dias que tardo (envio hasta limite o hoy, el menor)
                dias = 0
            elif fecha_envio:
                dias = max((hoy - fecha_envio).days, 0) if isinstance(fecha_envio, date) else 0
            else:
                dias = 0

            fila = {
                "tipo_fila": "ARREGLO",
                "arreglo_id": d["arreglo_id"],
                "registro_id": d["registro_id"],
                "n_corte": d["n_corte"],
                "modelo": d["modelo"] or "",
                "marca": d["marca"] or "",
                "linea_negocio": d["linea_negocio"] or "",
                "linea_negocio_id": d.get("linea_negocio_id"),
                "total_fallados_registro": safe_int(d["total_fallados_registro"]),
                "enviado": safe_int(d["enviado"]),
                "recuperado": safe_int(d["cantidad_recuperada"]),
                "liquidacion": safe_int(d["cantidad_liquidacion"]),
                "merma": safe_int(d["cantidad_merma"]),
                "pendiente": max(safe_int(d["pendiente_arreglo"]), 0),
                "servicio": d["servicio"] or "",
                "persona": d["persona"] or "",
                "servicio_id": d.get("servicio_id"),
                "persona_id": d.get("persona_id"),
                "fecha_envio": str(fecha_envio) if fecha_envio else None,
                "fecha_limite": str(fecha_limite) if fecha_limite else None,
                "dias": dias,
                "estado": estado_calc,
            }

            # Aplicar filtros
            if estado and estado_calc != estado:
                continue
            if solo_vencidos and estado_calc != "VENCIDO":
                continue
            if solo_pendientes and estado_calc in ("COMPLETADO",):
                continue
            if linea_negocio_id and str(d.get("linea_negocio_id") or "") != linea_negocio_id:
                continue
            if servicio_id and d.get("servicio_id") != servicio_id:
                continue
            if persona_id and d.get("persona_id") != persona_id:
                continue
            if fecha_desde:
                fd = date.fromisoformat(fecha_desde[:10])
                if fecha_envio and fecha_envio < fd:
                    continue
            if fecha_hasta:
                fh = date.fromisoformat(fecha_hasta[:10])
                if fecha_envio and fecha_envio > fh:
                    continue

            resultado.append(fila)

        # Procesar registros sin arreglo asignado
        if not solo_vencidos and estado != "COMPLETADO" and not servicio_id and not persona_id:
            for row in sin_arreglo_rows:
                d = dict(row)
                fila = {
                    "tipo_fila": "SIN_ARREGLO",
                    "arreglo_id": None,
                    "registro_id": d["registro_id"],
                    "n_corte": d["n_corte"],
                    "modelo": d["modelo"] or "",
                    "marca": d["marca"] or "",
                    "linea_negocio": d["linea_negocio"] or "",
                    "linea_negocio_id": d.get("linea_negocio_id"),
                    "total_fallados_registro": safe_int(d["total_fallados"]),
                    "enviado": 0,
                    "recuperado": 0,
                    "liquidacion": 0,
                    "merma": 0,
                    "pendiente": safe_int(d["sin_enviar"]),
                    "servicio": "",
                    "persona": "",
                    "servicio_id": None,
                    "persona_id": None,
                    "fecha_envio": None,
                    "fecha_limite": None,
                    "dias": 0,
                    "estado": "SIN_ASIGNAR",
                }

                if estado and estado not in ("SIN_ASIGNAR", "PENDIENTE"):
                    continue
                if linea_negocio_id and str(d.get("linea_negocio_id") or "") != linea_negocio_id:
                    continue

                resultado.append(fila)

        # KPIs
        total_fallados = sum(r["total_fallados_registro"] for r in resultado if r["tipo_fila"] == "SIN_ARREGLO") + sum(r["enviado"] for r in resultado if r["tipo_fila"] == "ARREGLO")
        kpis = {
            "total_fallados": total_fallados,
            "total_pendiente": sum(r["pendiente"] for r in resultado),
            "total_vencidos": len([r for r in resultado if r["estado"] == "VENCIDO"]),
            "total_recuperado": sum(r["recuperado"] for r in resultado),
            "total_liquidacion": sum(r["liquidacion"] for r in resultado),
            "total_merma": sum(r["merma"] for r in resultado),
            "total_sin_asignar": sum(r["pendiente"] for r in resultado if r["tipo_fila"] == "SIN_ARREGLO"),
            "total_registros": len(resultado),
        }

        return {"filas": resultado, "kpis": kpis}

