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


# ─── Helpers de tiendas comerciales ──────────────────────────────────
# CTE reutilizable: locations que SI cuentan como "tienda comercial".
# Excluye AP, TALLER, REMATE, FALLADOS, AJUSTES — todo lo configurado
# en produccion.prod_tiendas_comerciales con activo=TRUE.
TIENDAS_CTE = """
    tiendas AS (
      SELECT tc.odoo_location_id AS location_id,
             COALESCE(NULLIF(tc.alias_grupo, ''), tc.nombre) AS nombre_grupo
      FROM produccion.prod_tiendas_comerciales tc
      WHERE tc.activo = TRUE
    )
"""


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
            # Codigo a guardar: template_id como referencia estable.
            # El barcode queda disponible en variant_barcode si se necesita.
            "codigo": str(r["template_id"]),
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
    """Devuelve la información viva de tienda para el corte.

    Toma como "producto principal" el / los template_id_odoo que están
    asignados al corte con tipo_salida='normal' en
    produccion.prod_registro_pt_relacion. Los tipos 'liquidacion_*' se
    excluyen del tracking principal (van a outlet/saldos).

    Cruza con stock_move (movimientos a tienda), stock_quant (stock
    vivo) y pos_order_line (ventas POS desde la fecha de primer
    ingreso). Filtra solo tiendas comerciales configuradas en
    prod_tiendas_comerciales.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow(
            """SELECT id, n_corte, estado, fecha_envio_tienda, fecha_envio_tienda_auto
               FROM prod_registros WHERE id = $1""",
            registro_id,
        )
        if not reg:
            raise HTTPException(404, "Registro no encontrado")

        # Templates con tipo_salida='normal' en la distribución PT
        templates = await conn.fetch(
            """SELECT rel.product_template_id_odoo AS template_id,
                      pt.name, pt.marca, pt.tipo, pt.tela, pt.entalle,
                      SUM(rel.cantidad) AS cantidad_distribuida
               FROM produccion.prod_registro_pt_relacion rel
               LEFT JOIN odoo.product_template pt ON pt.odoo_id = rel.product_template_id_odoo
               WHERE rel.registro_id = $1 AND rel.tipo_salida = 'normal'
               GROUP BY rel.product_template_id_odoo, pt.name, pt.marca, pt.tipo, pt.tela, pt.entalle
               ORDER BY cantidad_distribuida DESC""",
            registro_id,
        )
        if not templates:
            return {
                "vinculado": False,
                "tiendas": [],
                "stock_total": 0,
                "ventas_total": 0,
                "producto_principal": None,
                "fecha_envio_tienda": str(reg["fecha_envio_tienda"]) if reg["fecha_envio_tienda"] else None,
                "fecha_envio_tienda_auto": bool(reg["fecha_envio_tienda_auto"]),
                "estado": reg["estado"],
            }

        template_ids = [t["template_id"] for t in templates]
        # Producto principal = el de mayor cantidad distribuida normal
        principal = templates[0]

        # Movimientos done a tiendas comerciales (excluye AP/TALLER/REMATE/Fallados/Ajustes).
        # Suma TODAS las variantes (talla/color) de TODOS los templates 'normal'.
        moves = await conn.fetch(
            f"""
            WITH variantes AS (
              SELECT pp.odoo_id FROM odoo.product_product pp
              WHERE pp.product_tmpl_id = ANY($1::int[])
            ), {TIENDAS_CTE}
            SELECT t.nombre_grupo AS tienda,
                   MIN(t.location_id) AS location_id,
                   MIN(sm.date) AS fecha_primer_ingreso,
                   MAX(sm.date) AS fecha_ultimo_ingreso,
                   SUM(sm.product_qty) AS total_ingresado,
                   COUNT(*) AS n_movs
            FROM odoo.stock_move sm
            JOIN variantes v ON v.odoo_id = sm.product_id
            JOIN tiendas t ON t.location_id = sm.location_dest_id
            WHERE sm.state = 'done'
            GROUP BY t.nombre_grupo
            ORDER BY fecha_primer_ingreso
            """,
            template_ids,
        )

        # Stock vivo por tienda (suma variantes + agrupa por alias)
        quants = await conn.fetch(
            f"""
            WITH variantes AS (
              SELECT pp.odoo_id FROM odoo.product_product pp
              WHERE pp.product_tmpl_id = ANY($1::int[])
            ), {TIENDAS_CTE}
            SELECT t.nombre_grupo AS tienda, SUM(sq.qty) AS stock
            FROM odoo.stock_quant sq
            JOIN variantes v ON v.odoo_id = sq.product_id
            JOIN tiendas t ON t.location_id = sq.location_id
            GROUP BY t.nombre_grupo
            """,
            template_ids,
        )
        stock_map = {q["tienda"]: float(q["stock"] or 0) for q in quants}

        # Ventas POS por tienda desde la primera fecha de ingreso
        # (atajo: hoy son ventas globales del producto desde la fecha de
        # ingreso a CADA tienda, no por sucursal POS)
        tiendas_out = []
        ventas_total = 0
        for m in moves:
            nombre_t = m["tienda"]
            fecha_ingr = m["fecha_primer_ingreso"]
            ventas = await conn.fetchval(
                """
                WITH variantes AS (
                  SELECT pp.odoo_id FROM odoo.product_product pp
                  WHERE pp.product_tmpl_id = ANY($1::int[])
                )
                SELECT COALESCE(SUM(pl.qty), 0)
                FROM odoo.pos_order_line pl
                JOIN variantes v ON v.odoo_id = pl.product_id
                JOIN odoo.pos_order po
                  ON po.odoo_id = pl.order_id AND po.company_key = pl.company_key
                WHERE po.date_order >= $2
                """,
                template_ids, fecha_ingr,
            )
            ventas_int = int(ventas or 0)
            tiendas_out.append({
                "location_id": m["location_id"],
                "tienda": nombre_t,
                "fecha_primer_ingreso": str(m["fecha_primer_ingreso"]) if m["fecha_primer_ingreso"] else None,
                "fecha_ultimo_ingreso": str(m["fecha_ultimo_ingreso"]) if m["fecha_ultimo_ingreso"] else None,
                "total_ingresado": int(m["total_ingresado"] or 0),
                "n_movs": int(m["n_movs"] or 0),
                "stock_actual": int(stock_map.get(nombre_t, 0)),
                "ventas_desde_ingreso": ventas_int,
            })
            ventas_total += ventas_int

        stock_total = int(sum(stock_map.values()))

        return {
            "vinculado": True,
            "template_ids": template_ids,
            "producto_principal": {
                "template_id": principal["template_id"],
                "name": principal["name"],
                "marca": principal["marca"],
                "tela": principal["tela"],
                "entalle": principal["entalle"],
                "cantidad_distribuida": int(principal["cantidad_distribuida"] or 0),
            },
            "tiendas": tiendas_out,
            "stock_total": stock_total,
            "ventas_total": ventas_total,
            "fecha_envio_tienda": str(reg["fecha_envio_tienda"]) if reg["fecha_envio_tienda"] else None,
            "fecha_envio_tienda_auto": bool(reg["fecha_envio_tienda_auto"]),
            "estado": reg["estado"],
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
              SELECT r.id, r.n_corte, r.estado,
                     r.fecha_envio_tienda, r.fecha_envio_tienda_auto,
                     COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo
              FROM prod_registros r
              LEFT JOIN prod_modelos m ON m.id = r.modelo_id
              WHERE EXISTS (
                SELECT 1 FROM produccion.prod_registro_pt_relacion rel
                WHERE rel.registro_id = r.id AND rel.tipo_salida = 'normal'
              )
            ),
            tiendas AS (
              SELECT tc.odoo_location_id AS location_id,
                     COALESCE(NULLIF(tc.alias_grupo, ''), tc.nombre) AS nombre_grupo
              FROM produccion.prod_tiendas_comerciales tc
              WHERE tc.activo = TRUE
            ),
            distrib AS (
              -- Producto "principal" del corte: el de mayor cantidad con tipo_salida=normal
              SELECT DISTINCT ON (rel.registro_id)
                     rel.registro_id, rel.product_template_id_odoo AS template_id, pt.name AS producto_nombre
              FROM produccion.prod_registro_pt_relacion rel
              LEFT JOIN odoo.product_template pt ON pt.odoo_id = rel.product_template_id_odoo
              WHERE rel.tipo_salida = 'normal'
              ORDER BY rel.registro_id, rel.cantidad DESC
            ),
            variantes AS (
              SELECT rel.registro_id, pp.odoo_id AS variant_id
              FROM produccion.prod_registro_pt_relacion rel
              JOIN odoo.product_product pp ON pp.product_tmpl_id = rel.product_template_id_odoo
              WHERE rel.tipo_salida = 'normal'
            ),
            ingresos AS (
              SELECT v.registro_id,
                     t.nombre_grupo AS tienda,
                     MIN(sm.date) AS fecha_primer_ingreso,
                     SUM(sm.product_qty) AS total_ingresado
              FROM variantes v
              JOIN odoo.stock_move sm
                ON sm.product_id = v.variant_id AND sm.state = 'done'
              JOIN tiendas t ON t.location_id = sm.location_dest_id
              GROUP BY v.registro_id, t.nombre_grupo
            ),
            stocks AS (
              SELECT v.registro_id, t.nombre_grupo AS tienda, SUM(sq.qty) AS stock
              FROM variantes v
              JOIN odoo.stock_quant sq ON sq.product_id = v.variant_id
              JOIN tiendas t ON t.location_id = sq.location_id
              GROUP BY v.registro_id, t.nombre_grupo
            )
            SELECT b.*,
                   d.template_id, d.producto_nombre,
                   i.tienda, i.fecha_primer_ingreso, i.total_ingresado,
                   COALESCE(s.stock, 0) AS stock_actual
            FROM base b
            LEFT JOIN distrib d ON d.registro_id = b.id
            LEFT JOIN ingresos i ON i.registro_id = b.id
            LEFT JOIN stocks s ON s.registro_id = b.id AND s.tienda = i.tienda
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
                    "fecha_envio_tienda_auto": bool(r["fecha_envio_tienda_auto"]),
                    "template_id": r["template_id"],
                    "producto_nombre": r["producto_nombre"],
                    "tiendas": [],
                }
            if r["tienda"]:
                cortes[rid]["tiendas"].append({
                    "tienda": r["tienda"],
                    "fecha_primer_ingreso": str(r["fecha_primer_ingreso"]) if r["fecha_primer_ingreso"] else None,
                    "total_ingresado": int(r["total_ingresado"] or 0),
                    "stock_actual": int(r["stock_actual"] or 0),
                })

        result = list(cortes.values())
        if solo_en_tienda:
            result = [c for c in result if c["tiendas"]]
        return result


# ============================================================================
# Lógica de sync compartida (usada por sincronizar-estados y por el hook
# automático de guardar_distribucion_pt)
# ============================================================================
def _normalizar_fecha(fecha):
    """Convierte cualquier fecha (str / datetime tz-aware) a datetime tz-naive
    para guardar en prod_registros.fecha_envio_tienda (TIMESTAMP WITHOUT TZ).
    """
    if fecha is None:
        return None
    if isinstance(fecha, str):
        from datetime import datetime as _dt
        fecha = _dt.fromisoformat(fecha[:19])
    if hasattr(fecha, "tzinfo") and fecha.tzinfo is not None:
        fecha = fecha.replace(tzinfo=None)
    return fecha


async def _sync_estados_tienda(conn, registro_ids=None):
    """Ejecuta la sincronización de estado Tienda + fecha_envio_tienda
    para los registros con distribución `tipo_salida='normal'`.

    Reglas de escritura sobre fecha_envio_tienda:
      - Si está NULL              → se escribe, marca auto=TRUE.
      - Si tiene fecha y auto=TRUE → se sobrescribe sólo si la fecha
                                     detectada es DISTINTA (re-detect
                                     después de cambiar de template).
      - Si tiene fecha y auto=FALSE → se respeta (puesta por el usuario).

    Reglas sobre estado:
      - Si la consulta encuentra un primer movimiento → estado = 'Tienda'.
      - Si no encuentra movimiento → no toca el estado.

    Si `registro_ids` viene como lista, restringe el barrido a esos cortes
    (sirve para el hook on-save de distribución). Si es None, barre todos.

    Devuelve lista de dicts con la acción ejecutada por registro.
    """
    filtro_ids_sql = ""
    args = []
    if registro_ids:
        filtro_ids_sql = "AND r.id = ANY($1::text[])"
        args.append([str(rid) for rid in registro_ids])

    rows = await conn.fetch(
        f"""
        WITH base AS (
          SELECT r.id, r.n_corte, r.estado,
                 r.fecha_envio_tienda, r.fecha_envio_tienda_auto
          FROM prod_registros r
          WHERE EXISTS (
                  SELECT 1 FROM produccion.prod_registro_pt_relacion rel
                  WHERE rel.registro_id = r.id AND rel.tipo_salida = 'normal'
                )
            {filtro_ids_sql}
        ),
        {TIENDAS_CTE},
        variantes AS (
          SELECT rel.registro_id, pp.odoo_id AS variant_id
          FROM produccion.prod_registro_pt_relacion rel
          JOIN odoo.product_product pp ON pp.product_tmpl_id = rel.product_template_id_odoo
          WHERE rel.tipo_salida = 'normal'
            { ("AND rel.registro_id = ANY($1::text[])" if registro_ids else "") }
        ),
        primer_mov AS (
          SELECT v.registro_id,
                 t.nombre_grupo AS tienda,
                 MIN(sm.date) AS fecha_ingreso
          FROM base b
          JOIN variantes v ON v.registro_id = b.id
          JOIN odoo.stock_move sm
            ON sm.product_id = v.variant_id AND sm.state = 'done'
          JOIN tiendas t ON t.location_id = sm.location_dest_id
          GROUP BY v.registro_id, t.nombre_grupo
        ),
        primero_por_corte AS (
          SELECT DISTINCT ON (registro_id) registro_id, tienda, fecha_ingreso
          FROM primer_mov ORDER BY registro_id, fecha_ingreso
        )
        SELECT b.id, b.n_corte, b.estado AS estado_actual,
               b.fecha_envio_tienda AS fecha_actual,
               b.fecha_envio_tienda_auto AS auto_actual,
               p.tienda, p.fecha_ingreso
        FROM base b
        LEFT JOIN primero_por_corte p ON p.registro_id = b.id
        """,
        *args,
    )

    cambios = []
    for r in rows:
        registro_id = r["id"]
        estado_actual = r["estado_actual"] or ""
        fecha_actual = r["fecha_actual"]
        auto_actual = r["auto_actual"]
        tienda_destino = r["tienda"]
        fecha_detect = _normalizar_fecha(r["fecha_ingreso"])

        # Si no hay primer movimiento detectado → nada que hacer
        if fecha_detect is None or tienda_destino is None:
            continue

        # Decidir acción según el flag auto y la fecha actual
        if fecha_actual is None:
            accion = "nuevo"
        elif auto_actual is True:
            # Fue puesta por el sync. Sólo sobrescribimos si cambia.
            fecha_actual_naive = _normalizar_fecha(fecha_actual)
            if fecha_actual_naive == fecha_detect and estado_actual == "Tienda":
                accion = "sin_cambios"
            else:
                accion = "actualizado"
        else:
            # Fue puesta por el usuario manualmente → no se toca la fecha
            # (pero sí podemos escalar el estado a Tienda si aún no lo está)
            if estado_actual != "Tienda":
                await conn.execute(
                    "UPDATE prod_registros SET estado = 'Tienda' WHERE id = $1",
                    registro_id,
                )
                cambios.append({
                    "registro_id": registro_id,
                    "n_corte": r["n_corte"],
                    "estado_anterior": estado_actual,
                    "tienda_destino": tienda_destino,
                    "fecha_ingreso": str(fecha_detect),
                    "accion": "estado_solo_fecha_manual",
                })
            continue

        if accion == "sin_cambios":
            continue

        # Escribir / sobrescribir fecha + estado, marcando auto=TRUE
        await conn.execute(
            """UPDATE prod_registros
               SET estado = 'Tienda',
                   fecha_envio_tienda = $1,
                   fecha_envio_tienda_auto = TRUE
               WHERE id = $2""",
            fecha_detect, registro_id,
        )
        cambios.append({
            "registro_id": registro_id,
            "n_corte": r["n_corte"],
            "estado_anterior": estado_actual,
            "tienda_destino": tienda_destino,
            "fecha_ingreso": str(fecha_detect),
            "fecha_anterior": str(fecha_actual) if fecha_actual else None,
            "accion": accion,
        })

    return cambios


# ============================================================================
# POST /api/odoo-tienda/sincronizar-estados
# ============================================================================
@router.post("/sincronizar-estados")
async def sincronizar_estados_tienda(
    current_user: dict = Depends(get_current_user),
):
    """Para cada corte con distribución PT 'normal' busca la primera
    transferencia done a una tienda comercial (configurada en
    prod_tiendas_comerciales) y actualiza estado + fecha_envio_tienda
    según las reglas de smart-overwrite documentadas en
    `_sync_estados_tienda`.

    Idempotente.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        cambios = await _sync_estados_tienda(conn)

    user_name = (
        current_user.get("nombre_completo")
        or current_user.get("nombre")
        or current_user.get("username")
        or "sistema"
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Resumen por tipo de acción para el toast del frontend
    resumen = {
        "nuevo": 0,
        "actualizado": 0,
        "estado_solo_fecha_manual": 0,
    }
    for c in cambios:
        resumen[c.get("accion", "nuevo")] = resumen.get(c.get("accion", "nuevo"), 0) + 1

    return {
        "ok": True,
        "actualizados": len(cambios),
        "resumen": resumen,
        "ejecutado_por": user_name,
        "ejecutado_at": now.isoformat(),
        "detalle": cambios,
    }


# ============================================================================
# GET /api/odoo-tienda/tiendas-config — listado de tiendas configuradas
# ============================================================================
@router.get("/tiendas-config")
async def listar_tiendas_config(
    current_user: dict = Depends(get_current_user),
):
    """Devuelve la configuración de tiendas comerciales."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT tc.id, tc.odoo_location_id, tc.nombre, tc.alias_grupo,
                      tc.activo, tc.notas,
                      ld.complete_name, COALESCE(NULLIF(ld.x_nombre, ''), ld.name) AS x_nombre
               FROM produccion.prod_tiendas_comerciales tc
               LEFT JOIN odoo.stock_location ld ON ld.odoo_id = tc.odoo_location_id
               ORDER BY tc.nombre, tc.id"""
        )
    return [dict(r) for r in rows]
