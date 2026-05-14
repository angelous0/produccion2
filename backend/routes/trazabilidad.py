"""
Router: Trazabilidad Simplificada - Fallados + Arreglos V2
- prod_fallados simplificada: fuente oficial de total_fallados
- prod_registro_arreglos: envios a arreglo con resolucion (recuperado/liquidacion/merma)
- Resumen de cantidades en tiempo real
- Estados automaticos: EN_ARREGLO, PARCIAL, COMPLETADO, VENCIDO
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta, timezone
import io
import json
import uuid

router = APIRouter(prefix="/api", tags=["trazabilidad"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict

DIAS_LIMITE_ARREGLO = 3
DIAS_LIMITE_TELA_DESTRABAR = 5  # Si tela EVALUANDO lleva más, se pinta ámbar


def add_workdays_no_sunday(start: date, days: int) -> date:
    """Suma `days` días al calendario saltando domingos.

    Ejemplo: viernes + 3 → miércoles (sábado cuenta, domingo se salta,
    lunes-martes-miércoles).
    """
    current = start
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() != 6:  # 6 = domingo en Python (lunes=0)
            added += 1
    return current


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
        # Columnas legacy / extensiones — todas con defaults sensatos para
        # registros antiguos (causa='servicio', sin estado_tela ni fecha_cierre).
        for col_sql in [
            "ALTER TABLE prod_fallados ADD COLUMN IF NOT EXISTS created_by VARCHAR",
            "ALTER TABLE prod_fallados ADD COLUMN IF NOT EXISTS observacion TEXT",
            "ALTER TABLE prod_fallados ADD COLUMN IF NOT EXISTS causa VARCHAR DEFAULT 'servicio'",
            "ALTER TABLE prod_fallados ADD COLUMN IF NOT EXISTS estado_tela VARCHAR",
            "ALTER TABLE prod_fallados ADD COLUMN IF NOT EXISTS fecha_cierre DATE",
            "ALTER TABLE prod_fallados ADD COLUMN IF NOT EXISTS origen_arreglo_id VARCHAR",
            # Backfill: cualquier fila vieja sin causa se considera 'servicio'.
            "UPDATE prod_fallados SET causa = 'servicio' WHERE causa IS NULL",
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
        # Extensión: cantidad que el servicio terminó pero pasó a evaluación
        # de tela (Acabado decide después). Nullable / default 0 para datos
        # antiguos que no tenían este flujo.
        try:
            await conn.execute(
                "ALTER TABLE prod_registro_arreglos "
                "ADD COLUMN IF NOT EXISTS cantidad_pasa_a_tela INT DEFAULT 0"
            )
        except Exception:
            pass

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
    # Causa: 'servicio' (default, flujo legacy) o 'tela' (queda en evaluación
    # interna de Acabado, no se envía a proveedor).
    causa: Optional[str] = "servicio"

class FalladoUpdate(BaseModel):
    cantidad_detectada: Optional[int] = None
    fecha_deteccion: Optional[str] = None
    observacion: Optional[str] = None

class FalladoCerrarTela(BaseModel):
    """Cierra un fallado causa='tela' con la decisión de Acabado."""
    resolucion: str  # 'RECUPERADO' o 'LIQUIDADO'

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
    cantidad_pasa_a_tela: int = 0

class ArregloUpdate(BaseModel):
    cantidad: Optional[int] = None
    servicio_id: Optional[str] = None
    persona_id: Optional[str] = None
    fecha_envio: Optional[str] = None
    observacion: Optional[str] = None
    cantidad_recuperada: Optional[int] = None
    cantidad_liquidacion: Optional[int] = None
    cantidad_merma: Optional[int] = None
    cantidad_pasa_a_tela: Optional[int] = None

class ArregloMarcaCobro(BaseModel):
    """Marca o desmarca un envío como "pendiente de cobro al proveedor".

    Se usa cuando un envío venció y el supervisor decide descontar el costo
    al proveedor en lugar de esperar la entrega física. La acción la procesa
    Finanzas en otro módulo.
    """
    motivo: Optional[str] = None


class ArregloCobrar(BaseModel):
    """Marca un envío como cobrado (Finanzas procesó la nota de descuento o
    registró el comprobante). Solo aplica si previamente estaba marcado.
    """
    tipo_comprobante: Optional[str] = None        # 'nota_descuento', 'factura', 'boleta', etc.
    numero_comprobante: Optional[str] = None
    fecha_emision_comprobante: Optional[str] = None  # ISO YYYY-MM-DD
    observaciones: Optional[str] = None


class ArregloDescobrar(BaseModel):
    motivo: Optional[str] = None


class NotaCobroCreate(BaseModel):
    """Genera una nota de cobro agrupando N envíos vencidos de un mismo
    proveedor. Cada envío seleccionado queda vinculado a la nota y se
    marca como `marcado_para_cobro=TRUE` (si no lo estaba ya)."""
    arreglo_ids: List[str]
    proveedor_id: Optional[str] = None   # opcional: si todos son del mismo proveedor
    proveedor_nombre: Optional[str] = None
    observacion: Optional[str] = None


class NotaCobroAnular(BaseModel):
    motivo: Optional[str] = None


# ==================== HELPERS ====================

def _calcular_estado_arreglo(arreglo_row):
    """Calcula el estado real de un arreglo basado en sus datos.

    Resuelto = recuperadas + a cobrar al proveedor (liquidacion) + merma
              + pasa_a_tela. Cuando suma >= cantidad enviada, el envío se
    considera COMPLETADO (independientemente de cómo se distribuyó).
    """
    rec = safe_int(arreglo_row.get("cantidad_recuperada", 0))
    liq = safe_int(arreglo_row.get("cantidad_liquidacion", 0))
    mer = safe_int(arreglo_row.get("cantidad_merma", 0))
    pat = safe_int(arreglo_row.get("cantidad_pasa_a_tela", 0))
    cant = safe_int(arreglo_row.get("cantidad", 0))
    resuelto = rec + liq + mer + pat

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
    """SUM(cantidad_detectada) de fallados causa='servicio' SIN origen_arreglo_id.

    Estos son los que respaldan el cupo de envíos a arreglo. Los fallados
    causa='tela' siguen un flujo paralelo (no van a proveedor) y los
    derivados de un arreglo (origen_arreglo_id != NULL) son sólo
    reclasificación, no prendas físicas nuevas.
    """
    val = await conn.fetchval(
        """
        SELECT COALESCE(SUM(cantidad_detectada), 0)
        FROM prod_fallados
        WHERE registro_id = $1
          AND origen_arreglo_id IS NULL
          AND COALESCE(causa, 'servicio') = 'servicio'
        """,
        registro_id,
    )
    return safe_int(val)


async def _get_total_fallados_originales(conn, registro_id: str) -> int:
    """SUM de fallados originales (sin origen_arreglo_id), de cualquier causa.

    Representa las prendas físicas detectadas como falladas. Se usa para
    calcular `normal = producido - total_fallados_originales - merma - divididos`.
    """
    val = await conn.fetchval(
        """
        SELECT COALESCE(SUM(cantidad_detectada), 0)
        FROM prod_fallados
        WHERE registro_id = $1 AND origen_arreglo_id IS NULL
        """,
        registro_id,
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
        "SELECT id, cantidad, cantidad_recuperada, cantidad_liquidacion, cantidad_merma, "
        "COALESCE(cantidad_pasa_a_tela, 0) AS cantidad_pasa_a_tela, fecha_limite, estado "
        "FROM prod_registro_arreglos WHERE registro_id = $1",
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
                   COALESCE(f.causa, 'servicio') AS causa,
                   f.estado_tela, f.fecha_cierre, f.origen_arreglo_id,
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
            for f in ("fecha_deteccion", "fecha_cierre", "created_at"):
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

    causa = (input.causa or "servicio").lower().strip()
    if causa not in ("servicio", "tela"):
        raise HTTPException(status_code=400, detail="causa debe ser 'servicio' o 'tela'")

    pool = await get_pool()
    async with pool.acquire() as conn:
        fid = str(uuid.uuid4())
        fecha = date.fromisoformat(input.fecha_deteccion[:10]) if input.fecha_deteccion else date.today()
        created_by = current_user.get("username", current_user.get("nombre", "sistema"))

        # Para causa='tela' arrancan en estado EVALUANDO. Para 'servicio' el
        # campo estado_tela queda NULL (no aplica).
        estado_tela = "EVALUANDO" if causa == "tela" else None

        await conn.execute("""
            INSERT INTO prod_fallados
                (id, registro_id, cantidad_detectada, fecha_deteccion, observacion,
                 created_by, causa, estado_tela)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """, fid, input.registro_id, input.cantidad_detectada, fecha,
            input.observacion, created_by, causa, estado_tela)

        return {"id": fid, "message": "Fallado registrado", "causa": causa, "estado_tela": estado_tela}


@router.post("/fallados/{fallado_id}/cerrar-tela")
async def cerrar_fallado_tela(
    fallado_id: str,
    input: FalladoCerrarTela,
    current_user: dict = Depends(get_current_user),
):
    """Cierra un fallado causa='tela' con la decisión de Acabado:
    - RECUPERADO: la prenda vuelve al lote bueno.
    - LIQUIDADO: la prenda sale del inventario.
    """
    resolucion = (input.resolucion or "").upper().strip()
    if resolucion not in ("RECUPERADO", "LIQUIDADO"):
        raise HTTPException(
            status_code=400,
            detail="resolucion debe ser 'RECUPERADO' o 'LIQUIDADO'",
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, causa, estado_tela FROM prod_fallados WHERE id = $1",
            fallado_id,
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Fallado no encontrado")
        if (existing["causa"] or "servicio") != "tela":
            raise HTTPException(
                status_code=400,
                detail="Solo se pueden cerrar fallados con causa='tela'",
            )
        if existing["estado_tela"] in ("RECUPERADO", "LIQUIDADO"):
            raise HTTPException(
                status_code=400,
                detail=f"Este fallado ya fue cerrado como {existing['estado_tela']}",
            )

        await conn.execute(
            "UPDATE prod_fallados SET estado_tela = $1, fecha_cierre = $2 WHERE id = $3",
            resolucion, date.today(), fallado_id,
        )
        return {"message": f"Fallado cerrado como {resolucion}", "estado_tela": resolucion}


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

async def _tabla_existe(conn, schema: str, tabla: str) -> bool:
    """True si existe la tabla. Útil para chequear tablas de finanzas que
    pueden no existir todavía en esta instancia (forward-compat).
    """
    return bool(await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = $1 AND table_name = $2
        )
        """,
        schema, tabla,
    ))


async def _get_nota_descuento_por_arreglo(conn, arreglo_id: str) -> Optional[dict]:
    """Devuelve la nota de descuento ACTIVA asociada a un arreglo, si existe.

    Si la tabla `fin_notas_descuento_lotes` aún no fue creada en este deploy
    (módulo de Finanzas pendiente), devuelve None sin error.
    """
    # Buscar en ambos schemas posibles (finanzas / finanzas2) por compatibilidad.
    for schema in ("finanzas", "finanzas2"):
        if not await _tabla_existe(conn, schema, "fin_notas_descuento_lotes"):
            continue
        if not await _tabla_existe(conn, schema, "fin_notas_descuento"):
            continue
        try:
            row = await conn.fetchrow(
                f"""
                SELECT nd.id, nd.numero, nd.fecha, nd.estado
                FROM {schema}.fin_notas_descuento_lotes ndl
                JOIN {schema}.fin_notas_descuento nd ON nd.id = ndl.nota_id
                WHERE ndl.arreglo_id = $1 AND nd.estado = 'activa'
                LIMIT 1
                """,
                arreglo_id,
            )
        except Exception:
            return None
        if row:
            d = dict(row)
            if d.get("fecha"): d["fecha"] = str(d["fecha"])
            return d
    return None


def _serialize_arreglo(d: dict) -> dict:
    """Normaliza fechas y tipos para que el JSON sea consistente con la UI."""
    d["estado"] = _calcular_estado_arreglo(d)
    for f in ("fecha_envio", "fecha_limite", "created_at", "fecha_marcado"):
        if d.get(f):
            d[f] = str(d[f])
    # Exponer marcado_para_cobro como bool (no None)
    d["marcado_para_cobro"] = bool(d.get("marcado_para_cobro") or False)
    return d


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
            d = _serialize_arreglo(dict(r))
            # nota_descuento: forward-compat, null si Finanzas no tiene la tabla
            d["nota_descuento"] = await _get_nota_descuento_por_arreglo(conn, d["id"])
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
        # Plazo de 3 días hábiles (sin domingos). Si envío viernes → vence miércoles.
        fecha_limite = add_workdays_no_sunday(fecha_envio, DIAS_LIMITE_ARREGLO)
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
        # Nuevo campo: "pasa a evaluación de tela". Si no estaba en BD
        # (datos antiguos), arranca en 0 — no cambia el comportamiento previo.
        prev_pat = safe_int(existing.get("cantidad_pasa_a_tela", 0) or 0)
        pat = input.cantidad_pasa_a_tela if input.cantidad_pasa_a_tela is not None else prev_pat

        # Validar no negativos
        for nombre, val in [
            ("cantidad", cantidad_final),
            ("cantidad_recuperada", rec),
            ("cantidad_liquidacion", liq),
            ("cantidad_merma", mer),
            ("cantidad_pasa_a_tela", pat),
        ]:
            if val < 0:
                raise HTTPException(status_code=400, detail=f"{nombre} no puede ser negativo")

        # Validar resolución no exceda cantidad
        suma = rec + liq + mer + pat
        if suma > cantidad_final:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"La resolución ({rec} + {liq} + {mer} + {pat} = {suma}) "
                    f"excede la cantidad del arreglo ({cantidad_final})"
                ),
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
            ("cantidad_pasa_a_tela", input.cantidad_pasa_a_tela),
        ]:
            if val is not None:
                params.append(val if val != "" else None)
                sets.append(f"{field} = ${len(params)}")

        if input.fecha_envio is not None:
            fe = date.fromisoformat(input.fecha_envio[:10])
            params.append(fe)
            sets.append(f"fecha_envio = ${len(params)}")
            fl = add_workdays_no_sunday(fe, DIAS_LIMITE_ARREGLO)
            params.append(fl)
            sets.append(f"fecha_limite = ${len(params)}")

        # Recalcular estado
        temp = dict(existing)
        if input.cantidad is not None: temp["cantidad"] = input.cantidad
        if input.cantidad_recuperada is not None: temp["cantidad_recuperada"] = input.cantidad_recuperada
        if input.cantidad_liquidacion is not None: temp["cantidad_liquidacion"] = input.cantidad_liquidacion
        if input.cantidad_merma is not None: temp["cantidad_merma"] = input.cantidad_merma
        if input.cantidad_pasa_a_tela is not None: temp["cantidad_pasa_a_tela"] = input.cantidad_pasa_a_tela
        if input.fecha_envio is not None:
            temp["fecha_limite"] = add_workdays_no_sunday(
                date.fromisoformat(input.fecha_envio[:10]), DIAS_LIMITE_ARREGLO,
            )
        nuevo_estado = _calcular_estado_arreglo(temp)
        params.append(nuevo_estado)
        sets.append(f"estado = ${len(params)}")

        if sets:
            params.append(arreglo_id)
            await conn.execute(
                f"UPDATE prod_registro_arreglos SET {', '.join(sets)} WHERE id = ${len(params)}",
                *params
            )

        # === Auto-crear fallado tela si pasa_a_tela aumentó ===
        # Cuando el servicio terminó y declaró que X prendas tienen defecto
        # de tela (no de servicio), creamos automáticamente un fallado con
        # causa='tela' en estado EVALUANDO, para que Acabado decida.
        delta_pat = pat - prev_pat
        if delta_pat > 0:
            servicio_nombre = await conn.fetchval(
                "SELECT sp.nombre FROM prod_servicios_produccion sp WHERE sp.id = $1",
                existing.get("servicio_id"),
            )
            persona_nombre = await conn.fetchval(
                "SELECT pp.nombre FROM prod_personas_produccion pp WHERE pp.id = $1",
                existing.get("persona_id"),
            )
            origen_label = servicio_nombre or "servicio"
            if persona_nombre:
                origen_label = f"{origen_label} · {persona_nombre}"
            nota = f"Viene de {origen_label} (envío {arreglo_id[:8]})"
            created_by = current_user.get("username", current_user.get("nombre", "sistema"))

            await conn.execute(
                """
                INSERT INTO prod_fallados
                    (id, registro_id, cantidad_detectada, fecha_deteccion, observacion,
                     created_by, causa, estado_tela, origen_arreglo_id)
                VALUES ($1, $2, $3, $4, $5, $6, 'tela', 'EVALUANDO', $7)
                """,
                str(uuid.uuid4()), registro_id, delta_pat, date.today(), nota,
                created_by, arreglo_id,
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


# ==================== MARCAJE PARA COBRO ====================

def _snapshot_arreglo(row: dict) -> dict:
    """Mini-snapshot del arreglo para guardar en audit (estado_previo/nuevo)."""
    return {
        "id": row.get("id"),
        "registro_id": row.get("registro_id"),
        "cantidad": safe_int(row.get("cantidad")),
        "estado": row.get("estado"),
        "fecha_envio": str(row.get("fecha_envio")) if row.get("fecha_envio") else None,
        "fecha_limite": str(row.get("fecha_limite")) if row.get("fecha_limite") else None,
        "marcado_para_cobro": bool(row.get("marcado_para_cobro") or False),
        "marcado_por_usuario_id": row.get("marcado_por_usuario_id"),
        "marcado_por_nombre": row.get("marcado_por_nombre"),
        "fecha_marcado": str(row.get("fecha_marcado")) if row.get("fecha_marcado") else None,
        "motivo_marcado": row.get("motivo_marcado"),
        "cobrado": bool(row.get("cobrado") or False),
        "cobrado_por_usuario_id": row.get("cobrado_por_usuario_id"),
        "cobrado_por_nombre": row.get("cobrado_por_nombre"),
        "fecha_cobro": str(row.get("fecha_cobro")) if row.get("fecha_cobro") else None,
        "tipo_comprobante": row.get("tipo_comprobante"),
        "numero_comprobante": row.get("numero_comprobante"),
        "fecha_emision_comprobante": str(row.get("fecha_emision_comprobante")) if row.get("fecha_emision_comprobante") else None,
        "observaciones_cobro": row.get("observaciones_cobro"),
    }


def _user_display_name(current_user: dict) -> str:
    return (
        current_user.get("nombre_completo")
        or current_user.get("nombre")
        or current_user.get("username")
        or "sistema"
    )


async def _arreglo_tiene_nota_activa(conn, arreglo_id: str) -> bool:
    """Chequeo defensivo: si el arreglo ya está en una nota de descuento
    activa, no se puede marcar/desmarcar (lo procesó Finanzas)."""
    nota = await _get_nota_descuento_por_arreglo(conn, arreglo_id)
    return nota is not None


@router.post("/arreglos/{arreglo_id}/marcar-cobro")
async def marcar_arreglo_para_cobro(
    arreglo_id: str,
    input: ArregloMarcaCobro,
    current_user: dict = Depends(get_current_user),
):
    """Marca un envío vencido como "pendiente de cobro al proveedor".

    Valida:
      - El arreglo existe.
      - El estado es EN_ARREGLO (sin entregar todavía).
      - La fecha_limite ya pasó o es hoy.
      - No está ya marcado.
      - No está vinculado a una nota de descuento activa.
    """
    motivo = (input.motivo or "").strip()
    if motivo and len(motivo) > 500:
        raise HTTPException(status_code=400, detail="El motivo no puede exceder 500 caracteres")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                "SELECT * FROM prod_registro_arreglos WHERE id = $1",
                arreglo_id,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="Envío no encontrado")
            row = dict(existing)
            # Recalcular estado en vivo (VENCIDO se infiere de fecha_limite)
            row["estado"] = _calcular_estado_arreglo(row)
            if row["estado"] not in ("EN_ARREGLO", "VENCIDO", "PARCIAL"):
                raise HTTPException(
                    status_code=400,
                    detail="Solo envíos no entregados (sin completar) pueden marcarse para cobro",
                )
            fecha_limite = row.get("fecha_limite")
            if fecha_limite and fecha_limite > date.today():
                raise HTTPException(
                    status_code=400,
                    detail="El envío aún no está vencido (fecha límite es futura)",
                )
            if row.get("marcado_para_cobro"):
                raise HTTPException(status_code=409, detail="El envío ya está marcado para cobro")
            if row.get("cobrado"):
                raise HTTPException(status_code=409, detail="El envío ya está cobrado")
            if await _arreglo_tiene_nota_activa(conn, arreglo_id):
                raise HTTPException(
                    status_code=409,
                    detail="El envío ya forma parte de una nota de descuento activa",
                )

            estado_previo = _snapshot_arreglo(row)
            user_id = current_user.get("id") or current_user.get("user_id") or "sistema"
            user_name = _user_display_name(current_user)
            now = datetime.now(timezone.utc).replace(tzinfo=None)

            await conn.execute(
                """
                UPDATE prod_registro_arreglos
                SET marcado_para_cobro = TRUE,
                    marcado_por_usuario_id = $1,
                    marcado_por_nombre = $2,
                    fecha_marcado = $3,
                    motivo_marcado = $4
                WHERE id = $5
                """,
                user_id, user_name, now, (motivo or None), arreglo_id,
            )
            row_new = dict(await conn.fetchrow(
                "SELECT * FROM prod_registro_arreglos WHERE id = $1", arreglo_id,
            ))
            row_new["estado"] = _calcular_estado_arreglo(row_new)
            estado_nuevo = _snapshot_arreglo(row_new)

            await conn.execute(
                """
                INSERT INTO prod_arreglos_audit
                    (arreglo_id, accion, usuario_id, usuario_nombre, motivo,
                     estado_previo, estado_nuevo)
                VALUES ($1, 'marcar_cobro', $2, $3, $4, $5::jsonb, $6::jsonb)
                """,
                arreglo_id, user_id, user_name, (motivo or None),
                json.dumps(estado_previo), json.dumps(estado_nuevo),
            )

            row_new = _serialize_arreglo(row_new)
            row_new["nota_descuento"] = None
            return row_new


@router.post("/arreglos/{arreglo_id}/desmarcar-cobro")
async def desmarcar_arreglo_cobro(
    arreglo_id: str,
    input: ArregloMarcaCobro,
    current_user: dict = Depends(get_current_user),
):
    """Quita la marca de cobro de un envío. Solo si no fue procesado por
    Finanzas todavía (no está en una nota de descuento activa)."""
    motivo = (input.motivo or "").strip()
    if motivo and len(motivo) > 500:
        raise HTTPException(status_code=400, detail="El motivo no puede exceder 500 caracteres")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                "SELECT * FROM prod_registro_arreglos WHERE id = $1",
                arreglo_id,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="Envío no encontrado")
            row = dict(existing)
            if not row.get("marcado_para_cobro"):
                raise HTTPException(status_code=409, detail="El envío no está marcado")
            if row.get("cobrado"):
                raise HTTPException(status_code=409, detail="No se puede desmarcar: el envío ya está cobrado. Descobra primero.")
            if await _arreglo_tiene_nota_activa(conn, arreglo_id):
                raise HTTPException(
                    status_code=409,
                    detail="No se puede desmarcar: ya está descontado en una nota activa",
                )

            row["estado"] = _calcular_estado_arreglo(row)
            estado_previo = _snapshot_arreglo(row)
            user_id = current_user.get("id") or current_user.get("user_id") or "sistema"
            user_name = _user_display_name(current_user)

            await conn.execute(
                """
                UPDATE prod_registro_arreglos
                SET marcado_para_cobro = FALSE,
                    marcado_por_usuario_id = NULL,
                    marcado_por_nombre = NULL,
                    fecha_marcado = NULL,
                    motivo_marcado = NULL
                WHERE id = $1
                """,
                arreglo_id,
            )
            row_new = dict(await conn.fetchrow(
                "SELECT * FROM prod_registro_arreglos WHERE id = $1", arreglo_id,
            ))
            row_new["estado"] = _calcular_estado_arreglo(row_new)
            estado_nuevo = _snapshot_arreglo(row_new)

            await conn.execute(
                """
                INSERT INTO prod_arreglos_audit
                    (arreglo_id, accion, usuario_id, usuario_nombre, motivo,
                     estado_previo, estado_nuevo)
                VALUES ($1, 'desmarcar_cobro', $2, $3, $4, $5::jsonb, $6::jsonb)
                """,
                arreglo_id, user_id, user_name, (motivo or None),
                json.dumps(estado_previo), json.dumps(estado_nuevo),
            )

            row_new = _serialize_arreglo(row_new)
            row_new["nota_descuento"] = None
            return row_new


@router.post("/arreglos/{arreglo_id}/cobrar")
async def cobrar_arreglo(
    arreglo_id: str,
    input: ArregloCobrar,
    current_user: dict = Depends(get_current_user),
):
    """Marca un envío como COBRADO: Finanzas procesó la nota / comprobante.
    Requisitos:
      - El arreglo existe y está marcado_para_cobro = TRUE.
      - No está ya cobrado.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                "SELECT * FROM prod_registro_arreglos WHERE id = $1",
                arreglo_id,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="Envío no encontrado")
            row = dict(existing)
            if not row.get("marcado_para_cobro"):
                raise HTTPException(
                    status_code=400,
                    detail="El envío no está marcado para cobro. Márcalo primero.",
                )
            if row.get("cobrado"):
                raise HTTPException(status_code=409, detail="El envío ya está cobrado")

            tipo = (input.tipo_comprobante or "").strip() or None
            numero = (input.numero_comprobante or "").strip() or None
            fecha_emi = None
            if input.fecha_emision_comprobante:
                try:
                    fecha_emi = date.fromisoformat(input.fecha_emision_comprobante[:10])
                except (ValueError, TypeError):
                    raise HTTPException(status_code=400, detail="fecha_emision_comprobante inválida")
            obs = (input.observaciones or "").strip() or None

            row["estado"] = _calcular_estado_arreglo(row)
            estado_previo = _snapshot_arreglo(row)
            user_id = current_user.get("id") or current_user.get("user_id") or "sistema"
            user_name = _user_display_name(current_user)
            now = datetime.now(timezone.utc).replace(tzinfo=None)

            await conn.execute(
                """
                UPDATE prod_registro_arreglos
                SET cobrado = TRUE,
                    cobrado_por_usuario_id = $1,
                    cobrado_por_nombre = $2,
                    fecha_cobro = $3,
                    tipo_comprobante = $4,
                    numero_comprobante = $5,
                    fecha_emision_comprobante = $6,
                    observaciones_cobro = $7
                WHERE id = $8
                """,
                user_id, user_name, now, tipo, numero, fecha_emi, obs, arreglo_id,
            )
            row_new = dict(await conn.fetchrow(
                "SELECT * FROM prod_registro_arreglos WHERE id = $1", arreglo_id,
            ))
            row_new["estado"] = _calcular_estado_arreglo(row_new)
            estado_nuevo = _snapshot_arreglo(row_new)

            await conn.execute(
                """
                INSERT INTO prod_arreglos_audit
                    (arreglo_id, accion, usuario_id, usuario_nombre, motivo,
                     estado_previo, estado_nuevo)
                VALUES ($1, 'cobrar', $2, $3, $4, $5::jsonb, $6::jsonb)
                """,
                arreglo_id, user_id, user_name,
                f"{tipo or '-'} {numero or '-'}" if (tipo or numero) else None,
                json.dumps(estado_previo), json.dumps(estado_nuevo),
            )
            row_new = _serialize_arreglo(row_new)
            row_new["nota_descuento"] = None
            return row_new


@router.post("/arreglos/{arreglo_id}/descobrar")
async def descobrar_arreglo(
    arreglo_id: str,
    input: ArregloDescobrar,
    current_user: dict = Depends(get_current_user),
):
    """Revierte el estado COBRADO de un envío (vuelve a 'marcado').
    Útil cuando se anuló el comprobante. Requiere motivo.
    """
    motivo = (input.motivo or "").strip()
    if not motivo:
        raise HTTPException(status_code=400, detail="El motivo es obligatorio para descobrar")
    if len(motivo) > 500:
        raise HTTPException(status_code=400, detail="El motivo no puede exceder 500 caracteres")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                "SELECT * FROM prod_registro_arreglos WHERE id = $1",
                arreglo_id,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="Envío no encontrado")
            row = dict(existing)
            if not row.get("cobrado"):
                raise HTTPException(status_code=409, detail="El envío no está cobrado")

            row["estado"] = _calcular_estado_arreglo(row)
            estado_previo = _snapshot_arreglo(row)
            user_id = current_user.get("id") or current_user.get("user_id") or "sistema"
            user_name = _user_display_name(current_user)

            await conn.execute(
                """
                UPDATE prod_registro_arreglos
                SET cobrado = FALSE,
                    cobrado_por_usuario_id = NULL,
                    cobrado_por_nombre = NULL,
                    fecha_cobro = NULL,
                    tipo_comprobante = NULL,
                    numero_comprobante = NULL,
                    fecha_emision_comprobante = NULL,
                    observaciones_cobro = NULL
                WHERE id = $1
                """,
                arreglo_id,
            )
            row_new = dict(await conn.fetchrow(
                "SELECT * FROM prod_registro_arreglos WHERE id = $1", arreglo_id,
            ))
            row_new["estado"] = _calcular_estado_arreglo(row_new)
            estado_nuevo = _snapshot_arreglo(row_new)

            await conn.execute(
                """
                INSERT INTO prod_arreglos_audit
                    (arreglo_id, accion, usuario_id, usuario_nombre, motivo,
                     estado_previo, estado_nuevo)
                VALUES ($1, 'descobrar', $2, $3, $4, $5::jsonb, $6::jsonb)
                """,
                arreglo_id, user_id, user_name, motivo,
                json.dumps(estado_previo), json.dumps(estado_nuevo),
            )
            row_new = _serialize_arreglo(row_new)
            row_new["nota_descuento"] = None
            return row_new


# ==================== NOTAS DE COBRO ====================

async def _generar_numero_nota(conn) -> str:
    """Numera 'NC-YYYY-NNNN' usando una secuencia de PostgreSQL."""
    n = await conn.fetchval("SELECT nextval('produccion.seq_notas_cobro')")
    year = date.today().year
    return f"NC-{year}-{int(n):04d}"


def _nota_basic_dict(row) -> dict:
    """Serializa una fila de prod_notas_cobro para JSON."""
    d = dict(row)
    for f in ("fecha", "created_at", "anulada_at"):
        if d.get(f):
            d[f] = str(d[f])
    return d


async def _arreglo_pertenece_a_nota_activa(conn, arreglo_id: str) -> Optional[dict]:
    """Si el arreglo ya está en una nota activa, devuelve su info."""
    row = await conn.fetchrow(
        """
        SELECT n.id, n.numero, n.fecha, n.estado
        FROM produccion.prod_notas_cobro_lotes ncl
        JOIN produccion.prod_notas_cobro n ON n.id = ncl.nota_id
        WHERE ncl.arreglo_id = $1 AND n.estado = 'activa'
        LIMIT 1
        """,
        arreglo_id,
    )
    if not row:
        return None
    d = dict(row)
    if d.get("fecha"): d["fecha"] = str(d["fecha"])
    return d


@router.post("/notas-cobro")
async def crear_nota_cobro(
    input: NotaCobroCreate,
    current_user: dict = Depends(get_current_user),
):
    """Crea una nota de cobro a partir de N envíos a arreglo.

    Reglas:
      - Mínimo 1 envío.
      - Todos los envíos deben existir, estar vencidos (fecha_limite <= hoy),
        no estar completados y no estar ya en una nota activa.
      - Si todos los envíos comparten un mismo proveedor (persona_id), se
        usa ese como proveedor_id. Si difieren, se requiere `proveedor_nombre`
        explícito o falla.
      - Marca cada arreglo como `marcado_para_cobro=TRUE` (si no lo estaba)
        y registra en audit.
    """
    if not input.arreglo_ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos un envío")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Validar que todos existen, son válidos y no están en nota activa
            rows = await conn.fetch(
                """
                SELECT a.*,
                       sp.nombre AS servicio_nombre,
                       pp.nombre AS persona_nombre
                FROM prod_registro_arreglos a
                LEFT JOIN prod_servicios_produccion sp ON sp.id = a.servicio_id
                LEFT JOIN prod_personas_produccion pp ON pp.id = a.persona_id
                WHERE a.id = ANY($1::varchar[])
                """,
                input.arreglo_ids,
            )
            if len(rows) != len(input.arreglo_ids):
                raise HTTPException(status_code=400, detail="Algunos envíos no existen")

            hoy = date.today()
            personas = set()
            personas_nombres = set()
            empresas = set()
            for r in rows:
                d = dict(r)
                d["estado"] = _calcular_estado_arreglo(d)
                if d["estado"] == "COMPLETADO":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Envío {d['id'][:8]} ya está completado",
                    )
                if not d.get("fecha_limite") or d["fecha_limite"] > hoy:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Envío {d['id'][:8]} aún no está vencido",
                    )
                nota_activa = await _arreglo_pertenece_a_nota_activa(conn, d["id"])
                if nota_activa:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Envío {d['id'][:8]} ya está en la nota {nota_activa['numero']}",
                    )
                if d.get("persona_id"):
                    personas.add(d["persona_id"])
                    personas_nombres.add(d.get("persona_nombre") or "")

            # Determinar proveedor de la nota
            proveedor_id = input.proveedor_id
            proveedor_nombre = input.proveedor_nombre
            if not proveedor_id and len(personas) == 1:
                proveedor_id = next(iter(personas))
                if not proveedor_nombre:
                    proveedor_nombre = next(iter(personas_nombres)) or "—"
            if not proveedor_nombre:
                # Si vienen mezclados sin nombre explícito, fallar para no perder info
                raise HTTPException(
                    status_code=400,
                    detail="Los envíos seleccionados son de varios proveedores; especifica proveedor_nombre",
                )

            # Crear cabecera
            nota_id = str(uuid.uuid4())
            numero = await _generar_numero_nota(conn)
            user_id = current_user.get("id") or current_user.get("user_id") or "sistema"
            user_name = _user_display_name(current_user)
            total_pzs = sum(safe_int(r["cantidad"]) for r in rows)
            empresa_id = current_user.get("empresa_id") or 7

            await conn.execute(
                """
                INSERT INTO produccion.prod_notas_cobro
                    (id, numero, fecha, proveedor_id, proveedor_nombre,
                     total_pzs, total_lotes, observacion, estado,
                     created_by_id, created_by_nombre, empresa_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'activa', $9, $10, $11)
                """,
                nota_id, numero, hoy, proveedor_id, proveedor_nombre,
                total_pzs, len(rows), (input.observacion or None),
                user_id, user_name, empresa_id,
            )

            # Crear detalles + marcar arreglos
            for r in rows:
                d = dict(r)
                dias_vencido = (hoy - d["fecha_limite"]).days if d.get("fecha_limite") else 0
                await conn.execute(
                    """
                    INSERT INTO produccion.prod_notas_cobro_lotes
                        (nota_id, arreglo_id, cantidad, dias_vencido)
                    VALUES ($1, $2, $3, $4)
                    """,
                    nota_id, d["id"], safe_int(d["cantidad"]), dias_vencido,
                )
                # Marcar si no estaba ya marcado
                if not d.get("marcado_para_cobro"):
                    await conn.execute(
                        """
                        UPDATE prod_registro_arreglos
                        SET marcado_para_cobro = TRUE,
                            marcado_por_usuario_id = $1,
                            marcado_por_nombre = $2,
                            fecha_marcado = $3,
                            motivo_marcado = $4
                        WHERE id = $5
                        """,
                        user_id, user_name,
                        datetime.now(timezone.utc).replace(tzinfo=None),
                        f"Nota {numero}",
                        d["id"],
                    )
                    # Audit
                    estado_previo = _snapshot_arreglo(d)
                    d["marcado_para_cobro"] = True
                    estado_nuevo = _snapshot_arreglo(d)
                    await conn.execute(
                        """
                        INSERT INTO prod_arreglos_audit
                            (arreglo_id, accion, usuario_id, usuario_nombre, motivo,
                             estado_previo, estado_nuevo)
                        VALUES ($1, 'marcar_cobro', $2, $3, $4, $5::jsonb, $6::jsonb)
                        """,
                        d["id"], user_id, user_name, f"Nota {numero}",
                        json.dumps(estado_previo), json.dumps(estado_nuevo),
                    )

            return {
                "id": nota_id,
                "numero": numero,
                "fecha": str(hoy),
                "proveedor_nombre": proveedor_nombre,
                "total_pzs": total_pzs,
                "total_lotes": len(rows),
                "estado": "activa",
            }


@router.get("/notas-cobro")
async def listar_notas_cobro(
    estado: Optional[str] = None,
    proveedor_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Lista notas de cobro emitidas. Filtros opcionales por estado/proveedor."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        where = []
        params = []
        if estado:
            params.append(estado)
            where.append(f"estado = ${len(params)}")
        if proveedor_id:
            params.append(proveedor_id)
            where.append(f"proveedor_id = ${len(params)}")
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        rows = await conn.fetch(
            f"""
            SELECT * FROM produccion.prod_notas_cobro
            {where_sql}
            ORDER BY fecha DESC, created_at DESC
            """,
            *params,
        )
        return [_nota_basic_dict(r) for r in rows]


@router.get("/notas-cobro/{nota_id}")
async def get_nota_cobro(
    nota_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Devuelve la nota con sus lotes."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        nota = await conn.fetchrow(
            "SELECT * FROM produccion.prod_notas_cobro WHERE id = $1",
            nota_id,
        )
        if not nota:
            raise HTTPException(status_code=404, detail="Nota no encontrada")
        lotes = await conn.fetch(
            """
            SELECT ncl.*, a.cantidad AS arreglo_cantidad, a.fecha_envio,
                   a.fecha_limite, r.n_corte, sp.nombre AS servicio_nombre,
                   pp.nombre AS persona_nombre,
                   COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') AS marca,
                   ln.nombre AS linea_negocio
            FROM produccion.prod_notas_cobro_lotes ncl
            JOIN prod_registro_arreglos a ON a.id = ncl.arreglo_id
            JOIN prod_registros r ON r.id = a.registro_id
            LEFT JOIN prod_servicios_produccion sp ON sp.id = a.servicio_id
            LEFT JOIN prod_personas_produccion pp ON pp.id = a.persona_id
            LEFT JOIN prod_modelos m ON m.id = r.modelo_id
            LEFT JOIN prod_marcas ma ON ma.id = m.marca_id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON ln.id = r.linea_negocio_id
            WHERE ncl.nota_id = $1
            ORDER BY ncl.id
            """,
            nota_id,
        )
        lotes_d = []
        for l in lotes:
            d = dict(l)
            for f in ("fecha_envio", "fecha_limite"):
                if d.get(f): d[f] = str(d[f])
            lotes_d.append(d)
        return {**_nota_basic_dict(nota), "lotes": lotes_d}


@router.post("/notas-cobro/{nota_id}/anular")
async def anular_nota_cobro(
    nota_id: str,
    input: NotaCobroAnular,
    current_user: dict = Depends(get_current_user),
):
    """Anula una nota de cobro: marca estado='anulada' y desmarca los
    arreglos vinculados (vuelven a estado vencido sin marca)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            nota = await conn.fetchrow(
                "SELECT * FROM produccion.prod_notas_cobro WHERE id = $1",
                nota_id,
            )
            if not nota:
                raise HTTPException(status_code=404, detail="Nota no encontrada")
            if nota["estado"] == "anulada":
                raise HTTPException(status_code=409, detail="La nota ya está anulada")

            user_id = current_user.get("id") or current_user.get("user_id") or "sistema"
            user_name = _user_display_name(current_user)
            now = datetime.now(timezone.utc).replace(tzinfo=None)

            await conn.execute(
                """
                UPDATE produccion.prod_notas_cobro
                SET estado = 'anulada',
                    anulada_at = $1, anulada_by_id = $2, anulada_by_nombre = $3,
                    motivo_anulacion = $4
                WHERE id = $5
                """,
                now, user_id, user_name, (input.motivo or None), nota_id,
            )

            # Desmarcar arreglos vinculados (registrar audit)
            lotes = await conn.fetch(
                "SELECT arreglo_id FROM produccion.prod_notas_cobro_lotes WHERE nota_id = $1",
                nota_id,
            )
            for l in lotes:
                arr_id = l["arreglo_id"]
                row = await conn.fetchrow(
                    "SELECT * FROM prod_registro_arreglos WHERE id = $1", arr_id,
                )
                if not row:
                    continue
                row_d = dict(row)
                row_d["estado"] = _calcular_estado_arreglo(row_d)
                estado_previo = _snapshot_arreglo(row_d)
                await conn.execute(
                    """
                    UPDATE prod_registro_arreglos
                    SET marcado_para_cobro = FALSE,
                        marcado_por_usuario_id = NULL,
                        marcado_por_nombre = NULL,
                        fecha_marcado = NULL,
                        motivo_marcado = NULL
                    WHERE id = $1
                    """,
                    arr_id,
                )
                row_new = dict(await conn.fetchrow(
                    "SELECT * FROM prod_registro_arreglos WHERE id = $1", arr_id,
                ))
                row_new["estado"] = _calcular_estado_arreglo(row_new)
                estado_nuevo = _snapshot_arreglo(row_new)
                await conn.execute(
                    """
                    INSERT INTO prod_arreglos_audit
                        (arreglo_id, accion, usuario_id, usuario_nombre, motivo,
                         estado_previo, estado_nuevo)
                    VALUES ($1, 'desmarcar_cobro', $2, $3, $4, $5::jsonb, $6::jsonb)
                    """,
                    arr_id, user_id, user_name,
                    f"Anulación nota {nota['numero']}",
                    json.dumps(estado_previo), json.dumps(estado_nuevo),
                )

            return {"message": "Nota anulada", "numero": nota["numero"]}


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

        # Fallados originales (sin origen_arreglo_id) — base para "normal".
        # `total_fallados` cuenta solo causa='servicio' (los que respaldan arreglos);
        # `total_fallados_originales` cuenta todos los originales (servicio + tela).
        total_fallados = await _get_total_fallados(conn, registro_id)
        total_fallados_originales = await _get_total_fallados_originales(conn, registro_id)

        # Cifras del flujo "De tela" (causa='tela'), por estado.
        tela_evaluando = safe_int(await conn.fetchval(
            """
            SELECT COALESCE(SUM(cantidad_detectada), 0) FROM prod_fallados
            WHERE registro_id = $1 AND causa = 'tela' AND estado_tela = 'EVALUANDO'
            """,
            registro_id,
        ))
        tela_recuperado = safe_int(await conn.fetchval(
            """
            SELECT COALESCE(SUM(cantidad_detectada), 0) FROM prod_fallados
            WHERE registro_id = $1 AND causa = 'tela' AND estado_tela = 'RECUPERADO'
            """,
            registro_id,
        ))
        tela_liquidado = safe_int(await conn.fetchval(
            """
            SELECT COALESCE(SUM(cantidad_detectada), 0) FROM prod_fallados
            WHERE registro_id = $1 AND causa = 'tela' AND estado_tela = 'LIQUIDADO'
            """,
            registro_id,
        ))

        # Arreglos V2 (envíos a servicio)
        arreglos_rows = await conn.fetch(
            """
            SELECT cantidad, cantidad_recuperada, cantidad_liquidacion,
                   cantidad_merma, COALESCE(cantidad_pasa_a_tela, 0) AS cantidad_pasa_a_tela,
                   estado, fecha_limite
            FROM prod_registro_arreglos WHERE registro_id = $1
            """,
            registro_id,
        )
        total_en_arreglo = sum(safe_int(a["cantidad"]) for a in arreglos_rows)
        total_recuperado = sum(safe_int(a["cantidad_recuperada"]) for a in arreglos_rows)
        total_liquidacion = sum(safe_int(a["cantidad_liquidacion"]) for a in arreglos_rows)
        total_merma_arreglos = sum(safe_int(a["cantidad_merma"]) for a in arreglos_rows)
        total_pasa_a_tela = sum(safe_int(a["cantidad_pasa_a_tela"]) for a in arreglos_rows)

        # Lo "resuelto" desde el lado del arreglo incluye también lo que pasó a tela
        # (esas prendas ya salieron del arreglo, ahora viven en el flujo tela).
        total_resuelto_arreglos = (
            total_recuperado + total_liquidacion + total_merma_arreglos + total_pasa_a_tela
        )
        # Fallados servicio aún sin asignar a un arreglo
        sin_enviar = total_fallados - total_en_arreglo
        # Arreglos enviados pero aún sin resolución completa
        en_arreglo_sin_resolver = total_en_arreglo - total_resuelto_arreglos

        # Compatibilidad: `fallado_pendiente` que la UI legacy usa.
        # = sin_enviar + en_arreglo_sin_resolver (las prendas servicio que aún
        # no tienen destino final), sin contar tela (eso se muestra aparte).
        fallado_pendiente = sin_enviar + en_arreglo_sin_resolver

        # Arreglos vencidos
        arreglos_vencidos = 0
        for a in arreglos_rows:
            estado = _calcular_estado_arreglo(dict(a))
            if estado == "VENCIDO":
                arreglos_vencidos += safe_int(a["cantidad"])

        # Normal = producido - todos los fallados originales - mermas directas - divididos
        normal = total_producido - total_fallados_originales - merma_total - total_hijos

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
        if tela_evaluando > 0:
            alertas.append({"tipo": "EVALUANDO", "mensaje": f"{tela_evaluando} prendas en evaluación de tela"})

        # Ecuación extendida:
        # buenas = normal + recuperado (servicio) + recuperado (tela)
        # perdidas = liquidacion_servicio (cobrado al proveedor) + liquidado_tela + merma
        # en_proceso = sin_enviar + en_arreglo_sin_resolver + tela_evaluando
        # total = buenas + perdidas + en_proceso + divididos
        merma_total_all = merma_total + total_merma_arreglos
        suma = (
            max(normal, 0)
            + total_recuperado + tela_recuperado
            + total_liquidacion + tela_liquidado
            + merma_total_all
            + max(sin_enviar, 0) + max(en_arreglo_sin_resolver, 0) + tela_evaluando
            + total_hijos
        )
        ecuacion_valida = suma == total_producido if total_producido > 0 else True

        return {
            "registro_id": registro_id,
            "n_corte": reg["n_corte"],
            "estado": reg["estado"],
            # Cifras principales
            "total_producido": total_producido,
            "normal": max(normal, 0),
            "total_fallados": total_fallados,                 # solo causa='servicio'
            "total_fallados_originales": total_fallados_originales,  # servicio + tela orig
            "fallado_pendiente": max(fallado_pendiente, 0),    # sin_enviar + en_arreglo_sin_resolver
            "recuperado": total_recuperado,                    # del flujo servicio
            "liquidacion": total_liquidacion,                  # cobrado al proveedor
            "merma": merma_total,
            "merma_arreglos": total_merma_arreglos,
            "divididos": total_hijos,
            # Detalle flujo de tela
            "tela_evaluando": tela_evaluando,
            "tela_recuperado": tela_recuperado,
            "tela_liquidado": tela_liquidado,
            # Arreglos detalle
            "arreglos_vencidos": arreglos_vencidos,
            "total_en_arreglo": total_en_arreglo,
            "total_pasa_a_tela": total_pasa_a_tela,
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
        # Incluye campos de marcaje/nota para que el frontend pueda agrupar
        # por proveedor y mostrar el estado de cobro (pendiente / en nota).
        arreglo_rows = await conn.fetch("""
            SELECT a.id as arreglo_id,
                   a.registro_id,
                   r.n_corte,
                   r.estado as estado_op,
                   r.linea_negocio_id,
                   COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') as modelo,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') as marca,
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
                   a.created_at,
                   COALESCE(a.marcado_para_cobro, FALSE) AS marcado_para_cobro,
                   a.marcado_por_nombre,
                   a.fecha_marcado,
                   a.motivo_marcado,
                   COALESCE(a.cobrado, FALSE) AS cobrado,
                   a.cobrado_por_nombre,
                   a.fecha_cobro,
                   a.tipo_comprobante,
                   a.numero_comprobante,
                   a.fecha_emision_comprobante,
                   a.observaciones_cobro,
                   -- Nota de cobro activa vinculada (si existe)
                   nca.id AS nota_id,
                   nca.numero AS nota_numero,
                   nca.fecha AS nota_fecha,
                   nca.estado AS nota_estado
            FROM prod_registro_arreglos a
            JOIN prod_registros r ON a.registro_id = r.id
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON r.linea_negocio_id = ln.id
            LEFT JOIN prod_servicios_produccion sp ON a.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON a.persona_id = pp.id
            LEFT JOIN LATERAL (
                SELECT n.id, n.numero, n.fecha, n.estado
                FROM produccion.prod_notas_cobro_lotes ncl
                JOIN produccion.prod_notas_cobro n ON n.id = ncl.nota_id
                WHERE ncl.arreglo_id = a.id AND n.estado = 'activa'
                ORDER BY n.created_at DESC
                LIMIT 1
            ) nca ON true
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
                   COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') as modelo,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') as marca,
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

            # Info de nota (si está en una activa)
            nota_obj = None
            if d.get("nota_id"):
                nota_obj = {
                    "id": d["nota_id"],
                    "numero": d.get("nota_numero"),
                    "fecha": str(d["nota_fecha"]) if d.get("nota_fecha") else None,
                    "estado": d.get("nota_estado"),
                }

            # Determinar estado_cobro (sin_marcar / marcado / cobrado)
            cobrado_flag = bool(d.get("cobrado") or False)
            marcado_flag = bool(d.get("marcado_para_cobro") or False)
            if cobrado_flag:
                estado_cobro = "cobrado"
            elif marcado_flag:
                estado_cobro = "marcado"
            else:
                estado_cobro = "sin_marcar"

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
                # Estado de cobro (sin_marcar / marcado / cobrado)
                "estado_cobro": estado_cobro,
                "marcado_para_cobro": marcado_flag,
                "marcado_por_nombre": d.get("marcado_por_nombre"),
                "fecha_marcado": str(d["fecha_marcado"]) if d.get("fecha_marcado") else None,
                "motivo_marcado": d.get("motivo_marcado"),
                "cobrado": cobrado_flag,
                "cobrado_por_nombre": d.get("cobrado_por_nombre"),
                "fecha_cobro": str(d["fecha_cobro"]) if d.get("fecha_cobro") else None,
                "tipo_comprobante": d.get("tipo_comprobante"),
                "numero_comprobante": d.get("numero_comprobante"),
                "fecha_emision_comprobante": str(d["fecha_emision_comprobante"]) if d.get("fecha_emision_comprobante") else None,
                "observaciones_cobro": d.get("observaciones_cobro"),
                "nota_cobro": nota_obj,
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


@router.get("/fallados-control/export")
async def fallados_control_export(
    current_user: dict = Depends(get_current_user),
):
    """Exporta los envíos a arreglo vencidos en 3 hojas:
       - Sin marcar
       - Marcados (pendientes de cobro)
       - Cobrados
    """
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl no disponible")

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT a.id AS arreglo_id, r.n_corte,
                   COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                   ln.nombre AS linea_negocio,
                   a.cantidad,
                   (a.cantidad - a.cantidad_recuperada - a.cantidad_liquidacion - a.cantidad_merma) AS pendiente,
                   sp.nombre AS servicio,
                   pp.nombre AS persona,
                   a.fecha_envio, a.fecha_limite,
                   COALESCE(a.marcado_para_cobro, FALSE) AS marcado,
                   a.marcado_por_nombre, a.fecha_marcado, a.motivo_marcado,
                   COALESCE(a.cobrado, FALSE) AS cobrado,
                   a.cobrado_por_nombre, a.fecha_cobro,
                   a.tipo_comprobante, a.numero_comprobante, a.fecha_emision_comprobante,
                   a.observaciones_cobro
            FROM prod_registro_arreglos a
            JOIN prod_registros r ON r.id = a.registro_id
            LEFT JOIN prod_modelos m ON m.id = r.modelo_id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON ln.id = r.linea_negocio_id
            LEFT JOIN prod_servicios_produccion sp ON sp.id = a.servicio_id
            LEFT JOIN prod_personas_produccion pp ON pp.id = a.persona_id
            WHERE a.fecha_limite < CURRENT_DATE
              AND (a.cantidad_recuperada + a.cantidad_liquidacion + a.cantidad_merma) < a.cantidad
            ORDER BY pp.nombre, a.fecha_limite
        """)

    hoy = date.today()
    sin_marcar, marcados, cobrados = [], [], []
    for r in rows:
        d = dict(r)
        if d.get("fecha_envio"):
            dias = max((hoy - d["fecha_envio"]).days, 0)
        else:
            dias = 0
        base = {
            "N°": d["n_corte"],
            "Modelo": d["modelo"] or d["linea_negocio"] or "",
            "Proveedor": d["persona"] or "",
            "Servicio": d["servicio"] or "",
            "Cantidad": int(d["cantidad"] or 0),
            "Pendiente": int(d["pendiente"] or 0),
            "Fecha envío": str(d["fecha_envio"]) if d["fecha_envio"] else "",
            "Fecha límite": str(d["fecha_limite"]) if d["fecha_limite"] else "",
            "Días vencido": dias,
        }
        if d["cobrado"]:
            cobrados.append({
                **base,
                "Cobrado por": d.get("cobrado_por_nombre") or "",
                "Fecha cobro": str(d["fecha_cobro"]) if d["fecha_cobro"] else "",
                "Tipo comprobante": d.get("tipo_comprobante") or "",
                "Número comprobante": d.get("numero_comprobante") or "",
                "Fecha emisión": str(d["fecha_emision_comprobante"]) if d["fecha_emision_comprobante"] else "",
                "Observaciones cobro": d.get("observaciones_cobro") or "",
            })
        elif d["marcado"]:
            marcados.append({
                **base,
                "Marcado por": d.get("marcado_por_nombre") or "",
                "Fecha marcado": str(d["fecha_marcado"]) if d["fecha_marcado"] else "",
                "Motivo": d.get("motivo_marcado") or "",
            })
        else:
            sin_marcar.append(base)

    wb = Workbook()
    wb.remove(wb.active)
    bold = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")

    def add_sheet(name, rows_dicts):
        ws = wb.create_sheet(name)
        if not rows_dicts:
            ws["A1"] = f"Sin {name.lower()}"
            return
        cols = list(rows_dicts[0].keys())
        for c, col in enumerate(cols, start=1):
            cell = ws.cell(row=1, column=c, value=col)
            cell.font = bold
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        for ri, row in enumerate(rows_dicts, start=2):
            for c, col in enumerate(cols, start=1):
                ws.cell(row=ri, column=c, value=row.get(col))
        for c, col in enumerate(cols, start=1):
            max_len = max([len(str(row.get(col) or "")) for row in rows_dicts] + [len(col)])
            ws.column_dimensions[ws.cell(row=1, column=c).column_letter].width = min(max_len + 2, 50)

    add_sheet("Sin marcar", sin_marcar)
    add_sheet("Marcados", marcados)
    add_sheet("Cobrados", cobrados)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"fallados_arreglos_{hoy.isoformat()}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
