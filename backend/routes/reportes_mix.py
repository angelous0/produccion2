"""Reporte Mix: producción × stock × ventas por modelo y atributos.

Endpoint para la versión /prueba del frontend. Devuelve, por modelo, las
métricas clave (producido, stock vivo, vendido POS) cruzando:

    - ERP propio:  prod_modelos + prod_inventario + prod_inventario_ingresos
    - Odoo:        stock_quant (stock vivo) + pos_order_line (ventas POS)

Se reutilizan los patrones de routes/kardex_pt.py y routes/distribucion_pt.py
para el cruce con Odoo (solo PTs vinculados via prod_pt_odoo_templates).

Por ahora la agregación es a nivel MODELO. El desglose por color × talla
queda pendiente (requiere parsear prod_registros.distribucion_colores y
cruzar con product_product variantes de Odoo).
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query

from db import get_pool
from auth_utils import get_current_user

router = APIRouter(prefix="/api", tags=["reportes-mix"])


@router.get("/reportes-produccion/mix-pt")
async def reporte_mix_pt(
    desde: Optional[str] = Query(None, description="ISO YYYY-MM-DD. Default: hoy - 30 días."),
    hasta: Optional[str] = Query(None, description="ISO YYYY-MM-DD. Default: hoy."),
    dias_ventas: int = Query(30, ge=1, le=365, description="Ventana de ventas POS."),
    incluir_sin_modelo: bool = Query(False, description="Incluye PTs huérfanos (sin modelo)."),
    current_user: dict = Depends(get_current_user),
):
    """Devuelve la lista de modelos con métricas mix.

    Response:
        {
            "periodo": {"desde": "...", "hasta": "...", "dias_ventas": 30},
            "items": [
                {
                    "modelo_id": "...", "modelo_nombre": "...",
                    "pt_item_id": "..." | null,
                    "pt_codigo": "...", "pt_nombre": "...",
                    "marca": "...", "tipo": "...", "entalle": "...",
                    "tela": "...", "hilo": "...",
                    "vinculado_odoo": bool,
                    "producido": float,    # ingresos en periodo
                    "stock_vivo": float,   # stock_quant de templates vinculados
                    "vendido_pos": float,  # pos_order_line últimos dias_ventas
                    "costo_promedio_pt": float
                }
            ]
        }
    """
    hoy = date.today()
    fecha_hasta = date.fromisoformat(hasta) if hasta else hoy
    fecha_desde = date.fromisoformat(desde) if desde else (fecha_hasta - timedelta(days=30))

    pool = await get_pool()
    async with pool.acquire() as conn:

        # ─── 1) Modelos + atributos + PT principal asociado ─────────────────
        # Default: incluye TODOS los modelos (incluso los que no tienen PT
        # asociado a un corte). Así el reporte nunca devuelve lista vacía
        # cuando hay datos en el catálogo. Los modelos sin pt_item_id salen
        # con producido=0/stock=0/vendido=0 y vinculado_odoo=false.
        # Filtro estricto (solo con PT vinculado) cuando incluir_sin_modelo=False.
        modelos_rows = await conn.fetch("""
            WITH pt_por_modelo AS (
                SELECT DISTINCT ON (r.modelo_id)
                       r.modelo_id, r.pt_item_id
                  FROM prod_registros r
                 WHERE r.modelo_id IS NOT NULL AND r.pt_item_id IS NOT NULL
                 ORDER BY r.modelo_id, r.fecha_creacion DESC
            )
            SELECT m.id AS modelo_id,
                   m.nombre AS modelo_nombre,
                   ppm.pt_item_id,
                   pt.codigo AS pt_codigo,
                   pt.nombre AS pt_nombre,
                   COALESCE(pt.stock_actual, 0) AS pt_stock_actual,
                   COALESCE(pt.costo_promedio, 0) AS pt_costo_promedio,
                   ma.nombre AS marca_nombre,
                   t.nombre  AS tipo_nombre,
                   e.nombre  AS entalle_nombre,
                   te.nombre AS tela_nombre,
                   h.nombre  AS hilo_nombre
              FROM prod_modelos m
              LEFT JOIN pt_por_modelo ppm ON ppm.modelo_id = m.id
              LEFT JOIN prod_inventario pt ON pt.id = ppm.pt_item_id AND pt.tipo_item = 'PT'
              LEFT JOIN prod_marcas   ma ON ma.id = m.marca_id
              LEFT JOIN prod_tipos    t  ON t.id  = m.tipo_id
              LEFT JOIN prod_entalles e  ON e.id  = m.entalle_id
              LEFT JOIN prod_telas    te ON te.id = m.tela_id
              LEFT JOIN prod_hilos    h  ON h.id  = m.hilo_id
             ORDER BY m.nombre
        """)

        if not modelos_rows:
            return {
                "periodo": {
                    "desde": str(fecha_desde),
                    "hasta": str(fecha_hasta),
                    "dias_ventas": dias_ventas,
                },
                "items": [],
            }

        # ─── 2) Producido en periodo: SUM ingresos PT ───────────────────────
        pt_ids = [r["pt_item_id"] for r in modelos_rows if r["pt_item_id"]]

        producido_por_pt = {}
        if pt_ids:
            prod_rows = await conn.fetch("""
                SELECT item_id, COALESCE(SUM(cantidad), 0) AS producido
                  FROM prod_inventario_ingresos
                 WHERE item_id = ANY($1::varchar[])
                   AND fecha::date BETWEEN $2 AND $3
                 GROUP BY item_id
            """, pt_ids, fecha_desde, fecha_hasta)
            producido_por_pt = {r["item_id"]: float(r["producido"] or 0) for r in prod_rows}

        # ─── 3) Cross con Odoo: templates vinculados por PT ─────────────────
        # produccion.prod_pt_odoo_templates(pt_item_id, odoo_template_id, tipo_salida)
        # Para esta versión, contamos templates de tipo_salida='normal' (no liq).
        templates_por_pt = {}
        all_template_ids = []
        if pt_ids:
            tpl_rows = await conn.fetch("""
                SELECT pt_item_id, odoo_template_id, tipo_salida
                  FROM produccion.prod_pt_odoo_templates
                 WHERE pt_item_id = ANY($1::varchar[])
                   AND tipo_salida = 'normal'
            """, pt_ids)
            for r in tpl_rows:
                templates_por_pt.setdefault(r["pt_item_id"], []).append(r["odoo_template_id"])
                all_template_ids.append(r["odoo_template_id"])

        # ─── 4) Stock vivo Odoo (sumando variantes) por template ────────────
        stock_por_template = {}
        if all_template_ids:
            stock_rows = await conn.fetch("""
                WITH variantes AS (
                    SELECT pp.odoo_id, pp.product_tmpl_id
                      FROM odoo.product_product pp
                     WHERE pp.product_tmpl_id = ANY($1::int[])
                )
                SELECT v.product_tmpl_id AS template_id,
                       COALESCE(SUM(sq.qty), 0) AS stock_total
                  FROM variantes v
                  JOIN odoo.stock_quant sq ON sq.product_id = v.odoo_id
                  JOIN odoo.stock_location sl ON sl.odoo_id = sq.location_id
                 WHERE sl.usage = 'internal'
                 GROUP BY v.product_tmpl_id
            """, all_template_ids)
            stock_por_template = {r["template_id"]: float(r["stock_total"] or 0) for r in stock_rows}

        # ─── 5) Vendido POS últimos N días por template ─────────────────────
        vendido_por_template = {}
        if all_template_ids:
            venta_rows = await conn.fetch("""
                WITH variantes AS (
                    SELECT pp.odoo_id, pp.product_tmpl_id
                      FROM odoo.product_product pp
                     WHERE pp.product_tmpl_id = ANY($1::int[])
                )
                SELECT v.product_tmpl_id AS template_id,
                       COALESCE(SUM(pl.qty), 0) AS vendido_total
                  FROM variantes v
                  JOIN odoo.pos_order_line pl ON pl.product_id = v.odoo_id
                  JOIN odoo.pos_order po ON po.odoo_id = pl.order_id
                                         AND po.company_key = pl.company_key
                 WHERE po.date_order >= NOW() - ($2 || ' days')::INTERVAL
                 GROUP BY v.product_tmpl_id
            """, all_template_ids, str(dias_ventas))
            vendido_por_template = {r["template_id"]: float(r["vendido_total"] or 0) for r in venta_rows}

        # ─── 6) Armar respuesta ─────────────────────────────────────────────
        items = []
        for r in modelos_rows:
            pt_id = r["pt_item_id"]
            tpl_ids = templates_por_pt.get(pt_id, []) if pt_id else []
            stock_vivo = sum(stock_por_template.get(t, 0) for t in tpl_ids)
            vendido_pos = sum(vendido_por_template.get(t, 0) for t in tpl_ids)
            items.append({
                "modelo_id": r["modelo_id"],
                "modelo_nombre": r["modelo_nombre"],
                "pt_item_id": pt_id,
                "pt_codigo": r["pt_codigo"],
                "pt_nombre": r["pt_nombre"],
                "marca": r["marca_nombre"] or "—",
                "tipo": r["tipo_nombre"] or "—",
                "entalle": r["entalle_nombre"] or "—",
                "tela": r["tela_nombre"] or "—",
                "hilo": r["hilo_nombre"] or "—",
                "vinculado_odoo": len(tpl_ids) > 0,
                "n_templates": len(tpl_ids),
                "producido": producido_por_pt.get(pt_id, 0) if pt_id else 0,
                "stock_vivo": stock_vivo,
                "vendido_pos": vendido_pos,
                "costo_promedio_pt": float(r["pt_costo_promedio"] or 0),
            })

        return {
            "periodo": {
                "desde": str(fecha_desde),
                "hasta": str(fecha_hasta),
                "dias_ventas": dias_ventas,
            },
            "items": items,
        }
