"""Router para Salidas Libres — salidas de inventario sin vincular a registro de producción."""
import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict
from routes.auditoria import audit_log_safe, get_usuario

router = APIRouter(prefix="/api")

TIPOS_SALIDA = ["MERMA", "MUESTRA", "DAÑO", "USO_INTERNO", "DEVOLUCION", "AJUSTE", "OTRO"]


class SalidaLibreCreate(BaseModel):
    item_id: str
    cantidad: float
    tipo_salida: str = "MERMA"
    motivo: Optional[str] = None
    destino: Optional[str] = None
    fecha: Optional[str] = None          # YYYY-MM-DD
    linea_negocio_id: Optional[int] = None
    observaciones: Optional[str] = None


# ─── helpers FIFO ────────────────────────────────────────────────────────────

async def _calcular_costo_fifo(conn, item_id: str, cantidad: float, modo_migracion: bool):
    """
    Calcula costo FIFO para la cantidad solicitada.
    Si modo_migracion=True, calcula el costo pero NO descuenta stock.
    Devuelve (costo_unitario, costo_total, detalle_fifo).
    """
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
        # Si no alcanzó stock, igual registramos con costo 0 para lo restante
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


# ─── endpoints ───────────────────────────────────────────────────────────────

@router.get("/salidas-libres")
async def list_salidas_libres(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tipo_salida: Optional[str] = None,
    item_id: Optional[str] = None,
    linea_negocio_id: Optional[int] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["1=1"]
        params: list = []
        idx = 1

        if tipo_salida:
            conditions.append(f"sl.tipo_salida = ${idx}")
            params.append(tipo_salida); idx += 1
        if item_id:
            conditions.append(f"sl.item_id = ${idx}")
            params.append(item_id); idx += 1
        if linea_negocio_id:
            conditions.append(f"sl.linea_negocio_id = ${idx}")
            params.append(linea_negocio_id); idx += 1
        if fecha_desde:
            conditions.append(f"sl.fecha >= ${idx}")
            params.append(fecha_desde); idx += 1
        if fecha_hasta:
            conditions.append(f"sl.fecha <= ${idx}")
            params.append(fecha_hasta); idx += 1

        where = " AND ".join(conditions)
        total_row = await conn.fetchrow(
            f"""SELECT COUNT(*) as total FROM prod_salidas_libres sl
                WHERE {where}""",
            *params,
        )
        total = total_row["total"] if total_row else 0

        rows = await conn.fetch(
            f"""SELECT sl.*, i.nombre as item_nombre, i.codigo as item_codigo,
                       i.unidad_medida,
                       ln.nombre as linea_negocio_nombre
                FROM prod_salidas_libres sl
                LEFT JOIN prod_inventario i ON sl.item_id = i.id
                LEFT JOIN finanzas2.cont_linea_negocio ln ON sl.linea_negocio_id = ln.id
                WHERE {where}
                ORDER BY sl.created_at DESC
                LIMIT ${idx} OFFSET ${idx+1}""",
            *params, limit, offset,
        )
        items = [row_to_dict(r) for r in rows]
        return {"items": items, "total": total}


@router.post("/salidas-libres")
async def crear_salida_libre(
    data: SalidaLibreCreate,
    current_user=Depends(get_current_user),
):
    if data.tipo_salida not in TIPOS_SALIDA:
        raise HTTPException(400, f"tipo_salida inválido. Válidos: {TIPOS_SALIDA}")
    if data.cantidad <= 0:
        raise HTTPException(400, "La cantidad debe ser mayor a 0")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar item existe
        item = await conn.fetchrow(
            "SELECT id, nombre, stock_actual FROM prod_inventario WHERE id=$1", data.item_id
        )
        if not item:
            raise HTTPException(404, "Item de inventario no encontrado")

        modo_mig = await _get_modo_migracion(conn)

        if not modo_mig and float(item["stock_actual"]) < data.cantidad:
            raise HTTPException(400, f"Stock insuficiente. Disponible: {item['stock_actual']}")

        costo_unitario, costo_total, detalle_fifo = await _calcular_costo_fifo(
            conn, data.item_id, data.cantidad, modo_mig
        )

        # Descontar stock del item (solo si no modo migración)
        if not modo_mig:
            await conn.execute(
                "UPDATE prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                data.cantidad, data.item_id,
            )

        import json
        sid = str(uuid.uuid4())
        fecha_val = data.fecha or date.today().isoformat()
        usuario = get_usuario(current_user)

        await conn.execute(
            """INSERT INTO prod_salidas_libres
               (id, fecha, item_id, cantidad, tipo_salida, motivo, destino,
                costo_unitario, costo_total, detalle_fifo,
                linea_negocio_id, usuario, observaciones, en_migracion)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)""",
            sid, fecha_val, data.item_id, data.cantidad,
            data.tipo_salida, data.motivo, data.destino,
            costo_unitario, costo_total, json.dumps(detalle_fifo),
            data.linea_negocio_id, usuario, data.observaciones, modo_mig,
        )

        row = await conn.fetchrow(
            """SELECT sl.*, i.nombre as item_nombre, i.codigo as item_codigo
               FROM prod_salidas_libres sl
               LEFT JOIN prod_inventario i ON sl.item_id = i.id
               WHERE sl.id=$1""", sid,
        )

        await audit_log_safe(
            conn, usuario, "INSERT", "produccion", "prod_salidas_libres",
            registro_id=sid, referencia=f"SL-{data.tipo_salida}-{item['nombre']}",
            datos_despues={"item_id": data.item_id, "cantidad": data.cantidad,
                           "tipo_salida": data.tipo_salida, "costo_total": costo_total},
        )

        return row_to_dict(row)


@router.delete("/salidas-libres/{salida_id}")
async def eliminar_salida_libre(
    salida_id: str,
    current_user=Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        salida = await conn.fetchrow(
            "SELECT * FROM prod_salidas_libres WHERE id=$1", salida_id
        )
        if not salida:
            raise HTTPException(404, "Salida no encontrada")

        # Restaurar stock si no fue en modo migración
        if not salida["en_migracion"]:
            await conn.execute(
                "UPDATE prod_inventario SET stock_actual = stock_actual + $1 WHERE id = $2",
                salida["cantidad"], salida["item_id"],
            )
            # Restaurar ingresos FIFO
            import json
            detalle = salida["detalle_fifo"]
            if isinstance(detalle, str):
                detalle = json.loads(detalle)
            if isinstance(detalle, list):
                for d in detalle:
                    if d.get("ingreso_id"):
                        await conn.execute(
                            "UPDATE prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible + $1 WHERE id = $2",
                            d["cantidad"], d["ingreso_id"],
                        )

        await conn.execute("DELETE FROM prod_salidas_libres WHERE id=$1", salida_id)

        usuario = get_usuario(current_user)
        await audit_log_safe(
            conn, usuario, "DELETE", "produccion", "prod_salidas_libres",
            registro_id=salida_id,
            datos_antes={"item_id": str(salida["item_id"]), "cantidad": float(salida["cantidad"])},
        )

        return {"ok": True}


@router.get("/salidas-libres/tipos")
async def get_tipos_salida():
    return {"tipos": TIPOS_SALIDA}
