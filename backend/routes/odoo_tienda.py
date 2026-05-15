"""
Integración Odoo — Tracking de tienda por corte.

Permite:
  1) Buscar productos en Odoo para asignarlos a un corte (selector
     autocomplete en el formulario del registro).
  2) Vincular un corte (prod_registros) con un producto de Odoo
     (odoo.product_product / product_template).
  3) Consultar info viva del producto: último movimiento a tienda
     (fecha de ingreso), stock vivo en cada tienda, ventas POS desde
     que llegó.
  4) Listar todos los cortes que ya entraron a alguna tienda
     ("Seguimiento Tienda").

Solo lee del schema `odoo`. Escribe en `produccion.prod_registros`
los campos creados por la migración 009 (odoo_product_id etc.).
"""
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from db import get_pool
from auth_utils import get_current_user


router = APIRouter(prefix="/api/odoo-tienda", tags=["Odoo Tienda"])


# ─── Modelos ─────────────────────────────────────────────────────────
class VincularProductoInput(BaseModel):
    odoo_product_id: int            # variant_id (product_product.odoo_id) — para barcode
    template_id: Optional[int] = None  # product_template.odoo_id — el cruce real usa este
    company_key: str = "GLOBAL"     # 'Ambission' / 'ProyectoModa' / 'GLOBAL'
    nombre: Optional[str] = None
    codigo: Optional[str] = None    # barcode o "TPL-{id}"


# ─── Búsqueda de productos ───────────────────────────────────────────
@router.get("/productos/buscar")
async def buscar_productos(
    q: Optional[str] = Query(None, description="Texto a buscar en nombre/marca/tipo"),
    marca: Optional[str] = None,
    tipo: Optional[str] = None,
    tela: Optional[str] = None,
    entalle: Optional[str] = None,
    limit: int = Query(30, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Busca templates Odoo activos. Devuelve los datos suficientes
    para mostrar en un autocomplete y luego vincularlo a un corte.

    Cada resultado incluye una variante representativa (product_product),
    porque el vínculo final va contra `product_product.odoo_id` (que es
    lo que aparece en `stock_move` y `stock_quant`).
    """
    where = ["pt.active = TRUE"]
    params: List = []

    if q and q.strip():
        params.append(f"%{q.strip()}%")
        idx = len(params)
        where.append(
            f"(pt.name ILIKE ${idx} OR pt.marca ILIKE ${idx} OR pt.tipo ILIKE ${idx})"
        )
    if marca:
        params.append(marca.strip())
        where.append(f"pt.marca ILIKE ${len(params)}")
    if tipo:
        params.append(tipo.strip())
        where.append(f"pt.tipo ILIKE ${len(params)}")
    if tela:
        params.append(tela.strip())
        where.append(f"pt.tela ILIKE ${len(params)}")
    if entalle:
        params.append(entalle.strip())
        where.append(f"pt.entalle ILIKE ${len(params)}")

    params.append(limit)
    sql = f"""
        WITH pp_resumen AS (
          SELECT pp.product_tmpl_id, pp.company_key,
                 MIN(pp.odoo_id) AS variant_id,
                 (ARRAY_AGG(pp.barcode ORDER BY pp.odoo_id))[1] AS variant_barcode,
                 COUNT(*) AS variantes_count
          FROM odoo.product_product pp
          WHERE pp.active = TRUE
          GROUP BY pp.product_tmpl_id, pp.company_key
        )
        SELECT
               COALESCE(ppr.company_key, pt.company_key) AS company_key,
               pt.odoo_id AS template_id, pt.name,
               pt.marca, pt.tipo, pt.tela, pt.entalle, pt.linea_negocio,
               pt.list_price,
               ppr.variant_id,
               ppr.variant_barcode,
               COALESCE(ppr.variantes_count, 0) AS variantes_count
        FROM odoo.product_template pt
        LEFT JOIN pp_resumen ppr ON ppr.product_tmpl_id = pt.odoo_id
        WHERE {' AND '.join(where)}
          AND ppr.variant_id IS NOT NULL
        ORDER BY pt.name
        LIMIT ${len(params)}
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    return [
        {
            "company_key": r["company_key"],
            "template_id": r["template_id"],
            "name": r["name"],
            "marca": r["marca"],
            "tipo": r["tipo"],
            "tela": r["tela"],
            "entalle": r["entalle"],
            "linea_negocio": r["linea_negocio"],
            "list_price": float(r["list_price"] or 0),
            "variant_id": r["variant_id"],
            "template_id": r["template_id"],
            "variant_barcode": r["variant_barcode"],
            "variantes_count": int(r["variantes_count"] or 0),
            # Codigo a guardar: barcode si existe, sino TPL-{id}
            "codigo": r["variant_barcode"] or f"TPL-{r['template_id']}",
            "display": (
                f"{r['name']} · {r['marca'] or '—'} · "
                f"{r['tela'] or '—'} {r['entalle'] or ''}"
            ).strip(),
        }
        for r in rows
    ]


# ─── Vincular producto a corte ───────────────────────────────────────
@router.post("/registros/{registro_id}/vincular-producto")
async def vincular_producto(
    registro_id: str,
    input: VincularProductoInput,
    current_user: dict = Depends(get_current_user),
):
    """Asigna un producto Odoo a un corte. Reemplaza si ya tenía uno."""
    if not input.odoo_product_id:
        raise HTTPException(400, "odoo_product_id es obligatorio")
    if input.company_key not in ("Ambission", "ProyectoModa", "GLOBAL"):
        raise HTTPException(400, "company_key inválido")

    user_name = (
        current_user.get("nombre_completo")
        or current_user.get("nombre")
        or current_user.get("username")
        or "sistema"
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar que el registro y el producto existen
        reg = await conn.fetchrow(
            "SELECT id FROM prod_registros WHERE id = $1", registro_id
        )
        if not reg:
            raise HTTPException(404, "Registro no encontrado")
        prod = await conn.fetchrow(
            """SELECT pp.odoo_id, pp.product_tmpl_id, pt.name
               FROM odoo.product_product pp
               JOIN odoo.product_template pt ON pt.odoo_id = pp.product_tmpl_id
               WHERE pp.odoo_id = $1 AND pp.active = TRUE
               LIMIT 1""",
            input.odoo_product_id,
        )
        if not prod:
            raise HTTPException(404, "Producto Odoo no encontrado o inactivo")

        template_id = input.template_id or prod["product_tmpl_id"]
        nombre = (input.nombre or prod["name"] or "").strip() or None
        codigo = (input.codigo or "").strip() or None

        await conn.execute(
            """UPDATE prod_registros
               SET odoo_product_id = $1,
                   odoo_template_id = $2,
                   odoo_product_company_key = $3,
                   odoo_product_nombre = $4,
                   odoo_product_codigo = $5,
                   odoo_product_asignado_at = $6,
                   odoo_product_asignado_por = $7
               WHERE id = $8""",
            input.odoo_product_id, template_id, input.company_key, nombre, codigo, now, user_name, registro_id,
        )
    return {
        "ok": True,
        "odoo_product_id": input.odoo_product_id,
        "company_key": input.company_key,
        "nombre": nombre,
        "codigo": codigo,
    }


@router.delete("/registros/{registro_id}/vincular-producto")
async def desvincular_producto(
    registro_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Limpia el vínculo a un producto Odoo."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        res = await conn.execute(
            """UPDATE prod_registros
               SET odoo_product_id = NULL,
                   odoo_template_id = NULL,
                   odoo_product_company_key = NULL,
                   odoo_product_nombre = NULL,
                   odoo_product_codigo = NULL,
                   odoo_product_asignado_at = NULL,
                   odoo_product_asignado_por = NULL
               WHERE id = $1""",
            registro_id,
        )
        if res.endswith("0"):
            raise HTTPException(404, "Registro no encontrado")
    return {"ok": True}


# ─── Info de tienda para un registro ─────────────────────────────────
@router.get("/registros/{registro_id}/tienda-info")
async def tienda_info(
    registro_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Devuelve la información viva de tienda para el corte:
       - movimientos a tienda (con fecha de ingreso por tienda)
       - stock_quant por tienda
       - ventas POS desde la fecha de ingreso por tienda
    Si el corte no tiene producto Odoo asignado, devuelve estructura vacía.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow(
            """SELECT id, n_corte, odoo_product_id, odoo_template_id,
                      odoo_product_company_key, odoo_product_nombre, odoo_product_codigo,
                      fecha_envio_tienda
               FROM prod_registros WHERE id = $1""",
            registro_id,
        )
        if not reg:
            raise HTTPException(404, "Registro no encontrado")
        if not reg["odoo_product_id"]:
            return {
                "vinculado": False,
                "tiendas": [],
                "stock_total": 0,
                "ventas_total": 0,
            }

        pid = reg["odoo_product_id"]
        tpl = reg["odoo_template_id"]

        # Movimientos done a ubicaciones internas que NO sean taller/fallados/virtuales,
        # agrupados por destino con la fecha del primero. Cruzamos por TEMPLATE para
        # agregar todas las variantes (tallas/colores) del mismo modelo.
        moves = await conn.fetch(
            """
            WITH variantes AS (
              SELECT odoo_id FROM odoo.product_product
              WHERE ($1::int IS NOT NULL AND product_tmpl_id = $1)
                 OR ($1::int IS NULL AND odoo_id = $2)
            )
            SELECT ld.odoo_id AS location_id,
                   COALESCE(NULLIF(ld.x_nombre, ''), ld.name) AS tienda,
                   MIN(sm.date) AS fecha_primer_ingreso,
                   MAX(sm.date) AS fecha_ultimo_ingreso,
                   SUM(sm.product_qty) AS total_ingresado,
                   COUNT(*) AS n_movs
            FROM odoo.stock_move sm
            JOIN variantes v ON v.odoo_id = sm.product_id
            JOIN odoo.stock_location ld
              ON ld.odoo_id = sm.location_dest_id
            WHERE sm.state = 'done'
              AND ld.usage = 'internal'
              AND COALESCE(ld.x_nombre, '') NOT ILIKE '%TALLER%'
              AND COALESCE(ld.x_nombre, '') NOT ILIKE '%Fallad%'
              AND COALESCE(ld.x_nombre, '') NOT ILIKE '%Ajuste%'
            GROUP BY ld.odoo_id, ld.x_nombre, ld.name
            ORDER BY fecha_primer_ingreso
            """,
            tpl, pid,
        )

        # Stock vivo por tienda (suma todas las variantes del template)
        quants = await conn.fetch(
            """
            WITH variantes AS (
              SELECT odoo_id FROM odoo.product_product
              WHERE ($1::int IS NOT NULL AND product_tmpl_id = $1)
                 OR ($1::int IS NULL AND odoo_id = $2)
            )
            SELECT sq.location_id, SUM(sq.qty) AS stock
            FROM odoo.stock_quant sq
            JOIN variantes v ON v.odoo_id = sq.product_id
            GROUP BY sq.location_id
            """,
            tpl, pid,
        )
        stock_map = {q["location_id"]: float(q["stock"] or 0) for q in quants}

        # Ventas POS por tienda desde la primera fecha de ingreso
        tiendas_out = []
        ventas_total = 0
        for m in moves:
            loc_id = m["location_id"]
            fecha_ingr = m["fecha_primer_ingreso"]
            # Por ahora contamos TODAS las ventas POS del producto desde la fecha de
            # primer ingreso a esa tienda. Refinar después uniendo por sucursal (pos_config).
            ventas = await conn.fetchval(
                """
                WITH variantes AS (
                  SELECT odoo_id FROM odoo.product_product
                  WHERE ($1::int IS NOT NULL AND product_tmpl_id = $1)
                     OR ($1::int IS NULL AND odoo_id = $2)
                )
                SELECT COALESCE(SUM(pl.qty), 0)
                FROM odoo.pos_order_line pl
                JOIN variantes v ON v.odoo_id = pl.product_id
                JOIN odoo.pos_order po
                  ON po.odoo_id = pl.order_id AND po.company_key = pl.company_key
                WHERE po.date_order >= $3
                """,
                tpl, pid, fecha_ingr,
            )
            ventas_int = int(ventas or 0)
            tiendas_out.append({
                "location_id": loc_id,
                "tienda": m["tienda"],
                "fecha_primer_ingreso": str(m["fecha_primer_ingreso"]) if m["fecha_primer_ingreso"] else None,
                "fecha_ultimo_ingreso": str(m["fecha_ultimo_ingreso"]) if m["fecha_ultimo_ingreso"] else None,
                "total_ingresado": int(m["total_ingresado"] or 0),
                "n_movs": int(m["n_movs"] or 0),
                "stock_actual": int(stock_map.get(loc_id, 0)),
                "ventas_desde_ingreso": ventas_int,  # Por ahora ventas globales del producto desde fecha
            })
            ventas_total += ventas_int

        # Stock total (suma de quants en TODAS las internal sin taller/fallad/ajuste)
        stock_total = int(sum(stock_map.values()))

        return {
            "vinculado": True,
            "odoo_product_id": pid,
            "company_key": reg["odoo_product_company_key"],
            "template_id": tpl,
            "producto_nombre": reg["odoo_product_nombre"],
            "producto_codigo": reg["odoo_product_codigo"],
            "tiendas": tiendas_out,
            "stock_total": stock_total,
            "ventas_total": ventas_total,
        }


# ─── Listado de cortes con tracking de tienda ────────────────────────
@router.get("/seguimiento")
async def seguimiento_tienda(
    solo_en_tienda: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """Lista todos los cortes con sus tiendas (último movimiento a cada
    tienda) y stock vivo. Útil para la pantalla "Seguimiento Tienda".

    `solo_en_tienda=true` excluye los cortes que aún no han llegado a
    ninguna tienda (lo más útil en el día a día).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH base AS (
              SELECT r.id, r.n_corte, r.estado, r.fecha_envio_tienda,
                     COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                     r.odoo_product_id, r.odoo_product_company_key,
                     r.odoo_product_nombre, r.odoo_product_codigo
              FROM prod_registros r
              LEFT JOIN prod_modelos m ON m.id = r.modelo_id
              WHERE r.odoo_product_id IS NOT NULL
            ),
            ingresos AS (
              SELECT b.id AS registro_id,
                     ld.odoo_id AS location_id,
                     COALESCE(NULLIF(ld.x_nombre, ''), ld.name) AS tienda,
                     MIN(sm.date) AS fecha_primer_ingreso,
                     SUM(sm.product_qty) AS total_ingresado
              FROM base b
              JOIN odoo.stock_move sm
                ON sm.product_id = b.odoo_product_id
               AND sm.state = 'done'
              JOIN odoo.stock_location ld
                ON ld.odoo_id = sm.location_dest_id
              WHERE ld.usage = 'internal'
                AND COALESCE(ld.x_nombre, '') NOT ILIKE '%TALLER%'
                AND COALESCE(ld.x_nombre, '') NOT ILIKE '%Fallad%'
              GROUP BY b.id, ld.odoo_id, ld.x_nombre, ld.name
            ),
            stocks AS (
              SELECT b.id AS registro_id, sq.location_id, SUM(sq.qty) AS stock
              FROM base b
              JOIN odoo.stock_quant sq
                ON sq.product_id = b.odoo_product_id
              GROUP BY b.id, sq.location_id
            )
            SELECT b.*,
                   i.location_id, i.tienda, i.fecha_primer_ingreso, i.total_ingresado,
                   COALESCE(s.stock, 0) AS stock_actual
            FROM base b
            LEFT JOIN ingresos i ON i.registro_id = b.id
            LEFT JOIN stocks s ON s.registro_id = b.id AND s.location_id = i.location_id
            ORDER BY b.n_corte, i.fecha_primer_ingreso
            """
        )

        # Agrupar por corte
        cortes = {}
        for r in rows:
            rid = r["id"]
            if rid not in cortes:
                cortes[rid] = {
                    "id": rid,
                    "n_corte": r["n_corte"],
                    "estado": r["estado"],
                    "modelo": r["modelo"],
                    "fecha_envio_tienda": str(r["fecha_envio_tienda"]) if r["fecha_envio_tienda"] else None,
                    "odoo_product_id": r["odoo_product_id"],
                    "odoo_product_nombre": r["odoo_product_nombre"],
                    "odoo_product_codigo": r["odoo_product_codigo"],
                    "tiendas": [],
                }
            if r["location_id"]:
                cortes[rid]["tiendas"].append({
                    "location_id": r["location_id"],
                    "tienda": r["tienda"],
                    "fecha_primer_ingreso": str(r["fecha_primer_ingreso"]) if r["fecha_primer_ingreso"] else None,
                    "total_ingresado": int(r["total_ingresado"] or 0),
                    "stock_actual": int(r["stock_actual"] or 0),
                })

        result = list(cortes.values())
        if solo_en_tienda:
            result = [c for c in result if c["tiendas"]]
        return result
