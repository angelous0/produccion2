"""Router para Módulo de Muestras — gestión de muestras enviadas a clientes."""
import uuid
import json
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict, parse_jsonb
from routes.auditoria import audit_log_safe, get_usuario

router = APIRouter(prefix="/api")

ESTADOS_MUESTRA = ["PENDIENTE", "EN_REVISION", "APROBADA", "RECHAZADA", "CANCELADA"]


class MaterialMuestraIn(BaseModel):
    item_id: str
    cantidad: float
    observaciones: Optional[str] = None


class MuestraCreate(BaseModel):
    cliente: str
    fecha_envio: Optional[str] = None       # YYYY-MM-DD
    modelo_id: Optional[str] = None
    modelo_nombre: Optional[str] = None
    linea_negocio_id: Optional[int] = None
    observaciones: Optional[str] = None
    materiales: List[MaterialMuestraIn] = []


class MuestraEstadoUpdate(BaseModel):
    estado: str
    comentario: Optional[str] = None


# ─── helpers FIFO (igual que salidas libres) ──────────────────────────────────

async def _calcular_costo_fifo(conn, item_id: str, cantidad: float, modo_migracion: bool):
    ingresos = await conn.fetch(
        """SELECT id, cantidad_disponible, costo_unitario
           FROM prod_inventario_ingresos
           WHERE item_id = $1 AND cantidad_disponible > 0
           ORDER BY fecha ASC, id ASC""",
        item_id,
    )
    detalle_fifo = []
    pendiente = float(cantidad)
    costo_total = 0.0

    for ing in ingresos:
        if pendiente <= 0:
            break
        disponible = float(ing["cantidad_disponible"])
        cu = float(ing["costo_unitario"] or 0)
        usar = min(disponible, pendiente)
        costo_total += usar * cu
        detalle_fifo.append(
            {"ingreso_id": str(ing["id"]), "cantidad": usar, "costo_unitario": cu}
        )
        pendiente -= usar
        if not modo_migracion:
            nueva_disp = disponible - usar
            await conn.execute(
                "UPDATE prod_inventario_ingresos SET cantidad_disponible=$1 WHERE id=$2",
                nueva_disp, ing["id"],
            )

    if pendiente > 0 and not modo_migracion:
        detalle_fifo.append(
            {"ingreso_id": None, "cantidad": pendiente, "costo_unitario": 0, "sin_stock": True}
        )

    costo_unitario = costo_total / float(cantidad) if cantidad else 0
    return costo_unitario, costo_total, detalle_fifo


async def _get_modo_migracion(conn) -> bool:
    row = await conn.fetchrow(
        "SELECT valor FROM prod_configuracion WHERE clave='modo_migracion'"
    )
    if row:
        return row["valor"].strip().lower() == "true"
    return False


async def _gen_codigo_muestra(conn) -> str:
    count = await conn.fetchval("SELECT COUNT(*) FROM prod_muestras")
    return f"MST-{str((count or 0) + 1).zfill(4)}"


# ─── endpoints ───────────────────────────────────────────────────────────────

@router.get("/muestras")
async def list_muestras(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    estado: Optional[str] = None,
    cliente: Optional[str] = None,
    linea_negocio_id: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["1=1"]
        params: list = []
        idx = 1

        if estado:
            conditions.append(f"m.estado = ${idx}"); params.append(estado); idx += 1
        if cliente:
            conditions.append(f"m.cliente ILIKE ${idx}"); params.append(f"%{cliente}%"); idx += 1
        if linea_negocio_id:
            conditions.append(f"m.linea_negocio_id = ${idx}"); params.append(linea_negocio_id); idx += 1

        where = " AND ".join(conditions)
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM prod_muestras m WHERE {where}", *params
        )
        rows = await conn.fetch(
            f"""SELECT m.*,
                       COALESCE(
                           (SELECT SUM(mm.costo_total)
                            FROM prod_muestras_materiales mm WHERE mm.muestra_id = m.id),
                           0
                       ) as costo_calculado,
                       (SELECT COUNT(*) FROM prod_muestras_materiales mm WHERE mm.muestra_id = m.id) as num_materiales,
                       ln.nombre as linea_negocio_nombre
                FROM prod_muestras m
                LEFT JOIN finanzas2.cont_linea_negocio ln ON m.linea_negocio_id = ln.id
                WHERE {where}
                ORDER BY m.created_at DESC
                LIMIT ${idx} OFFSET ${idx+1}""",
            *params, limit, offset,
        )
        return {"items": [row_to_dict(r) for r in rows], "total": total}


@router.get("/muestras/{muestra_id}")
async def get_muestra(muestra_id: str, _current_user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT m.*, ln.nombre as linea_negocio_nombre
               FROM prod_muestras m
               LEFT JOIN finanzas2.cont_linea_negocio ln ON m.linea_negocio_id = ln.id
               WHERE m.id=$1""", muestra_id,
        )
        if not row:
            raise HTTPException(404, "Muestra no encontrada")

        materiales = await conn.fetch(
            """SELECT mm.*, i.nombre as item_nombre, i.codigo as item_codigo, i.unidad_medida
               FROM prod_muestras_materiales mm
               LEFT JOIN prod_inventario i ON mm.item_id = i.id
               WHERE mm.muestra_id=$1
               ORDER BY mm.created_at ASC""", muestra_id,
        )
        historial = await conn.fetch(
            """SELECT * FROM prod_muestras_historial_estado
               WHERE muestra_id=$1 ORDER BY fecha DESC""", muestra_id,
        )
        result = row_to_dict(row)
        result["materiales"] = [row_to_dict(m) for m in materiales]
        result["historial"] = [row_to_dict(h) for h in historial]
        return result


@router.post("/muestras")
async def crear_muestra(data: MuestraCreate, current_user=Depends(get_current_user)):
    if not data.cliente.strip():
        raise HTTPException(400, "El campo cliente es obligatorio")

    pool = await get_pool()
    async with pool.acquire() as conn:
        modo_mig = await _get_modo_migracion(conn)
        usuario = get_usuario(current_user)
        mid = str(uuid.uuid4())
        codigo = await _gen_codigo_muestra(conn)
        fecha_val = data.fecha_envio or date.today().isoformat()

        # Verificar items disponibles
        for mat in data.materiales:
            item = await conn.fetchrow(
                "SELECT id, nombre, stock_actual FROM prod_inventario WHERE id=$1", mat.item_id
            )
            if not item:
                raise HTTPException(404, f"Item {mat.item_id} no encontrado")
            if not modo_mig and float(item["stock_actual"]) < mat.cantidad:
                raise HTTPException(
                    400, f"Stock insuficiente para '{item['nombre']}'. Disponible: {item['stock_actual']}"
                )

        await conn.execute(
            """INSERT INTO prod_muestras
               (id, codigo, cliente, fecha_envio, modelo_id, modelo_nombre,
                linea_negocio_id, estado, observaciones, usuario_creador)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDIENTE',$8,$9)""",
            mid, codigo, data.cliente.strip(), fecha_val,
            data.modelo_id, data.modelo_nombre,
            data.linea_negocio_id, data.observaciones, usuario,
        )

        # Registrar historial inicial
        await conn.execute(
            """INSERT INTO prod_muestras_historial_estado
               (id, muestra_id, estado_anterior, estado_nuevo, usuario, comentario)
               VALUES ($1,$2,NULL,'PENDIENTE',$3,'Muestra creada')""",
            str(uuid.uuid4()), mid, usuario,
        )

        # Procesar materiales con FIFO
        costo_total_muestra = 0.0
        for mat in data.materiales:
            cu, ct, detalle = await _calcular_costo_fifo(conn, mat.item_id, mat.cantidad, modo_mig)
            if not modo_mig:
                await conn.execute(
                    "UPDATE prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                    mat.cantidad, mat.item_id,
                )
            costo_total_muestra += ct
            await conn.execute(
                """INSERT INTO prod_muestras_materiales
                   (id, muestra_id, item_id, cantidad, costo_unitario, costo_total, detalle_fifo, en_migracion, observaciones)
                   VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)""",
                str(uuid.uuid4()), mid, mat.item_id, mat.cantidad,
                cu, ct, json.dumps(detalle), modo_mig, mat.observaciones,
            )

        await conn.execute(
            "UPDATE prod_muestras SET costo_total=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2",
            costo_total_muestra, mid,
        )

        await audit_log_safe(
            conn, usuario, "INSERT", "produccion", "prod_muestras",
            registro_id=mid, referencia=codigo,
            datos_despues={"cliente": data.cliente, "codigo": codigo},
        )

        return await get_muestra(mid)


@router.put("/muestras/{muestra_id}/estado")
async def cambiar_estado_muestra(
    muestra_id: str,
    data: MuestraEstadoUpdate,
    current_user=Depends(get_current_user),
):
    if data.estado not in ESTADOS_MUESTRA:
        raise HTTPException(400, f"Estado inválido. Válidos: {ESTADOS_MUESTRA}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        muestra = await conn.fetchrow("SELECT * FROM prod_muestras WHERE id=$1", muestra_id)
        if not muestra:
            raise HTTPException(404, "Muestra no encontrada")

        estado_anterior = muestra["estado"]
        usuario = get_usuario(current_user)

        await conn.execute(
            "UPDATE prod_muestras SET estado=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2",
            data.estado, muestra_id,
        )
        await conn.execute(
            """INSERT INTO prod_muestras_historial_estado
               (id, muestra_id, estado_anterior, estado_nuevo, usuario, comentario)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            str(uuid.uuid4()), muestra_id, estado_anterior, data.estado, usuario, data.comentario,
        )

        await audit_log_safe(
            conn, usuario, "UPDATE", "produccion", "prod_muestras",
            registro_id=muestra_id, referencia=muestra["codigo"],
            datos_antes={"estado": estado_anterior},
            datos_despues={"estado": data.estado},
        )

        return {"ok": True, "estado": data.estado}


@router.delete("/muestras/{muestra_id}")
async def eliminar_muestra(muestra_id: str, _current_user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        muestra = await conn.fetchrow("SELECT * FROM prod_muestras WHERE id=$1", muestra_id)
        if not muestra:
            raise HTTPException(404, "Muestra no encontrada")

        # Restaurar stock de materiales
        materiales = await conn.fetch(
            "SELECT * FROM prod_muestras_materiales WHERE muestra_id=$1", muestra_id
        )
        for mat in materiales:
            if not mat["en_migracion"]:
                await conn.execute(
                    "UPDATE prod_inventario SET stock_actual = stock_actual + $1 WHERE id = $2",
                    mat["cantidad"], mat["item_id"],
                )
                detalle = parse_jsonb(mat["detalle_fifo"])
                for d in (detalle if isinstance(detalle, list) else []):
                    if d.get("ingreso_id"):
                        await conn.execute(
                            "UPDATE prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible + $1 WHERE id = $2",
                            d["cantidad"], d["ingreso_id"],
                        )

        await conn.execute("DELETE FROM prod_muestras_materiales WHERE muestra_id=$1", muestra_id)
        await conn.execute("DELETE FROM prod_muestras_historial_estado WHERE muestra_id=$1", muestra_id)
        await conn.execute("DELETE FROM prod_muestras WHERE id=$1", muestra_id)

        usuario = get_usuario(_current_user)
        await audit_log_safe(
            conn, usuario, "DELETE", "produccion", "prod_muestras",
            registro_id=muestra_id, referencia=muestra["codigo"],
            datos_antes={"cliente": muestra["cliente"], "estado": muestra["estado"]},
        )
        return {"ok": True}
