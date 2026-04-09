"""
Routes para integración Producción ↔ Finanzas.
Prepara los ingresos de MP para ser leídos desde Finanzas
y muestra trazabilidad de facturación en Producción.

Bridge table: finanzas2.cont_factura_ingreso_mp
- factura_id -> cont_factura_proveedor.id
- ingreso_id -> prod_inventario_ingresos.id
- cantidad_aplicada -> qty vinculada a esa factura
"""
from fastapi import APIRouter, Query, Depends
from db import get_pool
from helpers import row_to_dict
from auth import get_current_user
from typing import Optional

router = APIRouter(prefix="/api", tags=["integracion-finanzas"])


@router.get("/proveedores")
async def get_proveedores(
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user)
):
    """Lista proveedores desde finanzas2.cont_tercero"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, nombre, nombre_comercial, tipo_documento, numero_documento
            FROM finanzas2.cont_tercero 
            WHERE es_proveedor = true AND empresa_id = $1
            ORDER BY nombre
        """, empresa_id)
        return [row_to_dict(r) for r in rows]


@router.get("/unidades-internas")
async def get_unidades_internas(current_user: dict = Depends(get_current_user)):
    """Lista unidades internas desde finanzas2.fin_unidad_interna"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, nombre, tipo FROM finanzas2.fin_unidad_interna ORDER BY nombre")
        return [row_to_dict(r) for r in rows]


@router.get("/ingresos-mp/para-finanzas")
async def get_ingresos_para_finanzas(
    empresa_id: int = Query(7),
    solo_pendientes: bool = Query(False),
    item_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Endpoint para que Finanzas lea ingresos de MP con estado de facturación.
    Retorna cada ingreso con:
    - datos del ingreso (id, articulo, fecha, cantidad, costo)
    - cantidad ya vinculada a facturas
    - saldo disponible para vincular
    - estado de facturación
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        where_clauses = ["i.empresa_id = $1"]
        params = [empresa_id]
        idx = 2

        if item_id:
            where_clauses.append(f"i.item_id = ${idx}")
            params.append(item_id)
            idx += 1

        where_sql = " AND ".join(where_clauses)

        rows = await conn.fetch(f"""
            SELECT 
                i.id as ingreso_id,
                i.item_id as articulo_id,
                inv.codigo as articulo_codigo,
                inv.nombre as articulo_nombre,
                inv.unidad_medida,
                inv.tipo_item,
                i.cantidad as cantidad_recibida,
                i.cantidad_disponible,
                i.costo_unitario,
                (COALESCE(i.cantidad, 0) * COALESCE(i.costo_unitario, 0)) as costo_total,
                i.proveedor,
                i.proveedor_id,
                i.numero_documento,
                i.observaciones,
                i.fecha as fecha_ingreso,
                i.empresa_id,
                i.fin_origen_tipo,
                i.fin_origen_id,
                i.fin_numero_doc,
                COALESCE((
                    SELECT SUM(fim.cantidad_aplicada) 
                    FROM finanzas2.cont_factura_ingreso_mp fim 
                    WHERE fim.ingreso_id = i.id
                ), 0) as qty_facturada
            FROM produccion.prod_inventario_ingresos i
            LEFT JOIN produccion.prod_inventario inv ON i.item_id = inv.id
            WHERE {where_sql}
            ORDER BY i.fecha DESC
        """, *params)

        result = []
        for r in rows:
            d = row_to_dict(r)
            qty_recibida = float(d.get('cantidad_recibida') or 0)
            qty_facturada = float(d.get('qty_facturada') or 0)
            qty_pendiente = max(0, qty_recibida - qty_facturada)

            if solo_pendientes and qty_pendiente <= 0:
                continue

            d['qty_facturada'] = round(qty_facturada, 4)
            d['qty_pendiente'] = round(qty_pendiente, 4)
            d['estado_facturacion'] = (
                'COMPLETO' if qty_recibida > 0 and qty_pendiente <= 0 else
                'PARCIAL' if qty_facturada > 0 else
                'PENDIENTE'
            )
            result.append(d)

        return {
            "total_ingresos": len(result),
            "ingresos": result
        }


@router.get("/ingresos-mp/{ingreso_id}/trazabilidad")
async def get_trazabilidad_ingreso(
    ingreso_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Trazabilidad de facturación de un ingreso específico.
    Lee desde finanzas2.cont_factura_ingreso_mp las vinculaciones existentes.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        ingreso = await conn.fetchrow("""
            SELECT i.*, inv.codigo as articulo_codigo, inv.nombre as articulo_nombre
            FROM produccion.prod_inventario_ingresos i
            LEFT JOIN produccion.prod_inventario inv ON i.item_id = inv.id
            WHERE i.id = $1
        """, ingreso_id)

        if not ingreso:
            return {"error": "Ingreso no encontrado"}

        d = row_to_dict(ingreso)
        qty_recibida = float(d.get('cantidad') or 0)

        # Vinculaciones desde Finanzas
        vinculaciones = await conn.fetch("""
            SELECT 
                fim.id,
                fim.factura_id,
                fim.factura_linea_id,
                fim.cantidad_aplicada,
                fim.created_at,
                fp.numero as factura_numero,
                fp.fecha_factura,
                fp.estado as factura_estado,
                t.nombre as proveedor_nombre
            FROM finanzas2.cont_factura_ingreso_mp fim
            JOIN finanzas2.cont_factura_proveedor fp ON fim.factura_id = fp.id
            LEFT JOIN finanzas2.cont_tercero t ON fp.proveedor_id = t.id
            WHERE fim.ingreso_id = $1
            ORDER BY fim.created_at
        """, ingreso_id)

        qty_facturada = sum(float(v['cantidad_aplicada'] or 0) for v in vinculaciones)
        qty_pendiente = max(0, qty_recibida - qty_facturada)

        return {
            "ingreso_id": ingreso_id,
            "articulo_codigo": d.get('articulo_codigo'),
            "articulo_nombre": d.get('articulo_nombre'),
            "cantidad_recibida": qty_recibida,
            "qty_facturada": round(qty_facturada, 4),
            "qty_pendiente": round(qty_pendiente, 4),
            "estado_facturacion": (
                'COMPLETO' if qty_recibida > 0 and qty_pendiente <= 0 else
                'PARCIAL' if qty_facturada > 0 else
                'PENDIENTE'
            ),
            "vinculaciones": [row_to_dict(v) for v in vinculaciones]
        }
