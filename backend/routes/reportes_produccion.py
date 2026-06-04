"""
Router: Reportes de Producción P0
Dashboard KPIs, En Proceso, WIP por Etapa, Atrasados, Trazabilidad,
Cumplimiento de Ruta, Balance Terceros, Lotes Fraccionados.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import date, datetime, timezone
from pydantic import BaseModel
import json
import unicodedata

router = APIRouter(prefix="/api/reportes-produccion", tags=["reportes-produccion"])

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict


def parse_jsonb(val):
    if val is None:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (ValueError, json.JSONDecodeError):
            return []
    return val


def safe_float(v):
    try:
        return float(v or 0)
    except (ValueError, TypeError):
        return 0.0


def safe_int(v):
    try:
        return int(v or 0)
    except (ValueError, TypeError):
        return 0


def normalize_label(value: Optional[str]) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return " ".join(text.lower().split())


ESTADOS_MATRIZ_ORDEN = [
    "Para Corte", "Corte", "Para Estampado", "Estampado",
    "Para Costura", "Costura", "Para Atraque", "Atraque",
    "Para Lavanderia", "Muestra Lavanderia", "Lavanderia",
    "Para Acabado", "Acabado", "Producto Terminado", "Almacen PT",
    "Tienda",
]

# Ubicaciones de Odoo (stock_location.x_nombre) que cuentan como "tienda real" para
# los reportes de Almacén PT / Tienda. Se excluyen ubicaciones virtuales (Customers,
# Vendors, Ajuste, Abastecimiento, Proveedores, Fallados), almacén AP, REMATE y ZAP.
# (ZAP no es tienda comercial — se alinea con el criterio del Reporte Stock de Ventas).
TIENDAS_VALIDAS_X_NOMBRE = (
    'AZUL', 'BOOSH',
    'GM207', 'GM209', 'GM218',
    'GR238', 'GR55',
    'TALLER',
)


# ==================== 1. DASHBOARD KPIs ====================

@router.get("/dashboard")
async def dashboard_kpis(
    empresa_id: int = Query(7),
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    ruta_id: Optional[str] = None,
    modelo_id: Optional[str] = None,
    linea_negocio_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Condición de filtro por línea
        linea_filter = f"AND r.linea_negocio_id = {linea_negocio_id}" if linea_negocio_id else ""
        
        # KPI 1: Registros por estado_op
        rows_estado_op = await conn.fetch(f"""
            SELECT r.estado_op, COUNT(*) as cnt,
                   COALESCE(SUM((SELECT COALESCE(SUM(rt.cantidad_real),0) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id)),0) as prendas
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            WHERE r.dividido_desde_registro_id IS NULL
              {linea_filter}
            GROUP BY r.estado_op
        """)

        total_en_proceso = 0
        total_prendas_proceso = 0
        dist_estado_op = []
        for r in rows_estado_op:
            d = {"estado_op": r["estado_op"], "cantidad": int(r["cnt"]), "prendas": int(r["prendas"])}
            dist_estado_op.append(d)
            if r["estado_op"] in ("ABIERTA", "EN_PROCESO"):
                total_en_proceso += int(r["cnt"])
                total_prendas_proceso += int(r["prendas"])

        # KPI 2: Distribución por estado (etapa visible)
        rows_estado = await conn.fetch(f"""
            SELECT r.estado, COUNT(*) as cnt,
                   COALESCE(SUM((SELECT COALESCE(SUM(rt.cantidad_real),0) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id)),0) as prendas
            FROM prod_registros r
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND r.dividido_desde_registro_id IS NULL
              {linea_filter}
            GROUP BY r.estado
            ORDER BY cnt DESC
        """)
        dist_estado = [{"estado": r["estado"], "cantidad": int(r["cnt"]), "prendas": int(r["prendas"])} for r in rows_estado]

        # KPI 3: Lotes atrasados
        atrasados_count = await conn.fetchval("""
            SELECT COUNT(DISTINCT r.id)
            FROM prod_registros r
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND (
                r.fecha_entrega_final < CURRENT_DATE
                OR EXISTS (
                    SELECT 1 FROM prod_movimientos_produccion mp
                    WHERE mp.registro_id = r.id
                      AND mp.fecha_esperada_movimiento < CURRENT_DATE
                      AND mp.fecha_fin IS NULL
                )
              )
        """)

        # KPI 4: Movimientos abiertos (sin fecha_fin)
        movs_abiertos = await conn.fetchval("""
            SELECT COUNT(*)
            FROM prod_movimientos_produccion mp
            JOIN prod_registros r ON mp.registro_id = r.id
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND mp.fecha_fin IS NULL
        """)

        # KPI 5: Prendas por servicio (top 10)
        rows_srv = await conn.fetch("""
            SELECT sp.nombre as servicio,
                   COUNT(DISTINCT mp.registro_id) as lotes,
                   COALESCE(SUM(mp.cantidad_enviada),0) as enviadas,
                   COALESCE(SUM(mp.cantidad_recibida),0) as recibidas
            FROM prod_movimientos_produccion mp
            JOIN prod_registros r ON mp.registro_id = r.id
            JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
            GROUP BY sp.nombre
            ORDER BY lotes DESC
            LIMIT 10
        """)
        por_servicio = [
            {"servicio": r["servicio"], "lotes": int(r["lotes"]),
             "enviadas": safe_int(r["enviadas"]), "recibidas": safe_int(r["recibidas"])}
            for r in rows_srv
        ]

        # KPI 6: Lotes fraccionados count
        fraccionados = await conn.fetchval("""
            SELECT COUNT(*) FROM prod_registros
            WHERE dividido_desde_registro_id IS NOT NULL
        """)

        return {
            "total_en_proceso": total_en_proceso,
            "total_prendas_proceso": total_prendas_proceso,
            "atrasados": safe_int(atrasados_count),
            "movimientos_abiertos": safe_int(movs_abiertos),
            "lotes_fraccionados": safe_int(fraccionados),
            "distribucion_estado_op": dist_estado_op,
            "distribucion_estado": dist_estado,
            "por_servicio": por_servicio,
        }


# ==================== 2. PRODUCCIÓN EN PROCESO ====================

@router.get("/en-proceso")
async def produccion_en_proceso(
    empresa_id: int = Query(7),
    estado: Optional[str] = None,
    ruta_id: Optional[str] = None,
    modelo_id: Optional[str] = None,
    servicio_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT r.id, r.n_corte, r.estado, r.estado_op, r.urgente,
                   r.fecha_creacion, r.fecha_entrega_final,
                   COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') as modelo_nombre,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') as marca_nombre,
                   rp.nombre as ruta_nombre,
                   COALESCE((SELECT SUM(rt.cantidad_real) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id),0) as total_prendas,
                   (CURRENT_DATE - r.fecha_creacion::date) as dias_proceso,
                   (SELECT COUNT(*) FROM prod_movimientos_produccion mp WHERE mp.registro_id = r.id) as total_movimientos,
                   (SELECT COUNT(*) FROM prod_movimientos_produccion mp WHERE mp.registro_id = r.id AND mp.fecha_fin IS NOT NULL) as movimientos_cerrados,
                   (SELECT COUNT(*) FROM prod_movimientos_produccion mp WHERE mp.registro_id = r.id AND mp.fecha_esperada_movimiento < CURRENT_DATE AND mp.fecha_fin IS NULL) as movs_vencidos,
                   r.dividido_desde_registro_id,
                   r.division_numero
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_rutas_produccion rp ON m.ruta_produccion_id = rp.id
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
        """
        params = []

        if estado:
            params.append(estado)
            query += f" AND r.estado = ${len(params)}"
        if modelo_id:
            # Puede ser un UUID del catálogo o el NOMBRE de un modelo manual.
            # Filtra en ambos: matchea si es r.modelo_id exacto O si el nombre
            # (catálogo o modelo_manual) coincide.
            params.append(modelo_id)
            idx = len(params)
            query += (
                f" AND (r.modelo_id = ${idx}"
                f"      OR m.nombre = ${idx}"
                f"      OR r.modelo_manual->>'nombre_modelo' = ${idx})"
            )
        if ruta_id:
            params.append(ruta_id)
            query += f" AND m.ruta_produccion_id = ${len(params)}"
        if servicio_id:
            params.append(servicio_id)
            query += f" AND EXISTS (SELECT 1 FROM prod_movimientos_produccion mp2 WHERE mp2.registro_id = r.id AND mp2.servicio_id = ${len(params)})"

        query += " ORDER BY r.urgente DESC, r.fecha_creacion ASC"
        rows = await conn.fetch(query, *params)

        registros = []
        for r in rows:
            d = row_to_dict(r)
            d["total_prendas"] = safe_int(d.get("total_prendas"))
            d["dias_proceso"] = safe_int(d.get("dias_proceso"))
            d["total_movimientos"] = safe_int(d.get("total_movimientos"))
            d["movimientos_cerrados"] = safe_int(d.get("movimientos_cerrados"))
            d["movs_vencidos"] = safe_int(d.get("movs_vencidos"))
            if d.get("fecha_entrega_final"):
                d["fecha_entrega_final"] = str(d["fecha_entrega_final"])
            if d.get("fecha_creacion"):
                d["fecha_creacion"] = str(d["fecha_creacion"])
            registros.append(d)

        return {"registros": registros, "total": len(registros)}


# ==================== 2.5 EXPORT XLSX DE EN-PROCESO ====================

@router.get("/en-proceso/export-xlsx")
async def export_en_proceso_xlsx(
    empresa_id: int = Query(7),
    tipo_id: Optional[str] = Query(None, description="Filtra por tipo (catálogo o modelo_manual)"),
    marca_id: Optional[str] = Query(None, description="Filtra por marca (catálogo o modelo_manual)"),
    entalle_id: Optional[str] = Query(None, description="Filtra por entalle (catálogo o modelo_manual)"),
    tela_id: Optional[str] = Query(None, description="Filtra por tela (catálogo o modelo_manual)"),
    estados: Optional[List[str]] = Query(None, description="Lista de estados/etapas a incluir (repetible)"),
    estado: Optional[str] = Query(None, description="(Deprecated) usar 'estados' en su lugar"),
    incluir_tallas: bool = Query(False, description="Si True, agrega una segunda hoja con detalle por talla"),
    current_user: dict = Depends(get_current_user),
):
    """Descarga Excel con los lotes en proceso. Columnas:
       N° Corte, Marca, Tipo, Entalle, Tela, Fecha Inicio, Estado,
       Último Movimiento, Días sin Movimiento, Modelo, Urgente.

    Fecha Inicio: usa r.fecha_inicio_real; si no, fecha del primer movimiento
    de Corte; si no, fecha_creacion.

    Filtros opcionales:
      - tipo_id, marca_id, entalle_id, tela_id: matchea contra el catálogo
        (`prod_modelos.X_id`) Y contra el JSONB de modelo_manual cuando guarda
        `<X>_id` o `<X>_texto` (en este último caso se compara con el `nombre`
        del catálogo correspondiente).
      - estados: lista de estados a incluir; si no se envía, NO se filtra por
        estado (se toman todos los activos).
      - estado: parámetro singular legacy, sigue funcionando por compatibilidad.
    """
    from io import BytesIO
    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Resolver textos de catálogo para matchear contra modelo_manual JSONB
        # (los registros manuales guardan el nombre como texto, no el UUID).
        async def _nombre_catalogo(tabla: str, _id: str) -> Optional[str]:
            if not _id:
                return None
            row = await conn.fetchrow(f"SELECT nombre FROM {tabla} WHERE id = $1", _id)
            return row["nombre"] if row else None

        marca_txt   = await _nombre_catalogo("prod_marcas",   marca_id)
        tipo_txt    = await _nombre_catalogo("prod_tipos",    tipo_id)
        entalle_txt = await _nombre_catalogo("prod_entalles", entalle_id)
        tela_txt    = await _nombre_catalogo("prod_telas",    tela_id)

        conds = ["r.estado_op IN ('ABIERTA', 'EN_PROCESO')",
                 "r.dividido_desde_registro_id IS NULL"]
        params: list = []

        def _add_filter_id_or_texto(_id: str, _txt: Optional[str], col_id: str, json_key_id: str, json_key_texto: str):
            """Match contra (modelo del catálogo OR JSONB id OR JSONB texto)."""
            params.append(_id)
            idx_id = len(params)
            parts = [f"{col_id} = ${idx_id}", f"r.modelo_manual->>'{json_key_id}' = ${idx_id}"]
            if _txt:
                params.append(_txt)
                idx_txt = len(params)
                parts.append(f"r.modelo_manual->>'{json_key_texto}' = ${idx_txt}")
            conds.append("(" + " OR ".join(parts) + ")")

        if tipo_id:
            _add_filter_id_or_texto(tipo_id, tipo_txt, "m.tipo_id", "tipo_id", "tipo_texto")
        if marca_id:
            _add_filter_id_or_texto(marca_id, marca_txt, "m.marca_id", "marca_id", "marca_texto")
        if entalle_id:
            _add_filter_id_or_texto(entalle_id, entalle_txt, "m.entalle_id", "entalle_id", "entalle_texto")
        if tela_id:
            _add_filter_id_or_texto(tela_id, tela_txt, "m.tela_id", "tela_id", "tela_texto")

        # Estados: lista (preferida) O singular (legacy)
        estados_efectivos: list = []
        if estados:
            estados_efectivos = [e for e in estados if e]
        elif estado:
            estados_efectivos = [estado]
        if estados_efectivos:
            params.append(estados_efectivos)
            conds.append(f"r.estado = ANY(${len(params)}::text[])")

        where_sql = " AND ".join(conds)

        rows = await conn.fetch(f"""
            WITH ultimo_mov AS (
                SELECT mp.registro_id,
                       MAX(GREATEST(
                           COALESCE(mp.fecha_fin, '1900-01-01'::date),
                           COALESCE(mp.fecha_inicio, '1900-01-01'::date),
                           COALESCE(mp.avance_updated_at::date, '1900-01-01'::date),
                           mp.created_at::date
                       )) AS fecha_ultimo_mov
                  FROM prod_movimientos_produccion mp
                 GROUP BY mp.registro_id
            ),
            fecha_corte AS (
                SELECT mp.registro_id, MIN(mp.fecha_inicio) AS fecha_corte
                  FROM prod_movimientos_produccion mp
                  JOIN prod_servicios_produccion s ON s.id = mp.servicio_id
                 WHERE LOWER(s.nombre) LIKE '%corte%'
                 GROUP BY mp.registro_id
            )
            SELECT
                r.id::text AS registro_id,
                r.n_corte,
                COALESCE(ma.nombre, r.modelo_manual->>'marca_texto', '')   AS marca,
                COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto', '')    AS tipo,
                COALESCE(en.nombre, r.modelo_manual->>'entalle_texto', '') AS entalle,
                COALESCE(te.nombre, r.modelo_manual->>'tela_texto', '')    AS tela,
                COALESCE(hi.nombre, r.modelo_manual->>'hilo_texto', '')    AS hilo,
                COALESCE(
                    (SELECT SUM(rt.cantidad_real)
                       FROM prod_registro_tallas rt
                      WHERE rt.registro_id = r.id),
                    0
                )::int AS cantidad_prendas,
                COALESCE(r.fecha_inicio_real, fc.fecha_corte, r.fecha_creacion::date) AS fecha_inicio,
                r.estado,
                um.fecha_ultimo_mov,
                CASE WHEN um.fecha_ultimo_mov IS NOT NULL
                     THEN (CURRENT_DATE - um.fecha_ultimo_mov)
                     ELSE NULL END AS dias_sin_mov,
                COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo', '') AS modelo,
                r.urgente
              FROM prod_registros r
              LEFT JOIN prod_modelos mod ON mod.id = r.modelo_id
              LEFT JOIN prod_marcas ma   ON ma.id  = mod.marca_id
              LEFT JOIN prod_tipos tp    ON tp.id  = mod.tipo_id
              LEFT JOIN prod_entalles en ON en.id  = mod.entalle_id
              LEFT JOIN prod_telas te    ON te.id  = mod.tela_id
              LEFT JOIN prod_hilos_especificos hi ON hi.id = r.hilo_especifico_id
              LEFT JOIN ultimo_mov um    ON um.registro_id = r.id
              LEFT JOIN fecha_corte fc   ON fc.registro_id = r.id
              -- alias 'm' usado por filtros de tipo_id si aplica:
              LEFT JOIN prod_modelos m   ON m.id = r.modelo_id
             WHERE {where_sql}
             ORDER BY um.fecha_ultimo_mov ASC NULLS LAST, r.n_corte
        """, *params)

    # ──────────────────────────────────────────────────────────────
    # Construcción del XLSX
    # ──────────────────────────────────────────────────────────────
    wb = Workbook()
    ws = wb.active
    ws.title = "En Proceso"

    headers = [
        "N° Corte", "Marca", "Tipo", "Entalle", "Tela", "Hilo",
        "Cantidad", "Fecha Inicio", "Estado", "Último Movimiento", "Días sin Mov.",
        "Modelo", "Urgente",
    ]

    header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    thin = Side(border_style="thin", color="D1D5DB")
    border_all = Border(top=thin, bottom=thin, left=thin, right=thin)

    for col_idx, h in enumerate(headers, start=1):
        c = ws.cell(row=1, column=col_idx, value=h)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border_all

    # Anchos por columna (heurística por contenido típico)
    widths = [12, 18, 14, 18, 18, 14, 10, 13, 18, 18, 14, 22, 10]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w

    for row_idx, r in enumerate(rows, start=2):
        ws.cell(row=row_idx, column=1, value=r["n_corte"])
        ws.cell(row=row_idx, column=2, value=r["marca"])
        ws.cell(row=row_idx, column=3, value=r["tipo"])
        ws.cell(row=row_idx, column=4, value=r["entalle"])
        ws.cell(row=row_idx, column=5, value=r["tela"])
        ws.cell(row=row_idx, column=6, value=r["hilo"])
        ws.cell(row=row_idx, column=7, value=int(r["cantidad_prendas"] or 0))
        ws.cell(row=row_idx, column=8, value=r["fecha_inicio"])
        ws.cell(row=row_idx, column=9, value=r["estado"])
        ws.cell(row=row_idx, column=10, value=r["fecha_ultimo_mov"])
        dias = r["dias_sin_mov"]
        ws.cell(row=row_idx, column=11, value=int(dias) if dias is not None else None)
        ws.cell(row=row_idx, column=12, value=r["modelo"])
        ws.cell(row=row_idx, column=13, value="SÍ" if r["urgente"] else "")

    # Freeze de la fila de cabeceras + filtro automático
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    # ──────────────────────────────────────────────────────────────
    # Hoja 2 (opcional): Detalle por Talla — formato pivot
    # ──────────────────────────────────────────────────────────────
    if incluir_tallas and rows:
        # Usamos registro_id (UUID único) como clave del pivot, NO n_corte —
        # n_corte puede repetirse entre dos registros activos distintos.
        registro_ids = [r["registro_id"] for r in rows]
        async with pool.acquire() as conn2:
            tallas_rows = await conn2.fetch("""
                SELECT rt.registro_id::text AS registro_id,
                       COALESCE(t.nombre, '?') AS talla,
                       SUM(rt.cantidad_real)::int AS cantidad
                  FROM prod_registro_tallas rt
                  LEFT JOIN prod_tallas_catalogo t ON t.id = rt.talla_id
                 WHERE rt.registro_id::text = ANY($1::text[])
                 GROUP BY rt.registro_id, t.nombre
            """, registro_ids)

        # Pivot en memoria: { registro_id: { talla: cantidad } }
        pivot: dict = {}
        tallas_set = set()
        for tr in tallas_rows:
            rid = tr["registro_id"]
            t = tr["talla"]
            pivot.setdefault(rid, {})[t] = int(tr["cantidad"] or 0)
            tallas_set.add(t)

        # Ordenar tallas: primero las numéricas asc, después las de letras (S, M, L, XL)
        ORDEN_LETRAS = {"XS": 1, "S": 2, "M": 3, "L": 4, "XL": 5, "XXL": 6, "XXXL": 7}
        def _talla_key(t: str):
            try:
                return (0, int(t), t)  # numérica
            except (ValueError, TypeError):
                return (1, ORDEN_LETRAS.get(t.upper(), 99), t)
        tallas_ordenadas = sorted(tallas_set, key=_talla_key)

        ws2 = wb.create_sheet("Detalle por Talla")

        headers2 = ["N° Corte", "Marca", "Tipo", "Entalle", "Tela", "Hilo", "Modelo"] + tallas_ordenadas + ["Total"]
        for col_idx, h in enumerate(headers2, start=1):
            c = ws2.cell(row=1, column=col_idx, value=h)
            c.fill = header_fill
            c.font = header_font
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = border_all
        # Anchos: 7 cols descriptivas + cada talla 8px + Total 10
        widths2 = [12, 18, 14, 18, 18, 14, 22] + [8] * len(tallas_ordenadas) + [10]
        for i, w in enumerate(widths2, start=1):
            ws2.column_dimensions[ws2.cell(row=1, column=i).column_letter].width = w

        for row_idx, r in enumerate(rows, start=2):
            ws2.cell(row=row_idx, column=1, value=r["n_corte"])
            ws2.cell(row=row_idx, column=2, value=r["marca"])
            ws2.cell(row=row_idx, column=3, value=r["tipo"])
            ws2.cell(row=row_idx, column=4, value=r["entalle"])
            ws2.cell(row=row_idx, column=5, value=r["tela"])
            ws2.cell(row=row_idx, column=6, value=r["hilo"])
            ws2.cell(row=row_idx, column=7, value=r["modelo"])
            por_talla = pivot.get(r["registro_id"], {})
            total_fila = 0
            for j, t in enumerate(tallas_ordenadas, start=8):
                v = por_talla.get(t, 0)
                if v:
                    ws2.cell(row=row_idx, column=j, value=v)
                    total_fila += v
            ws2.cell(row=row_idx, column=7 + len(tallas_ordenadas) + 1,
                     value=total_fila or None)

        ws2.freeze_panes = "H2"  # freeze hasta col G (Modelo), las tallas hacen scroll
        ws2.auto_filter.ref = ws2.dimensions

        # ──────────────────────────────────────────────────────────────
        # Hoja 3: Tallas en filas (formato "long" — ideal para tabla dinámica)
        # Una fila por (lote × talla con cantidad > 0).
        # Columnas: N° Corte | Marca | Tipo | Modelo | Estado | Talla | Cantidad
        # ──────────────────────────────────────────────────────────────
        ws3 = wb.create_sheet("Tallas en Filas")

        headers3 = ["N° Corte", "Marca", "Tipo", "Entalle", "Tela", "Hilo", "Modelo", "Estado", "Talla", "Cantidad"]
        for col_idx, h in enumerate(headers3, start=1):
            c = ws3.cell(row=1, column=col_idx, value=h)
            c.fill = header_fill
            c.font = header_font
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = border_all
        widths3 = [12, 18, 14, 18, 18, 14, 22, 18, 8, 10]
        for i, w in enumerate(widths3, start=1):
            ws3.column_dimensions[ws3.cell(row=1, column=i).column_letter].width = w

        long_row = 2
        # Recorre en el mismo orden de la hoja 1 (rows), y dentro de cada lote,
        # las tallas en orden global (numéricas asc, luego letras).
        # Usa registro_id como clave (n_corte puede repetirse entre lotes).
        for r in rows:
            por_talla = pivot.get(r["registro_id"], {})
            for t in tallas_ordenadas:
                v = por_talla.get(t, 0)
                if not v:
                    continue
                ws3.cell(row=long_row, column=1, value=r["n_corte"])
                ws3.cell(row=long_row, column=2, value=r["marca"])
                ws3.cell(row=long_row, column=3, value=r["tipo"])
                ws3.cell(row=long_row, column=4, value=r["entalle"])
                ws3.cell(row=long_row, column=5, value=r["tela"])
                ws3.cell(row=long_row, column=6, value=r["hilo"])
                ws3.cell(row=long_row, column=7, value=r["modelo"])
                ws3.cell(row=long_row, column=8, value=r["estado"])
                ws3.cell(row=long_row, column=9, value=t)
                ws3.cell(row=long_row, column=10, value=int(v))
                long_row += 1

        ws3.freeze_panes = "A2"
        ws3.auto_filter.ref = ws3.dimensions

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    fecha_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"en-proceso_{fecha_str}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ==================== 3. WIP POR ETAPA ====================

@router.get("/wip-etapa")
async def wip_por_etapa(
    empresa_id: int = Query(7),
    tipo_id: Optional[str] = Query(None),
    ruta_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """WIP agrupado por etapa.

    - Si se pasa `tipo_id` o `ruta_id`, los registros se filtran por modelo.
    - Si se pasa `ruta_id`, las etapas se devuelven en el ORDEN DE LA RUTA
      (incluyendo etapas vacías que existan en la ruta pero no tengan lotes
      todavía). Esto permite ver el flujo natural en orden.
    - Sin filtros: orden por cantidad de lotes desc (comportamiento previo).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1) Construir filtros opcionales para tipo / ruta
        # Soportamos registros del catálogo (modelo_id) Y registros manuales (modelo_manual JSONB).
        joins = ""
        conds = ["r.estado_op IN ('ABIERTA', 'EN_PROCESO')",
                 "r.dividido_desde_registro_id IS NULL"]
        params: list = []

        if tipo_id:
            joins = "LEFT JOIN prod_modelos m ON m.id = r.modelo_id"
            params.append(tipo_id)
            # Match contra modelo del catálogo O contra el tipo guardado en modelo_manual
            conds.append(
                f"(m.tipo_id = ${len(params)} OR r.modelo_manual->>'tipo_id' = ${len(params)})"
            )

        # NOTA: ruta_id NO filtra registros (porque los manuales no la guardan
        # consistentemente). Sólo se usa más abajo para ORDENAR las etapas
        # según el flujo de la ruta seleccionada. Si querés filtrar por
        # tipo de producto, usá el filtro Tipo.

        where_sql = " AND ".join(conds)

        rows = await conn.fetch(f"""
            SELECT r.estado,
                   COUNT(*) as lotes,
                   COALESCE(SUM((SELECT COALESCE(SUM(rt.cantidad_real),0) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id)),0) as prendas,
                   MIN(r.fecha_creacion) as lote_mas_antiguo,
                   COUNT(*) FILTER (WHERE r.urgente = true) as urgentes
            FROM prod_registros r
            {joins}
            WHERE {where_sql}
            GROUP BY r.estado
            ORDER BY lotes DESC
        """, *params)

        etapas_data = {}
        for r in rows:
            etapas_data[r["estado"]] = {
                "etapa": r["estado"],
                "lotes": int(r["lotes"]),
                "prendas": safe_int(r["prendas"]),
                "urgentes": int(r["urgentes"]),
                "lote_mas_antiguo": str(r["lote_mas_antiguo"]) if r["lote_mas_antiguo"] else None,
            }

        # 2) Si hay filtro de ruta, ordenar por el orden definido en la ruta
        if ruta_id:
            ruta_row = await conn.fetchrow(
                "SELECT etapas FROM prod_rutas_produccion WHERE id = $1", ruta_id)
            if ruta_row and ruta_row["etapas"]:
                etapas_ruta_raw = ruta_row["etapas"]
                if isinstance(etapas_ruta_raw, str):
                    import json as _json
                    etapas_ruta_raw = _json.loads(etapas_ruta_raw)
                # Solo etapas que aparecen como estado del registro (aparece_en_estado=True)
                etapas_ruta = sorted(
                    [e for e in etapas_ruta_raw if e.get("aparece_en_estado", True)],
                    key=lambda e: e.get("orden", 0)
                )

                # Helper: normaliza nombre (sin tildes, lowercase, espacios trim)
                # para emparejar "Lavanderia" ↔ "Lavanderia", etc.
                import unicodedata as _u
                def _norm(s: str) -> str:
                    if not s:
                        return ""
                    s = _u.normalize("NFD", str(s))
                    s = "".join(c for c in s if _u.category(c) != "Mn")
                    return s.lower().strip()

                # Alias manuales para nombres equivalentes pero distintos
                # (ej. la ruta los llama "Producto Terminado" y la BD "Almacen PT").
                ALIAS = {
                    "producto terminado": "almacen pt",
                    "almacen pt":         "producto terminado",
                }

                # Index normalizado de los datos reales
                data_index = {}
                for k, v in etapas_data.items():
                    nk = _norm(k)
                    data_index[nk] = v
                    if nk in ALIAS:
                        data_index[ALIAS[nk]] = v

                etapas_ord = []
                for e_def in etapas_ruta:
                    nombre_ruta = e_def.get("nombre")
                    nk = _norm(nombre_ruta)
                    real = data_index.get(nk) or data_index.get(ALIAS.get(nk, ""))
                    if real is not None:
                        d = dict(real)
                    else:
                        d = {
                            "etapa": nombre_ruta, "lotes": 0, "prendas": 0,
                            "urgentes": 0, "lote_mas_antiguo": None,
                        }
                    etapas_ord.append(d)

                # NOTA: las etapas con datos que NO pertenecen a esta ruta
                # (ej. registros pantalones cuando la ruta es Polo) se omiten
                # del chart. Si querés verlos, cambiá el filtro de Tipo o
                # selecciona la ruta correspondiente.

                return {"etapas": etapas_ord, "total_etapas": len(etapas_ord)}

        # 3) Sin ruta filtrada → orden por cantidad de lotes desc (comportamiento previo)
        etapas = list(etapas_data.values())
        return {"etapas": etapas, "total_etapas": len(etapas)}


# ==================== 3.5 INCIDENCIAS (paralizan o no) ====================

@router.get("/incidencias")
async def reporte_incidencias(
    estado: Optional[str] = Query(None, description="ABIERTA / RESUELTA / vacío para todas"),
    paraliza: Optional[bool] = Query(None, description="True solo paralizantes, False solo no-paralizantes, vacío todas"),
    current_user: dict = Depends(get_current_user),
):
    """Lista incidencias con info del registro y, si aplica, su paralización.

    Pensado para la pestaña 'Incidencias' del Seguimiento de Producción
    — incluye todas las incidencias, tengan o no paralización asociada.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conds = []
        params: list = []
        if estado:
            params.append(estado.upper())
            conds.append(f"i.estado = ${len(params)}")
        if paraliza is not None:
            params.append(paraliza)
            conds.append(f"i.paraliza = ${len(params)}")

        where_sql = (" WHERE " + " AND ".join(conds)) if conds else ""

        rows = await conn.fetch(f"""
            SELECT i.id,
                   i.fecha_hora,
                   i.usuario,
                   i.tipo,
                   i.comentario,
                   i.estado,
                   i.paraliza,
                   i.paralizacion_id,
                   i.comentario_resolucion,
                   i.created_at,
                   i.updated_at,
                   m.nombre AS motivo_nombre,
                   r.id::text AS registro_id,
                   r.n_corte,
                   r.estado AS etapa,
                   r.urgente,
                   COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
                   COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto')     AS tipo_producto,
                   p.activa       AS paralizacion_activa,
                   p.fecha_inicio AS paralizacion_inicio,
                   p.fecha_fin    AS paralizacion_fin,
                   srv.nombre     AS movimiento_servicio
              FROM prod_incidencia i
              JOIN prod_registros r       ON r.id = i.registro_id
              LEFT JOIN prod_modelos mod  ON mod.id = r.modelo_id
              LEFT JOIN prod_tipos tp     ON tp.id  = mod.tipo_id
              LEFT JOIN prod_motivos_incidencia m ON i.tipo = m.id
              LEFT JOIN prod_paralizacion p       ON p.id = i.paralizacion_id
              LEFT JOIN prod_movimientos_produccion mp ON mp.id = i.movimiento_id
              LEFT JOIN prod_servicios_produccion srv  ON srv.id = mp.servicio_id
              {where_sql}
             ORDER BY (i.estado = 'ABIERTA') DESC,
                      i.fecha_hora DESC NULLS LAST
        """, *params)

        items = []
        for r in rows:
            d = row_to_dict(r)
            # Fallback: tipo guardado como texto libre cuando no apunta a un motivo
            if not d.get('motivo_nombre') and d.get('tipo'):
                d['motivo_nombre'] = d['tipo']
            for k in ('fecha_hora', 'created_at', 'updated_at',
                     'paralizacion_inicio', 'paralizacion_fin'):
                if d.get(k):
                    d[k] = str(d[k])
            items.append(d)

        # Resumen rápido para la UI
        resumen = {
            "total":             len(items),
            "abiertas":          sum(1 for i in items if i.get("estado") == "ABIERTA"),
            "resueltas":         sum(1 for i in items if i.get("estado") == "RESUELTA"),
            "con_paralizacion":  sum(1 for i in items if i.get("paraliza")),
            "sin_paralizacion":  sum(1 for i in items if not i.get("paraliza")),
        }
        return {"incidencias": items, "resumen": resumen}


# ==================== 4. LOTES ATRASADOS ====================

@router.get("/atrasados")
async def lotes_atrasados(
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT r.id, r.n_corte, r.estado, r.estado_op, r.urgente,
                   r.fecha_creacion, r.fecha_entrega_final,
                   m.nombre as modelo_nombre,
                   ma.nombre as marca_nombre,
                   COALESCE((SELECT SUM(rt.cantidad_real) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id),0) as total_prendas,
                   (CURRENT_DATE - r.fecha_creacion::date) as dias_proceso,
                   -- Motivos de atraso
                   CASE WHEN r.fecha_entrega_final < CURRENT_DATE THEN true ELSE false END as entrega_vencida,
                   (SELECT COUNT(*) FROM prod_movimientos_produccion mp
                    WHERE mp.registro_id = r.id AND mp.fecha_esperada_movimiento < CURRENT_DATE AND mp.fecha_fin IS NULL) as movs_vencidos,
                   -- Días de atraso
                   CASE WHEN r.fecha_entrega_final < CURRENT_DATE
                        THEN (CURRENT_DATE - r.fecha_entrega_final)
                        ELSE 0 END as dias_atraso_entrega
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND (
                r.fecha_entrega_final < CURRENT_DATE
                OR EXISTS (
                    SELECT 1 FROM prod_movimientos_produccion mp
                    WHERE mp.registro_id = r.id
                      AND mp.fecha_esperada_movimiento < CURRENT_DATE
                      AND mp.fecha_fin IS NULL
                )
              )
            ORDER BY dias_atraso_entrega DESC NULLS LAST, r.urgente DESC
        """)

        registros = []
        for r in rows:
            d = row_to_dict(r)
            d["total_prendas"] = safe_int(d.get("total_prendas"))
            d["dias_proceso"] = safe_int(d.get("dias_proceso"))
            d["movs_vencidos"] = safe_int(d.get("movs_vencidos"))
            d["dias_atraso_entrega"] = safe_int(d.get("dias_atraso_entrega"))
            if d.get("fecha_entrega_final"):
                d["fecha_entrega_final"] = str(d["fecha_entrega_final"])
            if d.get("fecha_creacion"):
                d["fecha_creacion"] = str(d["fecha_creacion"])
            registros.append(d)

        return {"registros": registros, "total": len(registros)}


# ==================== 5. TRAZABILIDAD ====================

@router.get("/trazabilidad/{registro_id}")
async def trazabilidad_registro(
    registro_id: str,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("""
            SELECT r.id, r.n_corte, r.estado, r.estado_op, r.fecha_creacion, r.fecha_entrega_final,
                   r.urgente, r.dividido_desde_registro_id, r.division_numero,
                   m.nombre as modelo_nombre, ma.nombre as marca_nombre,
                   rp.nombre as ruta_nombre, rp.etapas as ruta_etapas,
                   m.ruta_produccion_id
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_rutas_produccion rp ON m.ruta_produccion_id = rp.id
            WHERE r.id = $1
        """, registro_id)

        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        reg_d = row_to_dict(reg)
        if reg_d.get("fecha_creacion"):
            reg_d["fecha_creacion"] = str(reg_d["fecha_creacion"])
        if reg_d.get("fecha_entrega_final"):
            reg_d["fecha_entrega_final"] = str(reg_d["fecha_entrega_final"])
        reg_d["ruta_etapas"] = parse_jsonb(reg_d.get("ruta_etapas"))

        # Tallas
        tallas = await conn.fetch("""
            SELECT rt.talla_id, rt.cantidad_real, tc.nombre as talla_nombre
            FROM prod_registro_tallas rt
            LEFT JOIN prod_tallas_catalogo tc ON rt.talla_id = tc.id
            WHERE rt.registro_id = $1
            ORDER BY tc.nombre
        """, registro_id)
        reg_d["tallas"] = [{"talla_id": t["talla_id"], "talla_nombre": t["talla_nombre"], "cantidad": safe_int(t["cantidad_real"])} for t in tallas]
        reg_d["total_prendas"] = sum(safe_int(t["cantidad_real"]) for t in tallas)

        # Movimientos cronológicos
        movs = await conn.fetch("""
            SELECT mp.id, mp.servicio_id, mp.persona_id,
                   sp.nombre as servicio_nombre,
                   pp.nombre as persona_nombre,
                   pp.tipo_persona,
                   mp.cantidad_enviada, mp.cantidad_recibida, mp.diferencia,
                   mp.costo_calculado, mp.tarifa_aplicada,
                   mp.fecha_inicio, mp.fecha_fin, mp.fecha_esperada_movimiento,
                   mp.observaciones, mp.created_at,
                   CASE WHEN mp.fecha_fin IS NOT NULL AND mp.fecha_inicio IS NOT NULL
                        THEN mp.fecha_fin - mp.fecha_inicio
                        ELSE NULL END as dias_servicio
            FROM prod_movimientos_produccion mp
            LEFT JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON mp.persona_id = pp.id
            WHERE mp.registro_id = $1
            ORDER BY mp.fecha_inicio ASC NULLS LAST, mp.created_at ASC
        """, registro_id)

        movimientos = []
        for mv in movs:
            d = row_to_dict(mv)
            d["cantidad_enviada"] = safe_int(d.get("cantidad_enviada"))
            d["cantidad_recibida"] = safe_int(d.get("cantidad_recibida"))
            d["diferencia"] = safe_int(d.get("diferencia"))
            d["costo_calculado"] = safe_float(d.get("costo_calculado"))
            d["tarifa_aplicada"] = safe_float(d.get("tarifa_aplicada"))
            d["dias_servicio"] = safe_int(d.get("dias_servicio"))
            for f in ("fecha_inicio", "fecha_fin", "fecha_esperada_movimiento", "created_at"):
                if d.get(f):
                    d[f] = str(d[f])
            movimientos.append(d)

        # Divisiones (hijos)
        hijos = await conn.fetch("""
            SELECT id, n_corte, estado, estado_op, division_numero
            FROM prod_registros WHERE dividido_desde_registro_id = $1
            ORDER BY division_numero
        """, registro_id)
        divisiones = [row_to_dict(h) for h in hijos]

        return {
            "registro": reg_d,
            "movimientos": movimientos,
            "divisiones": divisiones,
            "total_movimientos": len(movimientos),
        }


# ==================== 6. CUMPLIMIENTO DE RUTA ====================

@router.get("/cumplimiento-ruta")
async def cumplimiento_ruta(
    empresa_id: int = Query(7),
    ruta_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT r.id, r.n_corte, r.estado, r.estado_op, r.urgente,
                   r.fecha_creacion, r.fecha_entrega_final,
                   m.nombre as modelo_nombre,
                   rp.id as ruta_id, rp.nombre as ruta_nombre, rp.etapas as ruta_etapas,
                   COALESCE((SELECT SUM(rt.cantidad_real) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id),0) as total_prendas
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_rutas_produccion rp ON m.ruta_produccion_id = rp.id
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND r.dividido_desde_registro_id IS NULL
              AND rp.id IS NOT NULL
        """
        params = []
        if ruta_id:
            params.append(ruta_id)
            query += f" AND rp.id = ${len(params)}"

        query += " ORDER BY r.fecha_creacion ASC"
        rows = await conn.fetch(query, *params)

        # Get all movimientos for these registros in batch
        reg_ids = [r["id"] for r in rows]
        if reg_ids:
            movs = await conn.fetch("""
                SELECT mp.registro_id, mp.servicio_id,
                       mp.fecha_inicio, mp.fecha_fin
                FROM prod_movimientos_produccion mp
                WHERE mp.registro_id = ANY($1::text[])
            """, reg_ids)
        else:
            movs = []

        # Index: registro_id -> list of {servicio_id, fecha_inicio, fecha_fin}
        mov_map = {}
        for mv in movs:
            rid = mv["registro_id"]
            if rid not in mov_map:
                mov_map[rid] = []
            mov_map[rid].append({
                "servicio_id": mv["servicio_id"],
                "inicio": mv["fecha_inicio"] is not None,
                "fin": mv["fecha_fin"] is not None,
            })

        registros = []
        for r in rows:
            d = row_to_dict(r)
            etapas = parse_jsonb(d.pop("ruta_etapas", None))
            d["total_prendas"] = safe_int(d.get("total_prendas"))
            if d.get("fecha_creacion"):
                d["fecha_creacion"] = str(d["fecha_creacion"])
            if d.get("fecha_entrega_final"):
                d["fecha_entrega_final"] = str(d["fecha_entrega_final"])

            reg_movs = mov_map.get(r["id"], [])
            total_etapas = len(etapas)
            completadas = 0
            en_curso = 0
            pendientes = 0
            detalle_etapas = []

            for etapa in etapas:
                sid = etapa.get("servicio_id")
                nombre_etapa = etapa.get("nombre", "")
                obligatorio = etapa.get("obligatorio", False)

                # Check if any movement matches this service
                movs_etapa = [m for m in reg_movs if m["servicio_id"] == sid]
                tiene_inicio = any(m["inicio"] for m in movs_etapa)
                tiene_fin = any(m["fin"] for m in movs_etapa)

                if tiene_fin:
                    estado_etapa = "COMPLETADA"
                    completadas += 1
                elif tiene_inicio:
                    estado_etapa = "EN_CURSO"
                    en_curso += 1
                else:
                    estado_etapa = "PENDIENTE"
                    pendientes += 1

                detalle_etapas.append({
                    "nombre": nombre_etapa,
                    "obligatorio": obligatorio,
                    "estado": estado_etapa,
                })

            pct = round((completadas / total_etapas * 100), 1) if total_etapas > 0 else 0
            d["total_etapas"] = total_etapas
            d["completadas"] = completadas
            d["en_curso"] = en_curso
            d["pendientes"] = pendientes
            d["pct_cumplimiento"] = pct
            d["detalle_etapas"] = detalle_etapas
            registros.append(d)

        return {"registros": registros, "total": len(registros)}


# ==================== 7. BALANCE POR TERCEROS ====================

@router.get("/balance-terceros")
async def balance_terceros(
    empresa_id: int = Query(7),
    servicio_id: Optional[str] = None,
    persona_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # By service
        query_srv = """
            SELECT sp.id as servicio_id, sp.nombre as servicio,
                   pp.id as persona_id, pp.nombre as persona, pp.tipo_persona,
                   COUNT(DISTINCT mp.registro_id) as lotes,
                   COUNT(mp.id) as movimientos,
                   COALESCE(SUM(mp.cantidad_enviada),0) as total_enviadas,
                   COALESCE(SUM(mp.cantidad_recibida),0) as total_recibidas,
                   COALESCE(SUM(mp.diferencia),0) as total_diferencia,
                   COALESCE(SUM(mp.costo_calculado),0) as costo_total,
                   COUNT(mp.id) FILTER (WHERE mp.fecha_fin IS NULL) as movs_abiertos,
                   COALESCE(SUM(mp.cantidad_enviada) FILTER (WHERE mp.fecha_fin IS NULL),0) as prendas_en_poder
            FROM prod_movimientos_produccion mp
            JOIN prod_registros r ON mp.registro_id = r.id
            JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id
            LEFT JOIN prod_personas_produccion pp ON mp.persona_id = pp.id
        """
        params = []
        where_clauses_srv = []
        if servicio_id:
            params.append(servicio_id)
            where_clauses_srv.append(f"mp.servicio_id = ${len(params)}")
        if persona_id:
            params.append(persona_id)
            where_clauses_srv.append(f"mp.persona_id = ${len(params)}")

        if where_clauses_srv:
            query_srv += " WHERE " + " AND ".join(where_clauses_srv)

        query_srv += " GROUP BY sp.id, sp.nombre, pp.id, pp.nombre, pp.tipo_persona ORDER BY costo_total DESC"
        rows = await conn.fetch(query_srv, *params)

        balance = []
        for r in rows:
            balance.append({
                "servicio_id": r["servicio_id"],
                "servicio": r["servicio"],
                "persona_id": r["persona_id"],
                "persona": r["persona"],
                "tipo_persona": r["tipo_persona"],
                "lotes": int(r["lotes"]),
                "movimientos": int(r["movimientos"]),
                "total_enviadas": safe_int(r["total_enviadas"]),
                "total_recibidas": safe_int(r["total_recibidas"]),
                "total_diferencia": safe_int(r["total_diferencia"]),
                "costo_total": safe_float(r["costo_total"]),
                "movs_abiertos": int(r["movs_abiertos"]),
                "prendas_en_poder": safe_int(r["prendas_en_poder"]),
            })

        # Summary by service only
        resumen_servicio = {}
        for b in balance:
            sid = b["servicio"]
            if sid not in resumen_servicio:
                resumen_servicio[sid] = {"lotes": 0, "enviadas": 0, "recibidas": 0, "costo": 0, "en_poder": 0}
            resumen_servicio[sid]["lotes"] += b["lotes"]
            resumen_servicio[sid]["enviadas"] += b["total_enviadas"]
            resumen_servicio[sid]["recibidas"] += b["total_recibidas"]
            resumen_servicio[sid]["costo"] += b["costo_total"]
            resumen_servicio[sid]["en_poder"] += b["prendas_en_poder"]

        return {"balance": balance, "resumen_servicio": resumen_servicio, "total": len(balance)}


# ==================== 8. LOTES FRACCIONADOS ====================

@router.get("/lotes-fraccionados")
async def lotes_fraccionados(
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get parents that have children
        rows = await conn.fetch("""
            SELECT p.id as padre_id, p.n_corte as padre_corte, p.estado as padre_estado,
                   p.estado_op as padre_estado_op,
                   COALESCE(mo.nombre, p.modelo_manual->>'nombre_modelo') as modelo_nombre,
                   COALESCE((SELECT SUM(rt.cantidad_real) FROM prod_registro_tallas rt WHERE rt.registro_id = p.id),0) as padre_prendas,
                   (SELECT json_agg(json_build_object(
                       'id', h.id,
                       'n_corte', h.n_corte,
                       'estado', h.estado,
                       'estado_op', h.estado_op,
                       'division_numero', h.division_numero,
                       'prendas', COALESCE((SELECT SUM(rt2.cantidad_real) FROM prod_registro_tallas rt2 WHERE rt2.registro_id = h.id),0)
                   ) ORDER BY h.division_numero)
                   FROM prod_registros h WHERE h.dividido_desde_registro_id = p.id) as hijos
            FROM prod_registros p
            LEFT JOIN prod_modelos mo ON p.modelo_id = mo.id
            WHERE EXISTS (SELECT 1 FROM prod_registros h WHERE h.dividido_desde_registro_id = p.id)
            ORDER BY p.fecha_creacion DESC
        """)

        familias = []
        for r in rows:
            hijos_raw = r["hijos"]
            if isinstance(hijos_raw, str):
                hijos_raw = json.loads(hijos_raw)
            hijos = hijos_raw or []
            total_hijos_prendas = sum(safe_int(h.get("prendas")) for h in hijos)

            familias.append({
                "padre_id": r["padre_id"],
                "padre_corte": r["padre_corte"],
                "padre_estado": r["padre_estado"],
                "padre_estado_op": r["padre_estado_op"],
                "modelo_nombre": r["modelo_nombre"],
                "padre_prendas": safe_int(r["padre_prendas"]),
                "hijos": hijos,
                "total_hijos": len(hijos),
                "total_hijos_prendas": total_hijos_prendas,
                "total_familia_prendas": safe_int(r["padre_prendas"]) + total_hijos_prendas,
            })

        return {"familias": familias, "total": len(familias)}


# ==================== FILTROS: Servicios y Rutas para combos ====================

@router.get("/filtros")
async def get_filtros_reportes(
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        servicios = await conn.fetch("SELECT id, nombre FROM prod_servicios_produccion ORDER BY orden ASC, nombre")
        rutas = await conn.fetch("SELECT id, nombre FROM prod_rutas_produccion ORDER BY nombre")
        # Modelos que realmente aparecen en registros activos:
        # mezcla catálogo (prod_modelos) + manuales (modelo_manual->>'nombre_modelo')
        # Se usa el NOMBRE como identificador para que el filtro matchee a ambos.
        modelos = await conn.fetch("""
            SELECT DISTINCT nombre
            FROM (
                SELECT m.nombre
                FROM prod_registros r
                JOIN prod_modelos m ON m.id = r.modelo_id
                WHERE r.estado_op IN ('ABIERTA','EN_PROCESO')
                UNION
                SELECT r.modelo_manual->>'nombre_modelo' AS nombre
                FROM prod_registros r
                WHERE r.estado_op IN ('ABIERTA','EN_PROCESO')
                  AND r.modelo_manual IS NOT NULL
                  AND r.modelo_manual->>'nombre_modelo' IS NOT NULL
                  AND r.modelo_manual->>'nombre_modelo' <> ''
            ) t
            WHERE nombre IS NOT NULL AND nombre <> ''
            ORDER BY nombre
        """)
        estados = await conn.fetch("""
            SELECT DISTINCT estado FROM prod_registros WHERE estado_op IN ('ABIERTA','EN_PROCESO') ORDER BY estado
        """)
        # Tipos de producto (ej. polo, pantalón, casaca) — útil para filtrar el WIP
        tipos = await conn.fetch("""
            SELECT id, nombre FROM prod_tipos ORDER BY nombre
        """)

        return {
            "servicios": [{"id": r["id"], "nombre": r["nombre"]} for r in servicios],
            "rutas": [{"id": r["id"], "nombre": r["nombre"]} for r in rutas],
            "tipos": [{"id": r["id"], "nombre": r["nombre"]} for r in tipos],
            # id = nombre para que el filtro envíe el nombre como valor
            "modelos": [{"id": r["nombre"], "nombre": r["nombre"]} for r in modelos],
            "estados": [r["estado"] for r in estados],
        }



# ==================== 9. MATRIZ DINÁMICA ====================

@router.get("/matriz")
async def matriz_produccion(
    empresa_id: int = Query(7),
    ruta_id: Optional[str] = None,
    marca_id: Optional[str] = None,
    tipo_id: Optional[str] = None,
    entalle_id: Optional[str] = None,
    tela_id: Optional[str] = None,
    hilo_id: Optional[str] = None,
    modelo_id: Optional[str] = None,
    estado: Optional[str] = None,
    solo_atrasados: bool = False,
    solo_activos: bool = True,
    solo_fraccionados: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """
    Matriz dinámica de producción.
    Filas = Item (Marca-Tipo-Entalle-Tela) + Hilo.
    Columnas = Estados de producción (dinámicos según ruta).
    Valores = Registros y Prendas por celda.

    Regla fraccionados: Se incluyen TODOS los registros (padres y hijos).
    Las prendas de prod_registro_tallas ya reflejan la distribución correcta
    tras la división, por lo que no hay duplicación.

    Regla prendas: Se usa SUM(prod_registro_tallas.cantidad_real).
    Si no existe detalle en la tabla, se hace fallback a la suma del campo
    JSONB tallas del registro.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # ── 1. Determinar columnas base (estados de rutas) ─────────
        if ruta_id:
            ruta_row = await conn.fetchrow(
                "SELECT etapas FROM prod_rutas_produccion WHERE id = $1", ruta_id
            )
            if not ruta_row:
                raise HTTPException(status_code=404, detail="Ruta no encontrada")
            etapas_ruta = parse_jsonb(ruta_row["etapas"])
            columnas = [
                e["nombre"] for e in etapas_ruta if e.get("aparece_en_estado")
            ]
        else:
            # Sin filtro de ruta: unir etapas visibles de TODAS las rutas activas,
            # deduplicar, y ordenar por posición promedio.
            all_rutas = await conn.fetch("SELECT etapas FROM prod_rutas_produccion")
            col_positions = {}  # nombre -> list of positions
            for rr in all_rutas:
                etapas = parse_jsonb(rr["etapas"])
                pos = 0
                for e in etapas:
                    if e.get("aparece_en_estado"):
                        name = e["nombre"]
                        col_positions.setdefault(name, []).append(pos)
                        pos += 1
            # Ordenar por posición promedio
            columnas = sorted(
                col_positions.keys(),
                key=lambda n: sum(col_positions[n]) / len(col_positions[n]),
            )

        if not columnas:
            columnas = ["Sin estado"]

        # ── 2. Query principal: un registro por fila ──────────────
        where_clauses = ["r.empresa_id = $1"]
        params = [empresa_id]

        async def catalog_nombre(tabla: str, valor_id: str) -> Optional[str]:
            if not valor_id:
                return None
            row = await conn.fetchrow(f"SELECT nombre FROM {tabla} WHERE id = $1", valor_id)
            return row["nombre"] if row else None

        async def add_catalog_filter(
            tabla: str,
            selected_id: Optional[str],
            catalog_col: str,
            manual_id_key: str,
            manual_text_key: str,
        ):
            if not selected_id:
                return
            params.append(selected_id)
            id_idx = len(params)
            parts = [
                f"{catalog_col} = ${id_idx}",
                f"r.modelo_manual->>'{manual_id_key}' = ${id_idx}",
            ]
            nombre = await catalog_nombre(tabla, selected_id)
            if nombre:
                params.append(nombre)
                txt_idx = len(params)
                parts.append(f"r.modelo_manual->>'{manual_text_key}' = ${txt_idx}")
            where_clauses.append("(" + " OR ".join(parts) + ")")

        if solo_activos:
            where_clauses.append("r.estado_op IN ('ABIERTA','EN_PROCESO')")

        if ruta_id:
            params.append(ruta_id)
            where_clauses.append(f"m.ruta_produccion_id = ${len(params)}")
        await add_catalog_filter("prod_marcas", marca_id, "m.marca_id", "marca_id", "marca_texto")
        await add_catalog_filter("prod_tipos", tipo_id, "m.tipo_id", "tipo_id", "tipo_texto")
        await add_catalog_filter("prod_entalles", entalle_id, "m.entalle_id", "entalle_id", "entalle_texto")
        await add_catalog_filter("prod_telas", tela_id, "m.tela_id", "tela_id", "tela_texto")
        await add_catalog_filter("prod_hilos", hilo_id, "m.hilo_id", "hilo_id", "hilo_texto")
        if modelo_id:
            params.append(modelo_id)
            idx = len(params)
            where_clauses.append(
                f"(r.modelo_id = ${idx} OR m.nombre = ${idx} OR r.modelo_manual->>'nombre_modelo' = ${idx})"
            )
        if estado:
            params.append(estado)
            where_clauses.append(f"r.estado = ${len(params)}")
        if solo_atrasados:
            where_clauses.append(
                "(r.fecha_entrega_final < CURRENT_DATE OR EXISTS ("
                "SELECT 1 FROM prod_movimientos_produccion mp "
                "WHERE mp.registro_id = r.id "
                "AND mp.fecha_esperada_movimiento < CURRENT_DATE "
                "AND mp.fecha_fin IS NULL))"
            )
        if solo_fraccionados:
            where_clauses.append(
                "(r.dividido_desde_registro_id IS NOT NULL OR EXISTS ("
                "SELECT 1 FROM prod_registros ch WHERE ch.dividido_desde_registro_id = r.id))"
            )

        where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

        rows = await conn.fetch(f"""
            SELECT
                r.id, r.n_corte, r.estado, r.estado_op, r.urgente,
                r.fecha_entrega_final, r.tallas as tallas_jsonb,
                r.dividido_desde_registro_id,
                r.curva,
                r.fecha_creacion,
                r.distribucion_colores as dist_colores_raw,
                COALESCE(ma.id, mma.id, '')   as marca_id,
                COALESCE(ma.nombre, mma.nombre, r.modelo_manual->>'marca_texto', 'Sin marca')  as marca,
                COALESCE(tp.id, mtp.id, '')   as tipo_id_val,
                COALESCE(tp.nombre, mtp.nombre, r.modelo_manual->>'tipo_texto', 'Sin tipo')   as tipo,
                COALESCE(en.id, men.id, '')   as entalle_id_val,
                COALESCE(en.nombre, men.nombre, r.modelo_manual->>'entalle_texto', 'Sin entalle') as entalle,
                COALESCE(te.id, mte.id, '')   as tela_id_val,
                COALESCE(te.nombre, mte.nombre, r.modelo_manual->>'tela_texto', 'Sin tela')   as tela,
                COALESCE(hi.id, mhi.id, '')   as hilo_id_val,
                COALESCE(hi.nombre, mhi.nombre, r.modelo_manual->>'hilo_texto', 'Sin hilo')   as hilo,
                COALESCE(he.nombre, mhe.nombre, r.modelo_manual->>'hilo_especifico_texto', '')   as hilo_especifico,
                COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo')  as modelo_nombre,
                rp.nombre as ruta_nombre,
                COALESCE(rt_sum.prendas, 0) as prendas_tabla,
                COALESCE(CURRENT_DATE - mov_first.primera_fecha, 0) as dias_proceso,
                mov_first.primera_fecha as fecha_inicio_prod,
                COALESCE(mov_ult.ult_servicio, '') as ult_mov_servicio,
                mov_ult.ult_fecha_inicio as ult_mov_fecha,
                COALESCE(mov_ult.ult_persona, '') as ult_mov_persona,
                COALESCE(mov_agg.diferencia_total, 0) as diferencia_acumulada,
                COALESCE(mov_agg.total_movimientos, 0) as total_movimientos,
                COALESCE(inc.total_abiertas, 0) as incidencias_abiertas,
                COALESCE(inc.detalle, '') as incidencias_detalle,
                COALESCE(inc.lista, '[]'::jsonb) as incidencias_lista
            FROM prod_registros r
            LEFT JOIN prod_modelos m  ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma  ON m.marca_id = ma.id
            LEFT JOIN prod_tipos tp   ON m.tipo_id = tp.id
            LEFT JOIN prod_entalles en ON m.entalle_id = en.id
            LEFT JOIN prod_telas te   ON m.tela_id = te.id
            LEFT JOIN prod_hilos hi   ON m.hilo_id = hi.id
            LEFT JOIN prod_hilos_especificos he ON he.id = COALESCE(m.hilo_especifico_id, r.hilo_especifico_id)
            LEFT JOIN prod_marcas mma ON (r.modelo_manual->>'marca_id') = mma.id
            LEFT JOIN prod_tipos mtp  ON (r.modelo_manual->>'tipo_id') = mtp.id
            LEFT JOIN prod_entalles men ON (r.modelo_manual->>'entalle_id') = men.id
            LEFT JOIN prod_telas mte  ON (r.modelo_manual->>'tela_id') = mte.id
            LEFT JOIN prod_hilos mhi  ON (r.modelo_manual->>'hilo_id') = mhi.id
            LEFT JOIN prod_hilos_especificos mhe ON (r.modelo_manual->>'hilo_especifico_id') = mhe.id
            LEFT JOIN prod_rutas_produccion rp ON m.ruta_produccion_id = rp.id
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(rt.cantidad_real), 0) as prendas
                FROM prod_registro_tallas rt WHERE rt.registro_id = r.id
            ) rt_sum ON true
            LEFT JOIN LATERAL (
                SELECT MIN(mp0.fecha_inicio) as primera_fecha
                FROM prod_movimientos_produccion mp0
                WHERE mp0.registro_id = r.id AND mp0.fecha_inicio IS NOT NULL
            ) mov_first ON true
            LEFT JOIN LATERAL (
                -- Trae el movimiento del servicio cuyo nombre coincide con el estado
                -- actual del registro (normalizando tildes). Si el estado no es un
                -- servicio (ej: "Tienda", "Almacen PT"), no devuelve nada.
                SELECT sp.nombre as ult_servicio,
                       mp.fecha_inicio as ult_fecha_inicio,
                       pp.nombre as ult_persona
                FROM prod_movimientos_produccion mp
                LEFT JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id
                LEFT JOIN prod_personas_produccion pp ON mp.persona_id = pp.id
                WHERE mp.registro_id = r.id
                  AND r.estado IS NOT NULL
                  AND sp.nombre IS NOT NULL
                  AND TRANSLATE(LOWER(sp.nombre), 'áéíóúñ', 'aeioun')
                      = TRANSLATE(LOWER(r.estado), 'áéíóúñ', 'aeioun')
                ORDER BY mp.fecha_inicio DESC NULLS LAST, mp.created_at DESC
                LIMIT 1
            ) mov_ult ON true
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(mp2.diferencia), 0) as diferencia_total,
                       COUNT(*) as total_movimientos
                FROM prod_movimientos_produccion mp2
                WHERE mp2.registro_id = r.id
            ) mov_agg ON true
            LEFT JOIN LATERAL (
                -- Incidencias abiertas del registro + lista detallada (con
                -- paralización si aplica) para mostrar en el popover de la matriz.
                SELECT COUNT(*) AS total_abiertas,
                       STRING_AGG(
                         COALESCE(mi.nombre, 'Sin motivo')
                         || CASE WHEN i.comentario IS NOT NULL AND i.comentario <> ''
                                 THEN ': ' || i.comentario ELSE '' END,
                         ' · ' ORDER BY i.created_at DESC
                       ) AS detalle,
                       JSONB_AGG(
                         JSONB_BUILD_OBJECT(
                           'id',                  i.id,
                           'tipo_id',             i.tipo,
                           'tipo_nombre',         COALESCE(mi.nombre, 'Sin motivo'),
                           'comentario',          i.comentario,
                           'estado',              i.estado,
                           'usuario',             i.usuario,
                           'fecha_hora',          i.fecha_hora,
                           'paraliza',            COALESCE(i.paraliza, FALSE),
                           'paralizacion_activa', COALESCE(p.activa, FALSE),
                           'paralizacion_inicio', p.fecha_inicio,
                           'paralizacion_fin',    p.fecha_fin,
                           'paralizacion_motivo', p.motivo,
                           'avances',             COALESCE(av.lista, '[]'::jsonb)
                         )
                         ORDER BY i.created_at DESC
                       ) AS lista
                FROM prod_incidencia i
                LEFT JOIN prod_motivos_incidencia mi ON mi.id = i.tipo
                LEFT JOIN prod_paralizacion p ON p.id = i.paralizacion_id
                LEFT JOIN LATERAL (
                    -- Timeline de avances/seguimiento de la incidencia
                    -- (más antiguo → más nuevo para leer cronológicamente).
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'id',         a.id,
                            'fecha',      a.fecha,
                            'usuario',    a.usuario,
                            'comentario', a.comentario
                        )
                        ORDER BY COALESCE(a.fecha, a.created_at) ASC
                    ) AS lista
                    FROM prod_incidencia_avance a
                    WHERE a.incidencia_id = i.id
                ) av ON true
                WHERE i.registro_id = r.id AND i.estado = 'ABIERTA'
            ) inc ON true
            WHERE {where_sql}
            ORDER BY
                COALESCE(ma.nombre, mma.nombre, r.modelo_manual->>'marca_texto'),
                COALESCE(tp.nombre, mtp.nombre, r.modelo_manual->>'tipo_texto'),
                COALESCE(en.nombre, men.nombre, r.modelo_manual->>'entalle_texto'),
                COALESCE(te.nombre, mte.nombre, r.modelo_manual->>'tela_texto'),
                COALESCE(hi.nombre, mhi.nombre, r.modelo_manual->>'hilo_texto'),
                r.n_corte
        """, *params)

        # Alinear columnas con los estados reales del resultado. Las rutas pueden
        # tener variantes sin tilde ("Lavanderia") mientras los registros guardan
        # el estado con tilde ("Lavanderia"). Si no se corrige aquí, el total sí
        # cuenta esos registros pero la celda queda invisible en la UI.
        estados_resultado = []
        seen_estados = set()
        for row in rows:
            est = row["estado"] or "Sin estado"
            if est not in seen_estados:
                seen_estados.add(est)
                estados_resultado.append(est)

        estados_por_norm = {normalize_label(e): e for e in estados_resultado}
        columnas_alineadas = []
        seen_norm = set()
        for col in columnas:
            norm = normalize_label(col)
            col_real = estados_por_norm.get(norm, col)
            real_norm = normalize_label(col_real)
            if real_norm and real_norm not in seen_norm:
                columnas_alineadas.append(col_real)
                seen_norm.add(real_norm)

        orden_norm = {normalize_label(e): i for i, e in enumerate(ESTADOS_MATRIZ_ORDEN)}
        extras = [
            e for e in estados_resultado
            if normalize_label(e) not in seen_norm
        ]
        extras.sort(key=lambda e: (orden_norm.get(normalize_label(e), 999), e))
        columnas = columnas_alineadas + extras
        if not columnas:
            columnas = ["Sin estado"]

        # ── 3. Calcular prendas con fallback ──────────────────────
        def calc_prendas(row):
            """prod_registro_tallas primero; fallback a JSONB tallas."""
            p = safe_int(row["prendas_tabla"])
            if p > 0:
                return p
            tallas = parse_jsonb(row["tallas_jsonb"])
            return sum(safe_int(t.get("cantidad", 0)) for t in tallas)

        # ── 3b. Cargar mapeo color_id -> color_general_nombre ──────
        color_gen_map = {}  # color_id -> color_general_nombre
        cat_rows = await conn.fetch("""
            SELECT cc.id as color_id, cc.nombre as color_nombre, COALESCE(cg.nombre, '') as color_general_nombre
            FROM prod_colores_catalogo cc
            LEFT JOIN prod_colores_generales cg ON cc.color_general_id = cg.id
        """)
        for cr in cat_rows:
            color_gen_map[cr["color_id"]] = cr["color_general_nombre"]
            color_gen_map[cr["color_nombre"]] = cr["color_general_nombre"]

        # ── 4. Agrupar en memoria ─────────────────────────────────
        # Clave de agrupación: (marca, tipo, entalle, tela, hilo)
        groups = {}   # key -> {celdas, detalle, meta}
        for r in rows:
            key = (r["marca"], r["tipo"], r["entalle"], r["tela"], r["hilo"])
            prendas = calc_prendas(r)
            est = r["estado"]

            if key not in groups:
                groups[key] = {
                    "marca": r["marca"],
                    "tipo": r["tipo"],
                    "entalle": r["entalle"],
                    "tela": r["tela"],
                    "hilo": r["hilo"],
                    "item": f"{r['marca']} - {r['tipo']} - {r['entalle']} - {r['tela']}",
                    "celdas": {},
                    "total": {"registros": 0, "prendas": 0},
                    "detalle": [],
                    "colores_grupo": {},
                }
            g = groups[key]

            # Celda
            if est not in g["celdas"]:
                g["celdas"][est] = {"registros": 0, "prendas": 0}
            g["celdas"][est]["registros"] += 1
            g["celdas"][est]["prendas"] += prendas

            # Total fila
            g["total"]["registros"] += 1
            g["total"]["prendas"] += prendas

            # Detalle enriquecido
            tallas_raw = parse_jsonb(r["tallas_jsonb"])
            curva_detalle = [
                {"talla": t.get("talla_nombre", ""), "cantidad": safe_int(t.get("cantidad", 0))}
                for t in tallas_raw
            ]

            # Colores: agregar desde distribucion_colores (JSONB por talla)
            dist_colores = parse_jsonb(r["dist_colores_raw"])
            colores_map = {}  # color_nombre -> {cantidad, color_general}
            for talla_entry in dist_colores:
                for c in (talla_entry.get("colores") or []):
                    cn = c.get("color_nombre", "")
                    if cn:
                        if cn not in colores_map:
                            cg = color_gen_map.get(c.get("color_id", ""), "") or color_gen_map.get(cn, "")
                            colores_map[cn] = {"cantidad": 0, "color_general": cg}
                        colores_map[cn]["cantidad"] += safe_int(c.get("cantidad", 0))
            colores_lista = [{"color": k, "color_general": v["color_general"], "cantidad": v["cantidad"]} for k, v in colores_map.items()]
            colores_resumen = ", ".join(colores_map.keys()) if colores_map else ""

            g["detalle"].append({
                "id": r["id"],
                "n_corte": r["n_corte"],
                "estado": est,
                "prendas": prendas,
                "modelo": r["modelo_nombre"],
                "ruta": r["ruta_nombre"],
                "urgente": r["urgente"],
                "es_hijo": r["dividido_desde_registro_id"] is not None,
                "fecha_entrega": str(r["fecha_entrega_final"]) if r["fecha_entrega_final"] else None,
                "fecha_inicio_prod": str(r["fecha_inicio_prod"]) if r["fecha_inicio_prod"] else None,
                "curva": r["curva"] or "",
                "curva_detalle": curva_detalle,
                "hilo_especifico": r["hilo_especifico"],
                "dias_proceso": safe_int(r["dias_proceso"]),
                "ult_mov_servicio": r["ult_mov_servicio"],
                "ult_mov_fecha": str(r["ult_mov_fecha"]) if r["ult_mov_fecha"] else None,
                "ult_mov_persona": r["ult_mov_persona"] or None,
                "diferencia_acumulada": safe_int(r["diferencia_acumulada"]),
                "total_movimientos": safe_int(r["total_movimientos"]),
                "incidencias_abiertas": safe_int(r["incidencias_abiertas"]),
                "incidencias_detalle": (r["incidencias_detalle"] or "").strip() or None,
                "incidencias_lista": parse_jsonb(r["incidencias_lista"]) or [],
                "colores": colores_lista,
                "colores_resumen": colores_resumen,
            })

            # Acumular colores a nivel de grupo
            for cn, info in colores_map.items():
                if cn not in g["colores_grupo"]:
                    g["colores_grupo"][cn] = {"cantidad": 0, "color_general": info["color_general"], "registros": 0}
                g["colores_grupo"][cn]["cantidad"] += info["cantidad"]
                g["colores_grupo"][cn]["registros"] += 1

        # ── 5. Construir respuesta ────────────────────────────────
        filas = list(groups.values())
        # Convertir colores_grupo dict a lista legible
        for f in filas:
            cg = f.pop("colores_grupo", {})
            f["colores"] = [{"color": k, "color_general": v["color_general"], "cantidad": v["cantidad"], "registros": v["registros"]} for k, v in cg.items()]
            f["colores_resumen"] = ", ".join(cg.keys()) if cg else ""

        # Totales por columna
        totales_columna = {}
        total_general = {"registros": 0, "prendas": 0}
        for f in filas:
            for col, vals in f["celdas"].items():
                if col not in totales_columna:
                    totales_columna[col] = {"registros": 0, "prendas": 0}
                totales_columna[col]["registros"] += vals["registros"]
                totales_columna[col]["prendas"] += vals["prendas"]
            total_general["registros"] += f["total"]["registros"]
            total_general["prendas"] += f["total"]["prendas"]

        # ── 6. Filtros disponibles para el frontend ───────────────
        marcas = await conn.fetch("SELECT id, nombre FROM prod_marcas ORDER BY nombre")
        tipos = await conn.fetch("SELECT id, nombre FROM prod_tipos ORDER BY nombre")
        entalles = await conn.fetch("SELECT id, nombre FROM prod_entalles ORDER BY nombre")
        telas = await conn.fetch("SELECT id, nombre FROM prod_telas ORDER BY nombre")
        hilos = await conn.fetch("SELECT id, nombre FROM prod_hilos ORDER BY nombre")
        rutas = await conn.fetch("SELECT id, nombre FROM prod_rutas_produccion ORDER BY nombre")
        modelos = await conn.fetch("SELECT id, nombre FROM prod_modelos ORDER BY nombre")

        return {
            "columnas": columnas,
            "filas": filas,
            "totales_columna": totales_columna,
            "total_general": total_general,
            "filtros_disponibles": {
                "marcas": [{"id": r["id"], "nombre": r["nombre"]} for r in marcas],
                "tipos": [{"id": r["id"], "nombre": r["nombre"]} for r in tipos],
                "entalles": [{"id": r["id"], "nombre": r["nombre"]} for r in entalles],
                "telas": [{"id": r["id"], "nombre": r["nombre"]} for r in telas],
                "hilos": [{"id": r["id"], "nombre": r["nombre"]} for r in hilos],
                "rutas": [{"id": r["id"], "nombre": r["nombre"]} for r in rutas],
                "modelos": [{"id": r["id"], "nombre": r["nombre"]} for r in modelos],
            },
        }


# ==================== FICHA DETALLADA POR ÍTEM (color × talla) ====================

@router.get("/ficha-item")
async def ficha_item_detail(
    ids: str = Query(..., description="IDs de registros separados por coma"),
    empresa_id: int = Query(7),
    ocultar_liquidacion: bool = Query(
        True,
        description=(
            "Si True (default), oculta modelos con sufijo -LQ (liquidaciones) en "
            "Almacén PT/Tienda y en PT sin clasificar. No afecta cortes en taller/lavandería."
        ),
    ),
):
    """
    Devuelve la ficha color × talla de un ítem:
    - grupos_taller:      cortes en etapas pre-lavandería (n_corte × talla)
    - colores_lavanderia: colores asignados en lavandería (color × talla)
    - colores_almacen:    colores en almacén PT + tienda  (color × talla)
    - sin_color:          cortes en etapas post-lavandería sin colores asignados
    """
    # Heurística de modelos -LQ: termina con "-LQ", o contiene "-LQ " o "-LQ-".
    # Aplica solo si `ocultar_liquidacion` está activo. Pensado para filtrar
    # variantes de liquidación que ya no son producción activa.
    def _es_liquidacion(nombre: str) -> bool:
        if not nombre:
            return False
        s = nombre.upper()
        return s.endswith("-LQ") or "-LQ " in s or "-LQ-" in s
    id_list = [i.strip() for i in (ids or "").split(",") if i.strip()]
    if not id_list:
        return {"tallas": [], "grupos_taller": [], "colores_lavanderia": [], "colores_almacen": [], "sin_color": [], "con_color": []}

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                r.id,
                r.n_corte,
                r.estado,
                r.distribucion_colores,
                r.tallas AS tallas_jsonb,
                r.colores_aprobados,
                r.colores_aprobados_at,
                r.colores_aprobados_por,
                COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON m.id = r.modelo_id
            WHERE r.id = ANY($1::varchar[])
              AND r.empresa_id = $2
            ORDER BY r.n_corte
        """, id_list, empresa_id)

        tallas_cat = await conn.fetch(
            "SELECT nombre, orden FROM prod_tallas_catalogo ORDER BY orden"
        )

    talla_orden = {t["nombre"]: t["orden"] for t in tallas_cat}

    ESTADOS_TALLER   = {"Para Lavanderia", "Para Atraque", "Atraque", "Muestra Lavanderia"}
    # Proceso intermedio: en lavandería y/o acabado. Ahí debe poder asignarse el color.
    ESTADOS_LAV      = {"Lavanderia", "Para Acabado", "Acabado"}
    # Stock en almacén: producto listo / en almacén. La tienda se trae directo
    # de Odoo (stock_quant) para evitar doble conteo con los registros.
    ESTADOS_ALMACEN  = {"Producto Terminado", "Almacen PT"}

    estrella_set: set = set()  # colores ⭐ de la regla aplicable; se llena dentro de "if rows:"
    all_tallas: set = set()
    grupos_taller: list = []
    colores_lav: dict = {}   # color_nombre (UPPERCASE) -> {talla_nombre -> cantidad}
    colores_alm: dict = {}   # color_nombre (UPPERCASE) -> {talla_nombre -> cantidad}
    sin_color: list = []
    con_color: list = []
    fuera_regla_lav: dict = {}
    fuera_regla_alm: dict = {}

    # Normaliza nombre de color para comparaciones y deduplicación.
    # Datos provienen de 3 fuentes con casing distinto:
    #   - prod_colores_catalogo (UPPERCASE)
    #   - distribucion_colores JSONB (formato Title Case del frontend)
    #   - prod_odoo_color_mapping (UPPERCASE del catálogo)
    # Sin normalizar, "Carbon" y "CARBON" generan dos filas duplicadas.
    def _nc(name):
        return (name or '').strip().upper()

    for r in rows:
        estado = r["estado"] or "Sin estado"
        dist_raw = parse_jsonb(r["distribucion_colores"])
        # ¿Este corte es de un modelo -LQ? Solo se usa para excluirlo de la matriz
        # de Almacén PT/Tienda cuando `ocultar_liquidacion` está activo. Los cortes
        # en taller / lavandería se siguen mostrando sin importar el flag.
        es_lq = ocultar_liquidacion and _es_liquidacion(r["modelo_nombre"])

        talla_totales: dict = {}
        # cantidades asignadas a colores por talla (para chequear distribución 100%)
        asignado_por_talla: dict = {}
        has_colors = False
        # Resumen color -> cantidad para este corte (usado en con_color)
        colores_por_corte: dict = {}

        for entry in dist_raw:
            tn = entry.get("talla_nombre") or str(entry.get("talla_id", ""))
            ct = safe_int(entry.get("cantidad_total", 0))
            colores_entry = entry.get("colores") or []

            if tn:
                talla_totales[tn] = talla_totales.get(tn, 0) + ct
                all_tallas.add(tn)

            for c in colores_entry:
                cn = _nc(c.get("color_nombre"))
                qty = safe_int(c.get("cantidad", 0))
                if not cn or qty == 0:
                    continue
                has_colors = True
                if tn:
                    all_tallas.add(tn)
                    asignado_por_talla[tn] = asignado_por_talla.get(tn, 0) + qty
                colores_por_corte[cn] = colores_por_corte.get(cn, 0) + qty

                if estado in ESTADOS_LAV:
                    if cn not in colores_lav:
                        colores_lav[cn] = {}
                    colores_lav[cn][tn] = colores_lav[cn].get(tn, 0) + qty

                elif estado in ESTADOS_ALMACEN:
                    # Excluye liquidaciones (-LQ) de la matriz de Almacén PT/Tienda
                    if es_lq:
                        continue
                    if cn not in colores_alm:
                        colores_alm[cn] = {}
                    colores_alm[cn][tn] = colores_alm[cn].get(tn, 0) + qty

        if estado in ESTADOS_TALLER:
            # Fallback a tallas_jsonb si distribucion_colores vacía
            if not talla_totales:
                for t in parse_jsonb(r["tallas_jsonb"]):
                    tn = t.get("talla_nombre", "")
                    qty = safe_int(t.get("cantidad", 0))
                    if tn:
                        talla_totales[tn] = qty
                        all_tallas.add(tn)
            # ¿Distribución de colores al 100%? Hay colores asignados Y, para cada
            # talla con cantidad_total > 0, la suma asignada a colores iguala el
            # total. Si una talla tiene total=0, se ignora.
            tallas_con_total = [(tn, tot) for tn, tot in talla_totales.items() if tot > 0]
            colores_completos = bool(has_colors) and bool(tallas_con_total) and all(
                asignado_por_talla.get(tn, 0) == tot for tn, tot in tallas_con_total
            )
            grupos_taller.append({
                "id": r["id"],
                "n_corte": r["n_corte"],
                "modelo": r["modelo_nombre"] or "",
                "estado": estado,
                "tallas": talla_totales,
                "colores_completos": colores_completos,
                "colores_aprobados": bool(r["colores_aprobados"]),
                "colores_aprobados_at": r["colores_aprobados_at"].isoformat() if r["colores_aprobados_at"] else None,
                "colores_aprobados_por": r["colores_aprobados_por"],
            })

        elif estado in ESTADOS_LAV and not has_colors:
            # Sin colores y debería tenerlos: está en lavandería / acabado.
            prendas = sum(talla_totales.values())
            if prendas == 0:
                prendas = sum(safe_int(t.get("cantidad", 0)) for t in parse_jsonb(r["tallas_jsonb"]))
            sin_color.append({
                "id": r["id"],
                "n_corte": r["n_corte"],
                "modelo": r["modelo_nombre"] or "",
                "estado": estado,
                "prendas": prendas,
                "colores_aprobados": bool(r["colores_aprobados"]),
                "colores_aprobados_at": r["colores_aprobados_at"].isoformat() if r["colores_aprobados_at"] else None,
                "colores_aprobados_por": r["colores_aprobados_por"],
            })

        elif estado in ESTADOS_LAV and has_colors:
            # Con colores asignados en lavandería / acabado.
            prendas = sum(talla_totales.values())
            if prendas == 0:
                prendas = sum(safe_int(t.get("cantidad", 0)) for t in parse_jsonb(r["tallas_jsonb"]))
            colores_resumen = sorted(
                ({"color": k, "cantidad": v} for k, v in colores_por_corte.items()),
                key=lambda x: (-x["cantidad"], x["color"]),
            )
            con_color.append({
                "id": r["id"],
                "n_corte": r["n_corte"],
                "modelo": r["modelo_nombre"] or "",
                "estado": estado,
                "prendas": prendas,
                "colores": colores_resumen,
                "colores_aprobados": bool(r["colores_aprobados"]),
                "colores_aprobados_at": r["colores_aprobados_at"].isoformat() if r["colores_aprobados_at"] else None,
                "colores_aprobados_por": r["colores_aprobados_por"],
            })

    sorted_tallas = sorted(all_tallas, key=lambda t: (talla_orden.get(t, 999), t))

    # ── Asegurar que aparezcan todos los colores de la regla, aunque tengan
    #    cantidad 0, para que la vista los muestre como filas vacías.
    #    Además, en "Almacén PT / Tienda" sumamos también los colores que
    #    Odoo tiene clasificados para esta combinación marca/tipo/entalle/tela
    #    (prod_odoo_productos_enriq + prod_odoo_color_mapping).
    if rows:
        async with pool.acquire() as conn:
            ref = await conn.fetchrow("""
                SELECT
                    COALESCE(m.marca_id,   r.modelo_manual->>'marca_id')   AS marca_id,
                    COALESCE(m.tipo_id,    r.modelo_manual->>'tipo_id')    AS tipo_id,
                    COALESCE(m.entalle_id, r.modelo_manual->>'entalle_id') AS entalle_id,
                    COALESCE(m.tela_id,    r.modelo_manual->>'tela_id')    AS tela_id,
                    COALESCE(r.hilo_especifico_id, m.hilo_id,
                             r.modelo_manual->>'hilo_id')                  AS hilo_id
                FROM prod_registros r
                LEFT JOIN prod_modelos m ON m.id = r.modelo_id
                WHERE r.id = $1
            """, rows[0]["id"])

            rule_color_rows = await conn.fetch("""
                WITH candidatas AS (
                    SELECT r.id,
                           (CASE WHEN r.marca_id = $1 THEN 4
                                 WHEN r.marca_id IS NULL THEN 0 ELSE -100 END
                          + CASE WHEN r.tipo_id  = $2 THEN 2
                                 WHEN r.tipo_id IS NULL THEN 0 ELSE -100 END
                          + CASE WHEN COALESCE(jsonb_array_length(r.entalle_ids), 0) > 0
                                      AND $3::text IS NOT NULL
                                      AND r.entalle_ids ? $3 THEN 1
                                 WHEN COALESCE(jsonb_array_length(r.entalle_ids), 0) = 0 THEN 0
                                 ELSE -100 END
                          + CASE WHEN r.hilo_id = $4 THEN 1
                                 WHEN r.hilo_id IS NULL THEN 0 ELSE -100 END) AS score
                      FROM prod_color_reglas r
                     WHERE r.activo = TRUE
                       AND (r.marca_id IS NULL OR ($1::text IS NOT NULL AND r.marca_id = $1))
                       AND (r.tipo_id  IS NULL OR ($2::text IS NOT NULL AND r.tipo_id  = $2))
                       AND (COALESCE(jsonb_array_length(r.entalle_ids), 0) = 0
                            OR ($3::text IS NOT NULL AND r.entalle_ids ? $3))
                       AND (r.hilo_id  IS NULL OR ($4::text IS NOT NULL AND r.hilo_id  = $4))
                ),
                mejor_score AS (
                    SELECT MAX(score) AS s FROM candidatas WHERE score >= 0
                )
                SELECT cc.nombre, COALESCE(cc.orden, 0) AS orden,
                       BOOL_OR(COALESCE(rc.es_estrella, FALSE)) AS es_estrella
                  FROM candidatas c
                  JOIN mejor_score m ON c.score = m.s
                  JOIN prod_color_regla_colores rc ON rc.regla_id = c.id
                  JOIN prod_colores_catalogo cc ON cc.id = rc.color_id
                 GROUP BY cc.nombre, cc.orden
                 ORDER BY orden, cc.nombre
            """, ref["marca_id"], ref["tipo_id"], ref["entalle_id"], ref["hilo_id"])

            # Si la regla no devolvió nada, usar todo el catálogo activo como fallback.
            has_rule_match = bool(rule_color_rows)
            if not rule_color_rows:
                rule_color_rows = await conn.fetch("""
                    SELECT nombre, COALESCE(orden, 0) AS orden
                      FROM prod_colores_catalogo
                     ORDER BY orden, nombre
                """)

            # Colores extra de Odoo PT clasificados con esta marca/tipo/entalle/tela.
            # Aceptamos 'clasificado' y 'parcial' (al menos algún campo encaja).
            # Puede no existir la tabla enriq o el mapping; lo ejecutamos con try.
            odoo_color_rows = []
            odoo_stock_rows = []
            odoo_sin_clasificar_rows = []
            try:
                # Filtro -LQ aplicable a pt.name. Cuando ocultar_liquidacion=False,
                # el predicado es TRUE para todos los registros (no filtra).
                # El número de placeholder varía por query (se inyecta como Python str).
                def _lq_predicate(n):
                    return (
                        f"(NOT ${n}::bool OR ("
                        f" pt.name NOT ILIKE '%-LQ'"
                        f" AND pt.name NOT ILIKE '%-LQ %'"
                        f" AND pt.name NOT ILIKE '%-LQ-%'"
                        f"))"
                    )

                odoo_color_rows = await conn.fetch(f"""
                    SELECT DISTINCT cc.nombre, COALESCE(cc.orden, 0) AS orden
                      FROM prod_odoo_productos_enriq enr
                      JOIN odoo.product_product pp ON pp.product_tmpl_id = enr.odoo_template_id
                      JOIN odoo.product_template pt ON pt.odoo_id = enr.odoo_template_id
                      JOIN prod_odoo_color_mapping mc ON mc.odoo_product_id = pp.odoo_id
                      JOIN prod_colores_catalogo cc ON cc.id = mc.color_id
                     WHERE COALESCE(enr.estado, '') <> 'excluido'
                       AND ($1::text IS NULL OR enr.marca_id   = $1)
                       AND ($2::text IS NULL OR enr.tipo_id    = $2)
                       AND ($3::text IS NULL OR enr.entalle_id = $3)
                       AND ($4::text IS NULL OR enr.tela_id    = $4)
                       AND ($5::text IS NULL OR enr.hilo_id    = $5)
                       AND {_lq_predicate(6)}
                """, ref["marca_id"], ref["tipo_id"], ref["entalle_id"], ref["tela_id"],
                     ref["hilo_id"], bool(ocultar_liquidacion))

                # Stock real en tienda (stock_quant en locations con x_nombre válido)
                # por color × talla.
                odoo_stock_rows = await conn.fetch(f"""
                    SELECT cc.nombre AS color_nombre,
                           mc.talla_odoo AS talla_nombre,
                           SUM(sq.qty - COALESCE(sq.reserved_qty, 0))::int AS qty
                      FROM prod_odoo_productos_enriq enr
                      JOIN odoo.product_product pp ON pp.product_tmpl_id = enr.odoo_template_id
                      JOIN odoo.product_template pt ON pt.odoo_id = enr.odoo_template_id
                      JOIN prod_odoo_color_mapping mc ON mc.odoo_product_id = pp.odoo_id
                      JOIN prod_colores_catalogo cc ON cc.id = mc.color_id
                      JOIN odoo.stock_quant sq ON sq.product_id = pp.odoo_id
                      JOIN odoo.stock_location sl ON sl.odoo_id = sq.location_id
                     WHERE COALESCE(enr.estado, '') <> 'excluido'
                       AND ($1::text IS NULL OR enr.marca_id   = $1)
                       AND ($2::text IS NULL OR enr.tipo_id    = $2)
                       AND ($3::text IS NULL OR enr.entalle_id = $3)
                       AND ($4::text IS NULL OR enr.tela_id    = $4)
                       AND ($6::text IS NULL OR enr.hilo_id    = $6)
                       AND mc.talla_odoo IS NOT NULL
                       AND sl.x_nombre = ANY($5::text[])
                       AND {_lq_predicate(7)}
                     GROUP BY cc.nombre, mc.talla_odoo
                    HAVING SUM(sq.qty - COALESCE(sq.reserved_qty, 0)) > 0
                """, ref["marca_id"], ref["tipo_id"], ref["entalle_id"], ref["tela_id"],
                     list(TIENDAS_VALIDAS_X_NOMBRE), ref["hilo_id"], bool(ocultar_liquidacion))

                # PT de Odoo SIN color mapeado — agrupados por (template, color_odoo).
                # Le sumamos el stock real para que el usuario priorice los grandes.
                odoo_sin_clasificar_rows = await conn.fetch("""
                    WITH templates AS (
                        SELECT DISTINCT enr.odoo_template_id
                          FROM prod_odoo_productos_enriq enr
                         WHERE COALESCE(enr.estado,'') <> 'excluido'
                           AND ($1::text IS NULL OR enr.marca_id   = $1)
                           AND ($2::text IS NULL OR enr.tipo_id    = $2)
                           AND ($3::text IS NULL OR enr.entalle_id = $3)
                           AND ($4::text IS NULL OR enr.tela_id    = $4)
                           AND ($6::text IS NULL OR enr.hilo_id    = $6)
                    ),
                    variantes_sin_color AS (
                        SELECT t.odoo_template_id,
                               pt.name AS template_name,
                               vf.product_product_id,
                               vf.talla,
                               vf.color AS color_odoo
                          FROM templates t
                          JOIN odoo.v_product_variant_flat vf
                            ON vf.product_tmpl_id = t.odoo_template_id
                          JOIN odoo.product_template pt
                            ON pt.odoo_id = t.odoo_template_id
                          LEFT JOIN prod_odoo_color_mapping mc
                            ON mc.odoo_product_id = vf.product_product_id
                         WHERE mc.color_id IS NULL
                           AND vf.color IS NOT NULL
                           AND TRIM(vf.color) <> ''
                           AND (
                               NOT $7::bool OR (
                                   pt.name NOT ILIKE '%-LQ'
                                   AND pt.name NOT ILIKE '%-LQ %'
                                   AND pt.name NOT ILIKE '%-LQ-%'
                               )
                           )
                    ),
                    stock_variantes AS (
                        SELECT sq.product_id,
                               -- Solo tiendas reales (incluye TALLER). Excluye virtuales:
                               -- Customers, Ajuste, Proveedores, Fallados, AP, REMATE, etc.
                               SUM(sq.qty - COALESCE(sq.reserved_qty, 0)) AS stock
                          FROM odoo.stock_quant sq
                          JOIN odoo.stock_location sl ON sl.odoo_id = sq.location_id
                         WHERE sq.product_id IN (SELECT product_product_id FROM variantes_sin_color)
                           AND sl.x_nombre = ANY($5::text[])
                         GROUP BY sq.product_id
                    )
                    SELECT v.odoo_template_id AS template_id,
                           v.template_name,
                           v.color_odoo,
                           ARRAY_AGG(v.product_product_id ORDER BY v.talla) AS product_ids,
                           ARRAY_AGG(v.talla ORDER BY v.talla) AS tallas,
                           COALESCE(SUM(sv.stock), 0)::int AS stock_total
                      FROM variantes_sin_color v
                      LEFT JOIN stock_variantes sv ON sv.product_id = v.product_product_id
                     GROUP BY v.odoo_template_id, v.template_name, v.color_odoo
                    HAVING COALESCE(SUM(sv.stock), 0) > 0
                     ORDER BY stock_total DESC, v.template_name, v.color_odoo
                """, ref["marca_id"], ref["tipo_id"], ref["entalle_id"], ref["tela_id"],
                     list(TIENDAS_VALIDAS_X_NOMBRE), ref["hilo_id"], bool(ocultar_liquidacion))
            except Exception as _e:
                import logging
                logging.exception("ficha-item: error en queries Odoo (silenced)")
                odoo_color_rows = []
                odoo_stock_rows = []
                odoo_sin_clasificar_rows = []

        # Si la regla actual viene de una regla aplicable (no fallback al catálogo
        # completo), la usamos como FILTRO restrictivo: solo se muestran colores
        # incluidos en la regla. Los que tengan stock real fuera de la regla se
        # mueven a "fuera_regla" para informar al usuario sin contaminar la matriz.
        rule_color_set = {_nc(cr["nombre"]) for cr in rule_color_rows if cr.get("nombre")}
        # Set de nombres marcados como ⭐ estrella (subset de rule_color_set).
        # El fallback al catálogo no tiene es_estrella → keys ausentes evaluan a falso.
        estrella_set = {
            _nc(cr["nombre"]) for cr in rule_color_rows
            if cr.get("nombre") and cr.get("es_estrella")
        }

        if has_rule_match and rule_color_set:
            # Saca a "fuera_regla" lo que ya estaba en colores_lav/alm pero no encaja
            for cn in list(colores_lav.keys()):
                if cn not in rule_color_set:
                    fuera_regla_lav[cn] = colores_lav.pop(cn)
            for cn in list(colores_alm.keys()):
                if cn not in rule_color_set:
                    fuera_regla_alm[cn] = colores_alm.pop(cn)
            # Inyecta colores de la regla como filas vacías si no tienen cantidad
            for cn in rule_color_set:
                colores_lav.setdefault(cn, {})
                colores_alm.setdefault(cn, {})
            # Odoo PT clasificado: solo el subset que está en la regla
            for cr in odoo_color_rows:
                cn = _nc(cr["nombre"])
                if cn and cn in rule_color_set:
                    colores_alm.setdefault(cn, {})
        else:
            # Sin regla aplicable: comportamiento previo (no filtra)
            for cr in rule_color_rows:
                cn = _nc(cr["nombre"])
                if cn:
                    colores_lav.setdefault(cn, {})
                    colores_alm.setdefault(cn, {})
            for cr in odoo_color_rows:
                cn = _nc(cr["nombre"])
                if cn:
                    colores_alm.setdefault(cn, {})

        # Sumar el stock real de tienda (Odoo) en el cuadro Almacén PT / Tienda.
        # Si una talla viene de Odoo y no estaba antes, la añadimos al set global.
        # Si hay regla aplicable, los colores fuera de regla van a fuera_regla_alm
        # en vez de colores_alm.
        for sr in odoo_stock_rows:
            cn = _nc(sr["color_nombre"])
            tn = sr["talla_nombre"]
            qty = safe_int(sr["qty"])
            if not cn or not tn or qty == 0:
                continue
            all_tallas.add(tn)
            destino = colores_alm
            if has_rule_match and rule_color_set and cn not in rule_color_set:
                destino = fuera_regla_alm
            if cn not in destino:
                destino[cn] = {}
            destino[cn][tn] = destino[cn].get(tn, 0) + qty

    # Recomputar tallas ordenadas ahora que pueden haberse agregado las de Odoo
    sorted_tallas = sorted(all_tallas, key=lambda t: (talla_orden.get(t, 999), t))

    odoo_sin_clasificar = []
    if rows:
        for r in odoo_sin_clasificar_rows:
            odoo_sin_clasificar.append({
                "template_id": r["template_id"],
                "template_name": r["template_name"],
                "color_odoo": r["color_odoo"],
                "product_ids": list(r["product_ids"]) if r["product_ids"] else [],
                "tallas": list(r["tallas"]) if r["tallas"] else [],
                "stock_total": safe_int(r["stock_total"]),
            })

    # Scope (marca/tipo/entalle/tela/hilo) que define la regla aplicable.
    # El frontend lo usa para filtrar el catálogo de colores en popovers.
    scope = {}
    if rows:
        scope = {
            "marca_id":   ref["marca_id"],
            "tipo_id":    ref["tipo_id"],
            "entalle_id": ref["entalle_id"],
            "tela_id":    ref["tela_id"],
            "hilo_id":    ref["hilo_id"],
        }

    # Muestras de lavandería — visibles mientras NO se cumplan las DOS condiciones:
    #   (A) el corte ya salió de taller (avanzó a Lavandería o más adelante), Y
    #   (B) todos los checks de los colores de la muestra están cerrados
    #       (decisión aprobado/rechazado en cada uno; estados aprobada/rechazada/parcial).
    # Si cualquiera de las dos no se cumple, la muestra sigue mostrándose:
    # - Corte aún en taller → siempre visible
    # - Corte avanzó pero la muestra está 'enviada' (sin retorno) o 'pendiente_decision'
    #   (algún color sin decisión) → sigue visible para que puedas cerrarla.
    muestras_payload = []
    cortes_taller_set = {g["id"] for g in grupos_taller}
    if id_list:
        async with pool.acquire() as conn:
            m_rows = await conn.fetch("""
                SELECT m.id, m.registro_id, m.fecha_envio, m.fecha_retorno,
                       m.destino, m.observaciones, m.created_at, m.created_by,
                       r.n_corte,
                       COALESCE(mo.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre
                  FROM prod_registro_muestras m
                  JOIN prod_registros r ON r.id = m.registro_id
                  LEFT JOIN prod_modelos mo ON mo.id = r.modelo_id
                 WHERE m.registro_id = ANY($1::varchar[])
                 ORDER BY m.fecha_envio DESC, m.id DESC
            """, id_list)
            if m_rows:
                color_rows = await conn.fetch("""
                    SELECT id, muestra_id, color_id, color_nombre, cantidad,
                           observaciones_envio,
                           decision, correcciones, decidido_at, decidido_por
                      FROM prod_registro_muestra_colores
                     WHERE muestra_id = ANY($1::int[])
                     ORDER BY id
                """, [m["id"] for m in m_rows])
                por_muestra: dict = {}
                for c in color_rows:
                    por_muestra.setdefault(c["muestra_id"], []).append({
                        "id": c["id"],
                        "color_id": c["color_id"],
                        "color_nombre": c["color_nombre"],
                        "cantidad": c["cantidad"],
                        "observaciones_envio": c["observaciones_envio"],
                        "decision": c["decision"],
                        "correcciones": c["correcciones"],
                        "decidido_at": c["decidido_at"].isoformat() if c["decidido_at"] else None,
                        "decidido_por": c["decidido_por"],
                    })
                for m in m_rows:
                    cols = por_muestra.get(m["id"], [])
                    if m["fecha_retorno"] is None:
                        estado = "enviada"
                    else:
                        deciciones = [c.get("decision") for c in cols]
                        pendientes = sum(1 for d in deciciones if d is None)
                        aprobados = sum(1 for d in deciciones if d == "aprobado")
                        rechazados = sum(1 for d in deciciones if d == "rechazado")
                        total = len(cols)
                        if pendientes > 0:
                            estado = "pendiente_decision"
                        elif total > 0 and aprobados == total:
                            estado = "aprobada"
                        elif total > 0 and rechazados == total:
                            estado = "rechazada"
                        else:
                            estado = "parcial"
                    # Filtro: ocultar si el corte ya salió de taller Y todos los checks
                    # están cerrados (estado ∈ {aprobada, rechazada, parcial}).
                    # 'enviada' y 'pendiente_decision' SIEMPRE se muestran porque
                    # todavía requieren acción del usuario.
                    en_taller = m["registro_id"] in cortes_taller_set
                    checks_completos = estado in ("aprobada", "rechazada", "parcial")
                    if not en_taller and checks_completos:
                        continue
                    muestras_payload.append({
                        "id": m["id"],
                        "registro_id": m["registro_id"],
                        "n_corte": m["n_corte"],
                        "modelo": m["modelo_nombre"] or "",
                        "fecha_envio": m["fecha_envio"].isoformat() if m["fecha_envio"] else None,
                        "fecha_retorno": m["fecha_retorno"].isoformat() if m["fecha_retorno"] else None,
                        "destino": m["destino"],
                        "observaciones": m["observaciones"],
                        "estado": estado,
                        "cantidad_total": sum(c["cantidad"] for c in cols),
                        "colores": cols,
                    })

    return {
        "tallas": sorted_tallas,
        "scope": scope,
        "grupos_taller": sorted(grupos_taller, key=lambda x: x.get("n_corte") or ""),
        "colores_lavanderia": [{"color": k, "tallas": v} for k, v in sorted(colores_lav.items())],
        "colores_almacen":    [
            {"color": k, "tallas": v, "es_estrella": k in estrella_set}
            for k, v in sorted(colores_alm.items())
        ],
        "fuera_regla_lavanderia": [{"color": k, "tallas": v} for k, v in sorted(fuera_regla_lav.items())],
        "fuera_regla_almacen":    [{"color": k, "tallas": v} for k, v in sorted(fuera_regla_alm.items())],
        "sin_color": sin_color,
        "con_color": con_color,
        "odoo_sin_clasificar": odoo_sin_clasificar,
        "muestras": muestras_payload,
    }


# ==================== ASIGNACIÓN DE COLORES POR REGISTRO ====================

@router.get("/registro-colores/{registro_id}")
async def get_registro_colores(registro_id: str):
    """
    Datos para la matriz de asignación color × talla de un registro:
    - modelo, n_corte, marca/tipo/entalle (para filtrar colores disponibles)
    - tallas con su cantidad_total (límite por columna)
    - distribucion_actual: lo ya asignado
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("""
            SELECT
                r.id, r.n_corte, r.estado,
                r.distribucion_colores,
                r.tallas AS tallas_jsonb,
                r.modelo_id,
                r.colores_aprobados,
                r.colores_aprobados_at,
                r.colores_aprobados_por,
                COALESCE(m.nombre,    r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
                COALESCE(m.marca_id,  r.modelo_manual->>'marca_id')      AS marca_id,
                COALESCE(m.tipo_id,   r.modelo_manual->>'tipo_id')       AS tipo_id,
                COALESCE(m.entalle_id,r.modelo_manual->>'entalle_id')    AS entalle_id,
                COALESCE(r.hilo_especifico_id, m.hilo_id,
                         r.modelo_manual->>'hilo_id')                    AS hilo_id
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON m.id = r.modelo_id
            WHERE r.id = $1
        """, registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # Sumar cantidad_real por talla (tabla normalizada). Fallback a tallas JSONB.
        talla_rows = await conn.fetch("""
            SELECT rt.talla_id, t.nombre AS talla_nombre, t.orden, SUM(rt.cantidad_real) AS cantidad
            FROM prod_registro_tallas rt
            JOIN prod_tallas_catalogo t ON t.id = rt.talla_id
            WHERE rt.registro_id = $1
            GROUP BY rt.talla_id, t.nombre, t.orden
            ORDER BY t.orden
        """, registro_id)

        tallas: list = []
        if talla_rows:
            tallas = [
                {"talla_id": r["talla_id"], "talla_nombre": r["talla_nombre"], "cantidad_total": safe_int(r["cantidad"])}
                for r in talla_rows
            ]
        else:
            for t in parse_jsonb(reg["tallas_jsonb"]):
                tid = t.get("talla_id")
                tn = t.get("talla_nombre") or ""
                qty = safe_int(t.get("cantidad", 0))
                if tid and qty > 0:
                    tallas.append({"talla_id": tid, "talla_nombre": tn, "cantidad_total": qty})

    distribucion_actual = parse_jsonb(reg["distribucion_colores"])

    return {
        "id": reg["id"],
        "n_corte": reg["n_corte"],
        "estado": reg["estado"],
        "modelo_id": reg["modelo_id"],
        "modelo_nombre": reg["modelo_nombre"],
        "marca_id": reg["marca_id"],
        "tipo_id": reg["tipo_id"],
        "entalle_id": reg["entalle_id"],
        "hilo_id": reg["hilo_id"],
        "tallas": tallas,
        "distribucion_actual": distribucion_actual,
        "colores_aprobados": bool(reg["colores_aprobados"]),
        "colores_aprobados_at": reg["colores_aprobados_at"].isoformat() if reg["colores_aprobados_at"] else None,
        "colores_aprobados_por": reg["colores_aprobados_por"],
    }


class _ColorAsignacionItem(BaseModel):
    color_id: str
    color_nombre: str = ""
    cantidad: int = 0


class _TallaAsignacion(BaseModel):
    talla_id: str
    talla_nombre: str = ""
    cantidad_total: int = 0
    colores: List[_ColorAsignacionItem] = []


class _DistribucionColoresInput(BaseModel):
    distribucion: List[_TallaAsignacion]


@router.put("/registro-colores/{registro_id}")
async def update_registro_colores(
    registro_id: str,
    payload: _DistribucionColoresInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Reemplaza el JSONB distribucion_colores del registro.
    Valida que la suma de colores por talla no exceda cantidad_total.
    Si colores_aprobados=true, solo admin puede modificar.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow(
            "SELECT colores_aprobados FROM prod_registros WHERE id = $1",
            registro_id,
        )
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        if reg["colores_aprobados"] and current_user.get("rol") != "admin":
            raise HTTPException(
                status_code=403,
                detail="Los colores fueron aprobados. Solo un admin puede modificarlos.",
            )

    # Validación: ningún talla debe excederse
    for t in payload.distribucion:
        suma = sum(safe_int(c.cantidad) for c in t.colores)
        if suma > t.cantidad_total:
            raise HTTPException(
                status_code=400,
                detail=f"Talla {t.talla_nombre or t.talla_id}: suma de colores ({suma}) excede el total ({t.cantidad_total})",
            )

    serializable = [t.model_dump() for t in payload.distribucion]
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE prod_registros SET distribucion_colores = $1::jsonb WHERE id = $2",
            json.dumps(serializable), registro_id,
        )
        if result.endswith(" 0"):
            raise HTTPException(status_code=404, detail="Registro no encontrado")

    return {"ok": True, "registro_id": registro_id, "items": len(serializable)}


@router.put("/registro-colores/{registro_id}/aprobar")
async def aprobar_colores(registro_id: str, current_user: dict = Depends(get_current_user)):
    """Marca la distribución de colores como aprobada (bloquea ediciones futuras
    salvo para admin)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE prod_registros
               SET colores_aprobados = TRUE,
                   colores_aprobados_at = NOW(),
                   colores_aprobados_por = $1
             WHERE id = $2
            """,
            current_user.get("username"), registro_id,
        )
        if result.endswith(" 0"):
            raise HTTPException(status_code=404, detail="Registro no encontrado")
    return {"ok": True, "registro_id": registro_id, "aprobado": True}


@router.put("/registro-colores/{registro_id}/desaprobar")
async def desaprobar_colores(registro_id: str, current_user: dict = Depends(get_current_user)):
    """Desbloquea la edición. Solo admin."""
    if current_user.get("rol") != "admin":
        raise HTTPException(status_code=403, detail="Solo un admin puede desaprobar colores")
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE prod_registros
               SET colores_aprobados = FALSE,
                   colores_aprobados_at = NULL,
                   colores_aprobados_por = NULL
             WHERE id = $1
            """,
            registro_id,
        )
        if result.endswith(" 0"):
            raise HTTPException(status_code=404, detail="Registro no encontrado")
    return {"ok": True, "registro_id": registro_id, "aprobado": False}


class _ColorProporcionInput(BaseModel):
    color_id: str
    color_nombre: str = ""
    peso: float = 1.0


class _AplicarBulkInput(BaseModel):
    registro_ids: List[str]
    colores: List[_ColorProporcionInput]


@router.post("/registro-colores/aplicar-bulk")
async def aplicar_distribucion_bulk(payload: _AplicarBulkInput):
    """
    Aplica un patrón de colores+proporciones a múltiples cortes a la vez.
    Para cada registro destino:
      - Lee sus tallas (cantidad_total por talla).
      - Para cada talla, reparte el total entre los colores según sus pesos.
      - Reemplaza distribucion_colores con el resultado.

    El reparto usa redondeo Hamilton para asegurar que la suma cuadre exactamente
    con cantidad_total (sin perder/sobrar prendas por redondeo).
    """
    if not payload.registro_ids:
        raise HTTPException(400, "Sin registros destino")
    colores = [c for c in payload.colores if c.peso > 0]
    if not colores:
        raise HTTPException(400, "Sin colores con peso > 0")
    suma_pesos = sum(c.peso for c in colores)

    pool = await get_pool()
    actualizados = 0
    async with pool.acquire() as conn:
        for reg_id in payload.registro_ids:
            # Fetch tallas del corte (cantidad por talla)
            reg = await conn.fetchrow(
                "SELECT id, tallas FROM prod_registros WHERE id = $1", reg_id
            )
            if not reg:
                continue
            tallas_jsonb = parse_jsonb(reg["tallas"])
            if not tallas_jsonb:
                continue

            distribucion = []
            for t in tallas_jsonb:
                talla_id = t.get("talla_id") or t.get("talla_nombre")
                talla_nombre = t.get("talla_nombre") or ""
                cantidad_total = safe_int(t.get("cantidad", 0))
                if cantidad_total <= 0 or not talla_id:
                    continue

                # Reparto Hamilton: floor + remainder distribuido por mayor decimal
                exactos = [cantidad_total * c.peso / suma_pesos for c in colores]
                base = [int(v) for v in exactos]
                resto = cantidad_total - sum(base)
                # ordenar por parte decimal descendente; asignar el resto en ese orden
                decimales_sorted = sorted(
                    enumerate(exactos),
                    key=lambda x: (x[1] - int(x[1])),
                    reverse=True,
                )
                for i in range(resto):
                    idx = decimales_sorted[i % len(decimales_sorted)][0]
                    base[idx] += 1

                colores_out = []
                for c, qty in zip(colores, base):
                    if qty > 0:
                        colores_out.append({
                            "color_id": c.color_id,
                            "color_nombre": c.color_nombre or "",
                            "cantidad": qty,
                        })
                distribucion.append({
                    "talla_id": talla_id,
                    "talla_nombre": talla_nombre,
                    "cantidad_total": cantidad_total,
                    "colores": colores_out,
                })

            result = await conn.execute(
                "UPDATE prod_registros SET distribucion_colores = $1::jsonb WHERE id = $2",
                json.dumps(distribucion), reg_id,
            )
            if not result.endswith(" 0"):
                actualizados += 1

    return {"ok": True, "actualizados": actualizados, "solicitados": len(payload.registro_ids)}


# ==================== REPORTE OPERATIVO DE COSTURA ====================

from pydantic import BaseModel

class AvanceRapidoInput(BaseModel):
    avance_porcentaje: int


class PlazoRapidoInput(BaseModel):
    # Días desde fecha_inicio; null/0 para limpiar la fecha esperada
    dias: Optional[int] = None

@router.get("/costura")
async def reporte_costura(
    servicio_nombre: str = Query("Costura"),
    persona_id: Optional[str] = None,
    modelo_nombre: Optional[str] = None,
    tipo_nombre: Optional[str] = None,
    entalle_nombre: Optional[str] = None,
    tela_nombre: Optional[str] = None,
    riesgo: Optional[str] = None,
    con_incidencias: Optional[bool] = None,
    vencidos: Optional[bool] = None,
    sin_actualizar: Optional[bool] = None,
    incluir_terminados: bool = Query(False),
    user=Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Si servicio_nombre es __todos__, no filtrar por servicio
        filtro_servicio = servicio_nombre != '__todos__'
        rows = await conn.fetch("""
            SELECT
                m.id as movimiento_id,
                m.registro_id,
                m.persona_id,
                m.servicio_id,
                m.cantidad_enviada,
                m.cantidad_recibida,
                m.avance_porcentaje,
                m.fecha_inicio,
                m.fecha_fin,
                m.fecha_esperada_movimiento,
                m.avance_updated_at,
                m.observaciones as mov_observaciones,
                m.created_at as mov_created_at,
                r.n_corte,
                r.estado as registro_estado,
                r.observaciones as registro_observaciones,
                r.urgente,
                p.nombre as persona_nombre,
                p.tipo_persona as persona_tipo,
                COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo') as modelo_nombre,
                COALESCE(marca.nombre, r.modelo_manual->>'marca_texto') as marca_nombre,
                COALESCE(tipo.nombre, r.modelo_manual->>'tipo_texto') as tipo_nombre,
                COALESCE(ent.nombre, r.modelo_manual->>'entalle_texto') as entalle_nombre,
                COALESCE(tela.nombre, r.modelo_manual->>'tela_texto') as tela_nombre,
                COALESCE(he.nombre, r.modelo_manual->>'hilo_especifico_texto', '') as hilo_especifico_nombre,
                r.distribucion_colores,
                s.nombre as servicio_nombre,
                (SELECT COUNT(*) FROM produccion.prod_incidencia i
                 WHERE i.registro_id = r.id AND i.estado = 'ABIERTA') as incidencias_abiertas,
                -- Suma de prendas en muestras activas (en_destino) del registro.
                -- Sprint 43: para mostrar pill "+m{n}" en cada card del reporte.
                -- Tolerante a viejas: si cantidad_total es NULL, sumamos desde colores.
                -- Si estado_muestra es NULL, lo inferimos de fecha_retorno.
                COALESCE((
                    SELECT SUM(
                               COALESCE(
                                   mu.cantidad_total,
                                   (SELECT COALESCE(SUM(c.cantidad), 0)::INTEGER
                                      FROM prod_registro_muestra_colores c
                                     WHERE c.muestra_id = mu.id)
                               )
                           )::INTEGER
                      FROM prod_registro_muestras mu
                     WHERE mu.registro_id = r.id
                       AND CASE
                               WHEN mu.estado_muestra IS NOT NULL THEN mu.estado_muestra
                               WHEN mu.fecha_retorno IS NOT NULL THEN 'devuelta'
                               ELSE 'en_destino'
                           END = 'en_destino'
                ), 0) as muestras_activas
            FROM produccion.prod_movimientos_produccion m
            JOIN produccion.prod_registros r ON r.id = m.registro_id
            JOIN produccion.prod_personas_produccion p ON p.id = m.persona_id
            JOIN produccion.prod_servicios_produccion s ON s.id = m.servicio_id
            LEFT JOIN produccion.prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN produccion.prod_marcas marca ON marca.id = mod.marca_id
            LEFT JOIN produccion.prod_tipos tipo ON tipo.id = mod.tipo_id
            LEFT JOIN produccion.prod_entalles ent ON ent.id = mod.entalle_id
            LEFT JOIN produccion.prod_telas tela ON tela.id = mod.tela_id
            LEFT JOIN produccion.prod_hilos_especificos he ON he.id = COALESCE(mod.hilo_especifico_id, r.hilo_especifico_id)
            WHERE ($3 = FALSE OR LOWER(s.nombre) = LOWER($1))
              AND ($2 = TRUE OR m.fecha_fin IS NULL)
            ORDER BY p.nombre, r.n_corte
        """, servicio_nombre, incluir_terminados, filtro_servicio)

        hoy = date.today()
        results = []
        for r in rows:
            d = dict(r)
            avance = d['avance_porcentaje'] or 0
            fecha_inicio = d['fecha_inicio']
            fecha_fin = d['fecha_fin']
            fecha_esperada = d['fecha_esperada_movimiento']
            avance_updated = d['avance_updated_at']
            incidencias = d['incidencias_abiertas'] or 0

            # Días transcurridos
            dias_transcurridos = None
            if fecha_inicio:
                dias_transcurridos = (hoy - fecha_inicio).days

            # Días sin actualizar avance
            dias_sin_actualizar = None
            if avance_updated:
                dias_sin_actualizar = (datetime.now() - avance_updated).days
            elif fecha_inicio and d['avance_porcentaje'] is not None:
                dias_sin_actualizar = (hoy - fecha_inicio).days

            # Pendiente estimado — ELIMINADO por pedido del usuario

            # Lógica de riesgo
            nivel_riesgo = 'normal'
            if fecha_fin and hoy > fecha_fin and avance < 100:
                nivel_riesgo = 'vencido'
            elif fecha_esperada and hoy > fecha_esperada and avance < 100:
                nivel_riesgo = 'vencido'
            else:
                score = 0
                if dias_sin_actualizar is not None and dias_sin_actualizar >= 5:
                    score += 3
                elif dias_sin_actualizar is not None and dias_sin_actualizar >= 3:
                    score += 1
                if fecha_esperada:
                    dias_para_entrega = (fecha_esperada - hoy).days
                    if dias_para_entrega <= 2 and avance < 70:
                        score += 3
                    elif dias_para_entrega <= 5 and avance < 50:
                        score += 1
                elif fecha_fin:
                    dias_para_entrega = (fecha_fin - hoy).days
                    if dias_para_entrega <= 2 and avance < 70:
                        score += 3
                    elif dias_para_entrega <= 5 and avance < 50:
                        score += 1
                if incidencias >= 2:
                    score += 2
                elif incidencias >= 1:
                    score += 1
                if score >= 3:
                    nivel_riesgo = 'critico'
                elif score >= 1:
                    nivel_riesgo = 'atencion'

            # ─── Indicador de colores asignados (útil para Lavandería) ───
            # Mismo criterio "100% distribuido" que usa la matriz dinámica
            # (ver líneas 1842-1848): 'completo' = todas las tallas con
            # cantidad_total>0 tienen colores asignados sumando == total.
            dist_raw = parse_jsonb(d.get('distribucion_colores'))
            talla_totales_c: dict = {}
            asignado_por_talla_c: dict = {}
            colores_unicos: set = set()
            for entry in (dist_raw or []):
                tn = entry.get('talla_nombre') or str(entry.get('talla_id', ''))
                ct = safe_int(entry.get('cantidad_total', 0))
                if tn:
                    talla_totales_c[tn] = talla_totales_c.get(tn, 0) + ct
                for c in (entry.get('colores') or []):
                    cn = (c.get('color_nombre') or '').strip().upper()
                    qty = safe_int(c.get('cantidad', 0))
                    if not cn or qty == 0:
                        continue
                    colores_unicos.add(cn)
                    if tn:
                        asignado_por_talla_c[tn] = asignado_por_talla_c.get(tn, 0) + qty

            has_colors_c = bool(colores_unicos)
            tallas_con_total_c = [(tn, tot) for tn, tot in talla_totales_c.items() if tot > 0]
            colores_completos_c = (
                has_colors_c and bool(tallas_con_total_c)
                and all(asignado_por_talla_c.get(tn, 0) == tot for tn, tot in tallas_con_total_c)
            )
            if not has_colors_c:
                colores_status = 'sin_colores'
            elif colores_completos_c:
                colores_status = 'completo'
            else:
                colores_status = 'parcial'

            item = {
                "movimiento_id": d['movimiento_id'],
                "registro_id": d['registro_id'],
                "persona_id": d['persona_id'],
                "persona_nombre": d['persona_nombre'],
                "persona_tipo": d['persona_tipo'],
                "n_corte": d['n_corte'],
                "registro_estado": d['registro_estado'],
                "modelo_nombre": d['modelo_nombre'],
                "marca_nombre": d['marca_nombre'],
                "tipo_nombre": d['tipo_nombre'],
                "entalle_nombre": d['entalle_nombre'],
                "tela_nombre": d['tela_nombre'],
                "hilo_especifico": d['hilo_especifico_nombre'],
                "cantidad_enviada": d['cantidad_enviada'],
                "cantidad_recibida": d['cantidad_recibida'],
                "avance_porcentaje": d['avance_porcentaje'],
                "fecha_inicio": str(d['fecha_inicio']) if d['fecha_inicio'] else None,
                "fecha_fin": str(d['fecha_fin']) if d['fecha_fin'] else None,
                "fecha_esperada": str(d['fecha_esperada_movimiento']) if d['fecha_esperada_movimiento'] else None,
                "avance_updated_at": d['avance_updated_at'].isoformat() if d['avance_updated_at'] else None,
                "dias_transcurridos": dias_transcurridos,
                "dias_sin_actualizar": dias_sin_actualizar,
                "incidencias_abiertas": incidencias,
                "nivel_riesgo": nivel_riesgo,
                "urgente": d['urgente'],
                "observaciones": d['registro_observaciones'] or d['mov_observaciones'] or None,
                "servicio_nombre": d['servicio_nombre'],
                # Sprint 43: prendas en muestras activas (sin volver) del registro.
                "muestras_activas": int(d.get('muestras_activas') or 0),
                # Indicador para Lavandería: 'completo' | 'parcial' | 'sin_colores'.
                # 'completo' = todas las tallas con cantidad>0 tienen colores
                # asignados sumando == cantidad_total (distribución 100%).
                "colores_status": colores_status,
                "colores_count": len(colores_unicos),
            }

            # Aplicar filtros en Python (más simple que SQL dinámico)
            if persona_id and d['persona_id'] != persona_id:
                continue
            if modelo_nombre and (d['modelo_nombre'] or '').lower() != modelo_nombre.lower():
                continue
            if tipo_nombre and (d['tipo_nombre'] or '').lower() != tipo_nombre.lower():
                continue
            if entalle_nombre and (d['entalle_nombre'] or '').lower() != entalle_nombre.lower():
                continue
            if tela_nombre and (d['tela_nombre'] or '').lower() != tela_nombre.lower():
                continue
            if riesgo and nivel_riesgo != riesgo:
                continue
            if con_incidencias is True and incidencias == 0:
                continue
            if con_incidencias is False and incidencias > 0:
                continue
            if vencidos is True and nivel_riesgo != 'vencido':
                continue
            if sin_actualizar is True and (dias_sin_actualizar is None or dias_sin_actualizar < 3):
                continue

            results.append(item)

        # KPIs
        personas_set = set()
        total_prendas = 0
        registros_activos = 0
        registros_vencidos = 0
        registros_criticos = 0
        registros_sin_act = 0
        incidencias_totales = 0

        for item in results:
            personas_set.add(item['persona_id'])
            total_prendas += item['cantidad_enviada'] or 0
            registros_activos += 1
            if item['nivel_riesgo'] == 'vencido':
                registros_vencidos += 1
            if item['nivel_riesgo'] == 'critico':
                registros_criticos += 1
            if item['dias_sin_actualizar'] is not None and item['dias_sin_actualizar'] >= 3:
                registros_sin_act += 1
            incidencias_totales += item['incidencias_abiertas']

        # Filtros disponibles (valores únicos de los datos)
        personas_unicas = []
        seen_personas = set()
        for item in results:
            if item['persona_id'] not in seen_personas:
                seen_personas.add(item['persona_id'])
                personas_unicas.append({"id": item['persona_id'], "nombre": item['persona_nombre']})

        return {
            "kpis": {
                "costureros_activos": len(personas_set),
                "registros_activos": registros_activos,
                "total_prendas": total_prendas,
                "registros_vencidos": registros_vencidos,
                "registros_criticos": registros_criticos,
                "registros_sin_actualizar": registros_sin_act,
                "incidencias_abiertas": incidencias_totales,
            },
            "items": results,
            "filtros": {
                "personas": sorted(personas_unicas, key=lambda x: x['nombre']),
            }
        }


@router.put("/costura/avance/{movimiento_id}")
async def actualizar_avance_rapido(
    movimiento_id: str,
    input: AvanceRapidoInput,
    user=Depends(get_current_user)
):
    """Actualizar solo el avance % de un movimiento desde el reporte."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow(
            "SELECT id FROM produccion.prod_movimientos_produccion WHERE id = $1",
            movimiento_id
        )
        if not result:
            raise HTTPException(status_code=404, detail="Movimiento no encontrado")
        await conn.execute(
            """UPDATE produccion.prod_movimientos_produccion
               SET avance_porcentaje = $1, avance_updated_at = NOW()
               WHERE id = $2""",
            input.avance_porcentaje, movimiento_id
        )
        # Registrar en historial
        usuario_nombre = user.get("nombre_completo") or user.get("username") or "Sistema"
        await conn.execute(
            """INSERT INTO produccion.prod_avance_historial (movimiento_id, avance_porcentaje, usuario)
               VALUES ($1, $2, $3)""",
            movimiento_id, input.avance_porcentaje, usuario_nombre
        )
        return {"ok": True, "avance_porcentaje": input.avance_porcentaje}


@router.put("/costura/plazo/{movimiento_id}")
async def actualizar_plazo_rapido(
    movimiento_id: str,
    input: PlazoRapidoInput,
    user=Depends(get_current_user)
):
    """Actualizar solo la fecha_esperada_movimiento a partir de un número de
    días desde la fecha_inicio. Si dias es null/0, limpia la fecha.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        mov = await conn.fetchrow(
            "SELECT id, fecha_inicio FROM produccion.prod_movimientos_produccion WHERE id = $1",
            movimiento_id,
        )
        if not mov:
            raise HTTPException(status_code=404, detail="Movimiento no encontrado")

        nueva_fecha = None
        dias = input.dias
        if dias is not None and dias > 0:
            if not mov["fecha_inicio"]:
                raise HTTPException(
                    status_code=400,
                    detail="El movimiento no tiene fecha_inicio — no se puede calcular plazo.",
                )
            from datetime import timedelta as _td
            nueva_fecha = mov["fecha_inicio"] + _td(days=dias)

        await conn.execute(
            "UPDATE produccion.prod_movimientos_produccion SET fecha_esperada_movimiento = $1 WHERE id = $2",
            nueva_fecha, movimiento_id,
        )
        return {
            "ok": True,
            "dias": dias or 0,
            "fecha_esperada": str(nueva_fecha) if nueva_fecha else None,
        }


@router.get("/costura/avance-historial/{movimiento_id}")
async def get_avance_historial(
    movimiento_id: str,
    user=Depends(get_current_user)
):
    """Obtener historial de cambios de avance de un movimiento."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, avance_porcentaje, usuario, created_at
               FROM produccion.prod_avance_historial
               WHERE movimiento_id = $1
               ORDER BY created_at ASC""",
            movimiento_id
        )
        return [
            {
                "id": r["id"],
                "avance_porcentaje": r["avance_porcentaje"],
                "usuario": r["usuario"],
                "fecha": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


@router.delete("/costura/avance-historial/{historial_id}")
async def eliminar_avance_historial(
    historial_id: str,
    user=Depends(get_current_user)
):
    """Eliminar una entrada del historial de avance y recalcular el avance actual."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Obtener el registro a eliminar
        entry = await conn.fetchrow(
            "SELECT id, movimiento_id FROM produccion.prod_avance_historial WHERE id = $1",
            historial_id
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        movimiento_id = entry["movimiento_id"]

        # Eliminar la entrada
        await conn.execute(
            "DELETE FROM produccion.prod_avance_historial WHERE id = $1",
            historial_id
        )

        # Recalcular: el avance actual es el último registro del historial
        last = await conn.fetchrow(
            """SELECT avance_porcentaje FROM produccion.prod_avance_historial
               WHERE movimiento_id = $1 ORDER BY created_at DESC LIMIT 1""",
            movimiento_id
        )
        nuevo_avance = last["avance_porcentaje"] if last else 0

        await conn.execute(
            """UPDATE produccion.prod_movimientos_produccion
               SET avance_porcentaje = $1, avance_updated_at = NOW()
               WHERE id = $2""",
            nuevo_avance, movimiento_id
        )

        return {"ok": True, "nuevo_avance": nuevo_avance}



@router.get("/alertas-produccion")
async def alertas_produccion():
    """Devuelve alertas activas: lotes vencidos, críticos, paralizados, sin actualizar."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        hoy = date.today()
        
        # Query all active movimientos across all services
        rows = await conn.fetch("""
            SELECT 
                m.id as movimiento_id,
                m.registro_id,
                m.servicio_id,
                r.n_corte,
                r.urgente,
                s.nombre as servicio_nombre,
                COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo') as modelo_nombre,
                pp.nombre as persona_nombre,
                m.cantidad_enviada,
                m.avance_porcentaje,
                m.fecha_inicio,
                m.fecha_fin,
                m.avance_updated_at,
                COALESCE(m.fecha_esperada_movimiento, m.fecha_fin) as fecha_esperada,
                (SELECT COUNT(*) FROM produccion.prod_incidencia i 
                 WHERE i.registro_id = r.id AND i.estado = 'ABIERTA') as incidencias_abiertas,
                (SELECT COUNT(*) FROM produccion.prod_paralizacion p 
                 WHERE p.registro_id = r.id AND p.activa = true) as paralizaciones_activas
            FROM produccion.prod_movimientos_produccion m
            JOIN produccion.prod_registros r ON r.id = m.registro_id
            JOIN produccion.prod_servicios_produccion s ON s.id = m.servicio_id
            LEFT JOIN produccion.prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN produccion.prod_personas_produccion pp ON pp.id = m.persona_id
            WHERE m.avance_porcentaje < 100
              AND m.fecha_inicio IS NOT NULL
            ORDER BY m.fecha_inicio ASC
        """)
        
        alertas = []
        resumen = {"vencidos": 0, "criticos": 0, "paralizados": 0, "sin_actualizar": 0, "total": 0}
        
        for row in rows:
            avance = row["avance_porcentaje"] or 0
            fecha_esperada = row["fecha_esperada"]
            fecha_inicio = row["fecha_inicio"]
            incidencias = row["incidencias_abiertas"]
            paralizados = row["paralizaciones_activas"]
            
            # Días transcurridos
            dias = (hoy - fecha_inicio).days if fecha_inicio else 0
            
            # Días sin actualizar
            dias_sin_act = None
            if row["avance_updated_at"]:
                dias_sin_act = (hoy - row["avance_updated_at"].date()).days
            elif fecha_inicio:
                dias_sin_act = dias
            
            # Lógica de riesgo (misma del reporte costura)
            nivel = 'normal'
            if fecha_esperada and hoy > fecha_esperada and avance < 100:
                nivel = 'vencido'
            else:
                score = 0
                if dias_sin_act is not None and dias_sin_act >= 5: score += 3
                elif dias_sin_act is not None and dias_sin_act >= 3: score += 1
                if fecha_esperada:
                    dias_entrega = (fecha_esperada - hoy).days
                    if dias_entrega <= 2 and avance < 70: score += 3
                    elif dias_entrega <= 5 and avance < 50: score += 1
                if incidencias >= 2: score += 2
                elif incidencias >= 1: score += 1
                if score >= 3: nivel = 'critico'
                elif score >= 1: nivel = 'atencion'
            
            # Solo incluir alertas relevantes (no normales)
            motivos = []
            if nivel == 'vencido':
                motivos.append('Fecha vencida')
                resumen["vencidos"] += 1
            if nivel == 'critico':
                resumen["criticos"] += 1
            if paralizados > 0:
                motivos.append('Producción paralizada')
                resumen["paralizados"] += 1
            if dias_sin_act is not None and dias_sin_act >= 5:
                motivos.append(f'{dias_sin_act}d sin actualizar')
                resumen["sin_actualizar"] += 1
            if fecha_esperada:
                dias_entrega = (fecha_esperada - hoy).days
                if dias_entrega <= 2 and avance < 70:
                    motivos.append(f'Entrega en {dias_entrega}d, avance {avance}%')
            if incidencias >= 1:
                motivos.append(f'{incidencias} incidencia{"s" if incidencias > 1 else ""}')
            if row["urgente"]:
                motivos.append('Urgente')
            
            if nivel in ('vencido', 'critico') or paralizados > 0:
                alertas.append({
                    "movimiento_id": str(row["movimiento_id"]),
                    "registro_id": str(row["registro_id"]),
                    "n_corte": row["n_corte"],
                    "urgente": row["urgente"],
                    "servicio": row["servicio_nombre"],
                    "servicio_id": str(row["servicio_id"]),
                    "modelo": row["modelo_nombre"],
                    "persona": row["persona_nombre"],
                    "avance": avance,
                    "dias": dias,
                    "dias_sin_actualizar": dias_sin_act,
                    "nivel": nivel,
                    "motivos": motivos,
                    "motivo_texto": '; '.join(motivos),
                    "incidencias": incidencias,
                    "paralizado": paralizados > 0,
                })
        
        resumen["total"] = len(alertas)
        
        # Ordenar: paralizados primero, luego vencidos, luego críticos, luego por días desc
        prioridad = {'vencido': 0, 'critico': 1, 'atencion': 2, 'normal': 3}
        alertas.sort(key=lambda a: (
            0 if a["paralizado"] else 1,
            prioridad.get(a["nivel"], 3),
            -(a["dias"] or 0),
        ))
        
        return {"alertas": alertas, "resumen": resumen}
        


@router.get("/validacion-registros")
async def validacion_registros(
    linea_negocio_id: Optional[int] = None,
    user=Depends(get_current_user),
):
    """Valida que registros de pantalones/shorts/casacas tengan los MP y servicios
    requeridos según su etapa actual de producción.

    Reglas por tipo:
      - Pantalón / Pantalón Denim / Pantalón Drill / Otros Pantalón / Short:
        ver `_validar_pantalon` (se aplica también a shorts por simetría operativa).
      - Polo y Casaca: pendientes de definir (usan el catálogo genérico legacy).

    Para Pantalón se distingue entre servicios "iniciados" (con `fecha_inicio`),
    "en proceso" (fecha_inicio sin fecha_fin) y "terminados" (con `fecha_fin`),
    así como entre costura interna vs externa (por `tipo_persona` del movimiento).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        linea_filter = f"AND r.linea_negocio_id = {linea_negocio_id}" if linea_negocio_id else ""

        # Por ahora solo se valida Pantalón (incluye Pantalón Denim, Pantalón
        # Drill, Otros Pantalón). Polo y Casaca quedan fuera del reporte hasta
        # que se definan sus reglas específicas.
        registros = await conn.fetch(f"""
            SELECT
                r.id::text AS id,
                r.n_corte,
                r.estado,
                COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo', '') AS modelo_nombre,
                COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto', '')    AS tipo_nombre,
                COALESCE(ent.nombre, r.modelo_manual->>'entalle_texto', '') AS entalle_nombre,
                COALESCE(
                    (SELECT SUM(rt.cantidad_real)
                     FROM prod_registro_tallas rt WHERE rt.registro_id = r.id),
                    0
                ) AS total_prendas
            FROM prod_registros r
            LEFT JOIN prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN prod_tipos tp    ON tp.id  = mod.tipo_id
            LEFT JOIN prod_entalles ent ON ent.id = mod.entalle_id
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND r.dividido_desde_registro_id IS NULL
              AND r.fecha_creacion >= '2026-01-01'
              {linea_filter}
              AND (
                tp.nombre ILIKE '%pantalon%' OR tp.nombre ILIKE '%pantalón%'
                OR r.modelo_manual->>'tipo_texto' ILIKE '%pantalon%'
                OR r.modelo_manual->>'tipo_texto' ILIKE '%pantalón%'
              )
        """)

        if not registros:
            return {"grupos": [], "total_con_faltantes": 0, "total_revisados": 0}

        reg_ids = [r["id"] for r in registros]

        mp_rows = await conn.fetch("""
            SELECT req.registro_id::text AS registro_id,
                   i.nombre              AS item_nombre,
                   i.categoria,
                   req.talla_id
            FROM prod_registro_requerimiento_mp req
            JOIN prod_inventario i ON i.id = req.item_id
            WHERE req.registro_id::text = ANY($1::text[])
              AND req.cantidad_requerida > 0
        """, reg_ids)

        # Movimientos con fecha_inicio / fecha_fin / tipo_persona para distinguir
        # servicio iniciado vs en proceso vs terminado, y costura interna vs externa.
        mov_rows = await conn.fetch("""
            SELECT m.registro_id::text  AS registro_id,
                   s.nombre             AS servicio_nombre,
                   m.fecha_inicio,
                   m.fecha_fin,
                   p.tipo_persona       AS tipo_persona
            FROM prod_movimientos_produccion m
            JOIN prod_servicios_produccion s ON s.id = m.servicio_id
            LEFT JOIN prod_personas_produccion p ON p.id = m.persona_id
            WHERE m.registro_id::text = ANY($1::text[])
        """, reg_ids)

        mp_by_reg: dict = {}
        for row in mp_rows:
            mp_by_reg.setdefault(row["registro_id"], []).append({
                "nombre": (row["item_nombre"] or "").lower(),
                "categoria": row["categoria"] or "",
                "talla_id": row["talla_id"],
            })

        mov_by_reg: dict = {}
        for row in mov_rows:
            mov_by_reg.setdefault(row["registro_id"], []).append({
                "servicio": (row["servicio_nombre"] or "").lower(),
                "fecha_inicio": row["fecha_inicio"],
                "fecha_fin": row["fecha_fin"],
                "tipo_persona": (row["tipo_persona"] or "").upper(),
            })

        STAGE_ORDER = {
            "Para Corte": 0, "Corte": 1,
            "Para Costura": 2, "Costura": 3,
            "Para Atraque": 4, "Atraque": 5,
            "Para Lavanderia": 6, "Muestra Lavanderia": 7, "Lavanderia": 8,
            "Para Acabado": 9, "Acabado": 10,
            "Almacen PT": 11, "Tienda": 12,
        }

        # ── Helpers de MP ──────────────────────────────────────────────────
        def has_mp(rid, kw):
            return any(kw in it["nombre"] for it in mp_by_reg.get(rid, []))

        def has_tela_no_tocuyo(rid):
            return any(
                it["categoria"] == "Telas" and "tocuyo" not in it["nombre"]
                for it in mp_by_reg.get(rid, [])
            )

        def has_tallas_mp(rid):
            return any(
                "talla" in it["nombre"] or it["talla_id"] is not None
                for it in mp_by_reg.get(rid, [])
            )

        # ── Helpers de movimientos / servicios ─────────────────────────────
        def _movs(rid, kw):
            """Movimientos del registro cuyo nombre de servicio contiene `kw`."""
            return [m for m in mov_by_reg.get(rid, []) if kw in m["servicio"]]

        def has_svc_iniciado(rid, kw):
            """Tiene al menos un movimiento del servicio con fecha_inicio."""
            return any(m["fecha_inicio"] for m in _movs(rid, kw))

        def has_svc_terminado(rid, kw):
            """Tiene al menos un movimiento del servicio con fecha_fin (terminado)."""
            return any(m["fecha_fin"] for m in _movs(rid, kw))

        def has_svc_en_proceso(rid, kw):
            """Tiene un movimiento con fecha_inicio pero sin fecha_fin."""
            return any(m["fecha_inicio"] and not m["fecha_fin"] for m in _movs(rid, kw))

        def costura_es_interna(rid):
            """True si al menos un movimiento de Costura tiene persona INTERNA."""
            return any(m["tipo_persona"] == "INTERNO" for m in _movs(rid, "costura"))

        # ── Validador específico para Pantalón / Short ─────────────────────
        def validar_pantalon(reg, stage_idx):
            rid = reg["id"]
            entalle = (reg["entalle_nombre"] or "").lower().strip()
            faltantes = []

            # Para Costura (≥ 2): MP base + servicios pre-costura
            if stage_idx >= 2:
                if not has_mp(rid, "tocuyo"):
                    faltantes.append("tocuyo")
                if not has_tela_no_tocuyo(rid):
                    faltantes.append("tela principal")
                if not has_mp(rid, "cierre"):
                    faltantes.append("Cierre")
                if not has_tallas_mp(rid):
                    faltantes.append("Tallas")
                if not has_svc_iniciado(rid, "corte"):
                    faltantes.append("servicio Corte")
                if not has_svc_iniciado(rid, "bordado"):
                    faltantes.append("Bordado")
                # En esta empresa "Pretina" es el servicio Estampado
                if not has_svc_iniciado(rid, "estampado"):
                    faltantes.append("Estampado / Pretina")

            # Costura (= 3): debe estar en proceso (iniciado, sin terminar)
            if stage_idx == 3:
                if not has_svc_en_proceso(rid, "costura"):
                    faltantes.append("Costura en proceso")

            # Para Lavandería en adelante (≥ 6): Costura terminada + Atraque
            # (atraque solo si la costura fue interna; externa lo puede obviar)
            if stage_idx >= 6:
                if not has_svc_terminado(rid, "costura"):
                    faltantes.append("Costura terminada")
                if costura_es_interna(rid) and not has_svc_iniciado(rid, "atraque"):
                    faltantes.append("Atraque (costura interna)")

            # Lavandería (= 8): servicio Lavandería en proceso
            if stage_idx == 8:
                if not has_svc_en_proceso(rid, "lavand"):
                    faltantes.append("Lavandería en proceso")

            # Para Acabado (≥ 9): Lavandería terminada
            if stage_idx >= 9:
                if not has_svc_terminado(rid, "lavand"):
                    faltantes.append("Lavandería terminada")

            # Acabado en adelante (≥ 10): servicio Acabado iniciado + avíos de cierre
            if stage_idx >= 10:
                if not has_svc_iniciado(rid, "acabado"):
                    faltantes.append("servicio Acabado")
                if not has_mp(rid, "boton") and not has_mp(rid, "botón"):
                    faltantes.append("Botón")
                if not has_mp(rid, "remache"):
                    faltantes.append("Remache x2")
                if not has_mp(rid, "bolsillero"):
                    faltantes.append("Hangtag Bolsillero")
                if not has_mp(rid, "pretinero"):
                    faltantes.append("Hangtag Pretinero")
                # Hangtag de entalle: no aplica para Flare ni Mom.
                # Reglas de match (en orden):
                #   1) Genérico: el item se llama "entalle" o "perfect".
                #   2) Nombre del entalle del modelo (ej: entalle "Skinny"
                #      matchea "Hantag Skinny Fit").
                #   3) Entalles compuestos: la PRIMERA palabra del entalle
                #      cuenta como base (ej: "Oversize Cargo" → "Hantag Oversize"
                #      o "Jogger Cargo" → "Hantag Jogger").
                #   4) Equivalencias del negocio: "Hantag Relaxed" sirve para
                #      entalles "Regular" y "Semi Extra".
                if entalle not in ("flare", "mom"):
                    # Equivalencias del negocio: hangtags que el operario
                    # carga aunque el entalle del modelo se llame distinto.
                    #   - "regular" / "semi extra" admiten "Hangtag Relaxed"
                    #   - "pitillo" / "semi pitillo" admiten "Hangtag Slim"
                    #     o "Hangtag Skinny" (jerga textil PE: pitillo ≈ slim ≈
                    #     skinny; el operario suele usar el que tenga en stock).
                    HANGTAG_EQUIVALENTES = {
                        "regular": ["relaxed"],
                        "semi extra": ["relaxed"],
                        "pitillo": ["slim", "skinny"],
                        "semi pitillo": ["slim", "skinny"],
                    }
                    candidatos_entalle = []
                    if entalle:
                        candidatos_entalle.append(entalle)
                        palabras = entalle.split()
                        if len(palabras) > 1 and palabras[0]:
                            candidatos_entalle.append(palabras[0])
                        candidatos_entalle.extend(HANGTAG_EQUIVALENTES.get(entalle, []))
                    if not (
                        has_mp(rid, "entalle")
                        or has_mp(rid, "perfect")
                        or any(has_mp(rid, c) for c in candidatos_entalle)
                    ):
                        faltantes.append("Hangtag Entalle")
                if not has_mp(rid, "colgante"):
                    faltantes.append("Colgante")
                if not has_mp(rid, "adhesivo"):
                    faltantes.append("Adhesivo por talla")

            return faltantes

        # NOTA: validadores `validar_polo` y `validar_casaca` se agregarán
        # cuando se definan sus reglas. Por ahora el endpoint solo procesa
        # registros de Pantalón (ver filtro SQL arriba).

        groups: dict = {}

        for reg in registros:
            estado = reg["estado"] or ""
            stage_idx = STAGE_ORDER.get(estado, -1)
            if stage_idx < 2:
                continue

            faltantes = validar_pantalon(reg, stage_idx)

            if faltantes:
                groups.setdefault(estado, []).append({
                    "id": reg["id"],
                    "n_corte": reg["n_corte"],
                    "modelo": reg["modelo_nombre"],
                    "tipo": reg["tipo_nombre"],
                    "entalle": reg["entalle_nombre"],
                    "total_prendas": safe_int(reg["total_prendas"]),
                    "faltantes": faltantes,
                })

        sorted_groups = []
        for estado, _ in sorted(STAGE_ORDER.items(), key=lambda x: x[1]):
            if estado in groups:
                sorted_groups.append({
                    "estado": estado,
                    "registros": sorted(groups[estado], key=lambda r: r["n_corte"] or ""),
                    "total": len(groups[estado]),
                })

        total = sum(g["total"] for g in sorted_groups)
        return {
            "grupos": sorted_groups,
            "total_con_faltantes": total,
            "total_revisados": len(registros),
        }


@router.get("/tiempos-muertos")
async def reporte_tiempos_muertos(
    incluir_resueltos: bool = Query(False),
    user=Depends(get_current_user)
):
    """Lotes parados: último servicio terminado sin actividad posterior."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        hoy = date.today()

        # Para cada registro, encontrar el último movimiento terminado
        # y verificar si hay algún movimiento posterior que haya iniciado
        rows = await conn.fetch("""
            WITH ultimo_terminado AS (
                SELECT DISTINCT ON (m.registro_id)
                    m.registro_id,
                    m.id as movimiento_id,
                    m.servicio_id,
                    s.nombre as servicio_nombre,
                    m.persona_id,
                    pp.nombre as persona_nombre,
                    m.fecha_fin,
                    m.cantidad_enviada,
                    m.created_at as mov_created
                FROM produccion.prod_movimientos_produccion m
                JOIN produccion.prod_servicios_produccion s ON s.id = m.servicio_id
                LEFT JOIN produccion.prod_personas_produccion pp ON pp.id = m.persona_id
                WHERE m.fecha_fin IS NOT NULL
                ORDER BY m.registro_id, m.fecha_fin DESC, m.created_at DESC
            ),
            tiene_siguiente AS (
                -- Un "siguiente iniciado" se determina por fechas REALES del servicio
                -- (fecha_inicio), NO por created_at (que es cuándo se cargó la fila en BD).
                -- Esto evita falsos positivos cuando se cargan movimientos históricos
                -- fuera de orden cronológico.
                SELECT ut.registro_id,
                       EXISTS (
                           SELECT 1
                           FROM produccion.prod_movimientos_produccion m2
                           WHERE m2.registro_id = ut.registro_id
                             AND m2.id != ut.movimiento_id
                             AND m2.fecha_inicio IS NOT NULL
                             AND m2.fecha_inicio > ut.fecha_fin
                       ) as siguiente_iniciado
                FROM ultimo_terminado ut
            )
            SELECT
                ut.registro_id,
                ut.movimiento_id,
                ut.servicio_nombre as ultimo_servicio,
                ut.persona_nombre as ultima_persona,
                ut.fecha_fin as fecha_termino,
                ut.cantidad_enviada,
                r.n_corte,
                r.estado as estado_actual,
                r.urgente,
                COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo') as modelo_nombre,
                COALESCE(marca.nombre, r.modelo_manual->>'marca_texto') as marca_nombre,
                COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto', '') as tipo_nombre,
                COALESCE(en.nombre, r.modelo_manual->>'entalle_texto', '') as entalle_nombre,
                COALESCE(te.nombre, r.modelo_manual->>'tela_texto', '') as tela_nombre,
                COALESCE(he.nombre, r.modelo_manual->>'hilo_especifico_texto', '') as hilo_especifico_nombre,
                COALESCE(ts.siguiente_iniciado, false) as siguiente_iniciado
            FROM ultimo_terminado ut
            JOIN produccion.prod_registros r ON r.id = ut.registro_id
            LEFT JOIN produccion.prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN produccion.prod_marcas marca ON marca.id = mod.marca_id
            LEFT JOIN produccion.prod_tipos tp ON tp.id = mod.tipo_id
            LEFT JOIN produccion.prod_entalles en ON en.id = mod.entalle_id
            LEFT JOIN produccion.prod_telas te ON te.id = mod.tela_id
            LEFT JOIN produccion.prod_hilos_especificos he ON he.id = COALESCE(mod.hilo_especifico_id, r.hilo_especifico_id)
            LEFT JOIN tiene_siguiente ts ON ts.registro_id = ut.registro_id
            ORDER BY ut.fecha_fin ASC
        """)

        # Incidencias por registro: count abiertas + último motivo
        inc_rows = await conn.fetch("""
            SELECT i.registro_id,
                   COUNT(*) FILTER (WHERE i.estado = 'ABIERTA') as inc_abiertas,
                   COUNT(*) as inc_total
            FROM prod_incidencia i
            GROUP BY i.registro_id
        """)
        inc_map = {r["registro_id"]: {"abiertas": r["inc_abiertas"], "total": r["inc_total"]} for r in inc_rows}

        # Último motivo abierto por registro
        motivo_rows = await conn.fetch("""
            SELECT DISTINCT ON (i.registro_id)
                   i.registro_id,
                   COALESCE(m.nombre, i.tipo) as motivo_nombre
            FROM prod_incidencia i
            LEFT JOIN prod_motivos_incidencia m ON i.tipo = m.id
            WHERE i.estado = 'ABIERTA'
            ORDER BY i.registro_id, i.fecha_hora DESC
        """)
        motivo_map = {r["registro_id"]: r["motivo_nombre"] for r in motivo_rows}

        # Lotes "antiguos": en flujo activo pero SIN ningún movimiento con fecha_fin.
        # Suelen ser cargas históricas donde el operativo registró cantidades pero
        # no las fechas. Sin fecha no podemos calcular días parado, así que los
        # marcamos como nivel='antiguo'.
        rows_antiguos = await conn.fetch("""
            SELECT
                r.id AS registro_id,
                r.n_corte,
                r.estado AS estado_actual,
                r.urgente,
                COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
                COALESCE(marca.nombre, r.modelo_manual->>'marca_texto') AS marca_nombre,
                COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto', '') AS tipo_nombre,
                COALESCE(en.nombre, r.modelo_manual->>'entalle_texto', '') AS entalle_nombre,
                COALESCE(te.nombre, r.modelo_manual->>'tela_texto', '') AS tela_nombre,
                COALESCE(he.nombre, r.modelo_manual->>'hilo_especifico_texto', '') AS hilo_especifico_nombre
            FROM produccion.prod_registros r
            LEFT JOIN produccion.prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN produccion.prod_marcas marca ON marca.id = mod.marca_id
            LEFT JOIN produccion.prod_tipos tp ON tp.id = mod.tipo_id
            LEFT JOIN produccion.prod_entalles en ON en.id = mod.entalle_id
            LEFT JOIN produccion.prod_telas te ON te.id = mod.tela_id
            LEFT JOIN produccion.prod_hilos_especificos he ON he.id = COALESCE(mod.hilo_especifico_id, r.hilo_especifico_id)
            WHERE r.estado NOT IN ('Almacen PT', 'Tienda')
              AND NOT EXISTS (
                  SELECT 1 FROM produccion.prod_movimientos_produccion m
                  WHERE m.registro_id = r.id AND m.fecha_fin IS NOT NULL
              )
        """)

        items = []
        resumen = {"total": 0, "en_espera": 0, "criticos": 0, "dias_perdidos": 0, "sin_motivo": 0}

        for row in rows:
            fecha_fin = row["fecha_termino"]
            siguiente = row["siguiente_iniciado"]
            dias_parado = (hoy - fecha_fin).days if fecha_fin else 0

            en_espera = not siguiente

            # Filtro por defecto: solo los que están en espera
            if not incluir_resueltos and not en_espera:
                continue

            nivel = 'ok'
            if en_espera:
                if dias_parado >= 7:
                    nivel = 'critico'
                elif dias_parado >= 3:
                    nivel = 'atencion'
                else:
                    nivel = 'espera'

            reg_id = row["registro_id"]
            inc_info = inc_map.get(reg_id, {"abiertas": 0, "total": 0})
            motivo = motivo_map.get(reg_id, None)

            items.append({
                "registro_id": str(reg_id),
                "n_corte": row["n_corte"],
                "urgente": row["urgente"],
                "modelo": row["modelo_nombre"],
                "marca": row["marca_nombre"],
                "tipo": row["tipo_nombre"],
                "entalle": row["entalle_nombre"],
                "tela": row["tela_nombre"],
                "hilo_especifico": row["hilo_especifico_nombre"],
                "ultimo_servicio": row["ultimo_servicio"],
                "ultima_persona": row["ultima_persona"],
                "fecha_termino": str(fecha_fin) if fecha_fin else None,
                "estado_actual": row["estado_actual"],
                "dias_parado": dias_parado,
                "en_espera": en_espera,
                "nivel": nivel,
                "inc_abiertas": inc_info["abiertas"],
                "inc_total": inc_info["total"],
                "motivo": motivo,
            })

            if en_espera:
                resumen["en_espera"] += 1
                resumen["dias_perdidos"] += dias_parado
                if inc_info["abiertas"] == 0:
                    resumen["sin_motivo"] += 1
            if nivel == 'critico':
                resumen["criticos"] += 1

        # Lotes antiguos sin fecha — cuentan en total y en_espera (están parados),
        # pero no aportan días porque no podemos calcularlos.
        for row in rows_antiguos:
            reg_id = row["registro_id"]
            inc_info = inc_map.get(reg_id, {"abiertas": 0, "total": 0})
            motivo = motivo_map.get(reg_id, None)

            items.append({
                "registro_id": str(reg_id),
                "n_corte": row["n_corte"],
                "urgente": row["urgente"],
                "modelo": row["modelo_nombre"],
                "marca": row["marca_nombre"],
                "tipo": row["tipo_nombre"],
                "entalle": row["entalle_nombre"],
                "tela": row["tela_nombre"],
                "hilo_especifico": row["hilo_especifico_nombre"],
                "ultimo_servicio": None,
                "ultima_persona": None,
                "fecha_termino": None,
                "estado_actual": row["estado_actual"],
                "dias_parado": None,
                "en_espera": True,
                "nivel": "antiguo",
                "inc_abiertas": inc_info["abiertas"],
                "inc_total": inc_info["total"],
                "motivo": motivo,
            })

            resumen["en_espera"] += 1
            if inc_info["abiertas"] == 0:
                resumen["sin_motivo"] += 1

        resumen["total"] = len(items)

        # Ordenar: en espera primero, luego por días desc.
        # Los antiguos (dias_parado=None) van al final del bloque "en_espera".
        items.sort(key=lambda a: (
            0 if a["en_espera"] else 1,
            0 if a["dias_parado"] is not None else 1,
            -(a["dias_parado"] or 0),
        ))

        return {"items": items, "resumen": resumen}


@router.get("/costo-lote")
async def costo_por_lote(
    modelo_id: str = None,
    marca_id: str = None,
    marca_ids: str = None,
    tipo_ids: str = None,
    entalle_ids: str = None,
    tela_ids: str = None,
    estado: str = None,
    linea_negocio_id: str = None,
    incluir_sin_cierre: bool = False,
    empresa_id: int = Query(None),
):
    """Reporte completo de costos por lote: MP + Servicios + Otros + CIF.

    Cambios 2026-05-21 (Análisis de Costos y Rentabilidad):
      - `incluir_sin_cierre` default False: solo lotes con cierre ejecutado.
      - Filtros multi marca/tipo/entalle/tela (CSV de IDs).
      - JOIN con odoo.product_template para precio de venta y márgenes.
    """
    IGV = 1.18  # 18% IGV Perú. Asumimos list_price de Odoo viene con IGV.

    def _csv_to_list(s):
        if not s:
            return None
        out = [x.strip() for x in s.split(',') if x.strip()]
        return out or None

    marca_list = _csv_to_list(marca_ids)
    tipo_list = _csv_to_list(tipo_ids)
    entalle_list = _csv_to_list(entalle_ids)
    tela_list = _csv_to_list(tela_ids)

    pool = await get_pool()
    async with pool.acquire() as conn:
        # --- filtros dinámicos ---
        where_clauses = ["1=1"]
        params = []
        idx = 1

        if empresa_id is not None:
            where_clauses.append(f"r.empresa_id = ${idx}")
            params.append(empresa_id)
            idx += 1

        if modelo_id:
            where_clauses.append(f"r.modelo_id = ${idx}")
            params.append(modelo_id)
            idx += 1
        if marca_id:
            where_clauses.append(f"m.marca_id = ${idx}")
            params.append(marca_id)
            idx += 1
        if marca_list:
            where_clauses.append(
                f"(m.marca_id = ANY(${idx}::varchar[]) OR r.modelo_manual->>'marca_id' = ANY(${idx}::varchar[]))"
            )
            params.append(marca_list)
            idx += 1
        if tipo_list:
            where_clauses.append(
                f"(m.tipo_id = ANY(${idx}::varchar[]) OR r.modelo_manual->>'tipo_id' = ANY(${idx}::varchar[]))"
            )
            params.append(tipo_list)
            idx += 1
        if entalle_list:
            where_clauses.append(
                f"(m.entalle_id = ANY(${idx}::varchar[]) OR r.modelo_manual->>'entalle_id' = ANY(${idx}::varchar[]))"
            )
            params.append(entalle_list)
            idx += 1
        if tela_list:
            where_clauses.append(
                f"(m.tela_id = ANY(${idx}::varchar[]) OR r.modelo_manual->>'tela_id' = ANY(${idx}::varchar[]))"
            )
            params.append(tela_list)
            idx += 1
        if estado:
            where_clauses.append(f"r.estado = ${idx}")
            params.append(estado)
            idx += 1
        if linea_negocio_id:
            where_clauses.append(f"r.linea_negocio_id = ${idx}")
            params.append(linea_negocio_id)
            idx += 1
        if not incluir_sin_cierre:
            where_clauses.append("c.id IS NOT NULL")

        where_sql = " AND ".join(where_clauses)

        query = f"""
        SELECT
            r.id,
            r.n_corte,
            r.estado,
            r.urgente,
            COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
            COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') AS marca_nombre,
            COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto') AS tipo_nombre,
            COALESCE(en.nombre, r.modelo_manual->>'entalle_texto') AS entalle_nombre,
            COALESCE(te.nombre, r.modelo_manual->>'tela_texto') AS tela_nombre,
            r.curva,
            c.id AS cierre_id,
            c.costo_mp,
            c.costo_servicios,
            c.otros_costos AS costo_otros,
            c.costo_cif,
            c.costo_total AS cierre_costo_total,
            c.qty_terminada AS cantidad_producida,
            -- Live: costo MP (salidas de inventario)
            COALESCE((
                SELECT SUM(s.costo_total)
                FROM produccion.prod_inventario_salidas s
                WHERE s.registro_id = r.id
            ), 0) AS live_costo_mp,
            -- Live: costo servicios (movimientos produccion)
            COALESCE((
                SELECT SUM(mp.costo_calculado)
                FROM produccion.prod_movimientos_produccion mp
                WHERE mp.registro_id = r.id
            ), 0) AS live_costo_servicios,
            -- Live: otros costos
            COALESCE((
                SELECT SUM(cs.monto)
                FROM produccion.prod_registro_costos_servicio cs
                WHERE cs.registro_id = r.id
            ), 0) AS live_costo_otros,
            -- Tallas con cantidades reales
            r.tallas AS tallas_json
        FROM produccion.prod_registros r
        LEFT JOIN produccion.prod_modelos m ON m.id = r.modelo_id
        LEFT JOIN produccion.prod_marcas ma ON ma.id = m.marca_id
        LEFT JOIN produccion.prod_tipos tp ON tp.id = m.tipo_id
        LEFT JOIN produccion.prod_entalles en ON en.id = m.entalle_id
        LEFT JOIN produccion.prod_telas te ON te.id = m.tela_id
        LEFT JOIN produccion.prod_registro_cierre c ON c.registro_id = r.id
        WHERE {where_sql}
        ORDER BY r.fecha_creacion DESC
        """

        rows = await conn.fetch(query, *params)

        # ── Distribución Esperada por registro (fuente del precio Odoo) ──
        # Una sola query trae todas las líneas; agrupamos en memoria.
        registro_ids = [r["id"] for r in rows]
        dist_por_registro: dict = {}  # registro_id -> [{tipo_salida, template_id, template_nombre, cantidad, list_price}]
        if registro_ids:
            dist_rows = await conn.fetch("""
                SELECT d.registro_id, d.tipo_salida, d.product_template_id_odoo,
                       d.cantidad, pt.name AS template_nombre, pt.list_price
                  FROM produccion.prod_registro_pt_relacion d
                  LEFT JOIN odoo.product_template pt ON pt.odoo_id = d.product_template_id_odoo
                 WHERE d.registro_id = ANY($1::varchar[])
            """, registro_ids)
            for d in dist_rows:
                dist_por_registro.setdefault(d["registro_id"], []).append({
                    "tipo_salida": d["tipo_salida"],
                    "template_id": d["product_template_id_odoo"],
                    "template_nombre": d["template_nombre"],
                    "cantidad": float(d["cantidad"] or 0),
                    "list_price": float(d["list_price"] or 0) if d["list_price"] is not None else None,
                })

        items = []
        totales = {
            "costo_mp": 0,
            "costo_servicios": 0,
            "costo_otros": 0,
            "costo_cif": 0,
            "costo_total": 0,
            "cantidad_prendas": 0,
        }

        for row in rows:
            cerrado = row["cierre_id"] is not None

            if cerrado:
                cmp = float(row["costo_mp"] or 0)
                cserv = float(row["costo_servicios"] or 0)
                cotros = float(row["costo_otros"] or 0)
                ccif = float(row["costo_cif"] or 0)
                ctotal = float(row["cierre_costo_total"] or 0)
                cant = int(row["cantidad_producida"] or 0)
            else:
                cmp = float(row["live_costo_mp"] or 0)
                cserv = float(row["live_costo_servicios"] or 0)
                cotros = float(row["live_costo_otros"] or 0)
                ccif = 0
                ctotal = cmp + cserv + cotros
                # Calcular cantidad real de tallas
                cant = 0
                try:
                    tallas = row["tallas_json"]
                    if tallas:
                        import json as _json
                        if isinstance(tallas, str):
                            tallas = _json.loads(tallas)
                        if isinstance(tallas, list):
                            cant = sum(int(t.get("cantidad", 0)) for t in tallas if isinstance(t, dict))
                except Exception:
                    cant = 0

            costo_unitario = round(ctotal / cant, 2) if cant > 0 else 0

            # ── Precio desde Distribución Esperada (prod_registro_pt_relacion) ──
            # Por cada tipo_salida (normal / liquidacion_*) calculamos un
            # precio promedio ponderado por la cantidad declarada en sus
            # templates. Luego promediamos por tipo para obtener el precio
            # ponderado total del corte.
            dist_lineas = dist_por_registro.get(row["id"], [])
            tiene_distribucion = len(dist_lineas) > 0

            # Agrupar por tipo_salida
            por_tipo: dict = {}
            for d in dist_lineas:
                t = d["tipo_salida"] or "normal"
                por_tipo.setdefault(t, []).append(d)

            desglose_precios = []
            distribucion_qty_total = 0.0
            valor_total_con_igv = 0.0  # SUM(qty × list_price)
            for tipo, lineas_tipo in por_tipo.items():
                qty_tipo = sum(l["cantidad"] for l in lineas_tipo)
                # Solo líneas con list_price válido contribuyen al promedio
                lineas_con_precio = [l for l in lineas_tipo if l["list_price"] and l["list_price"] > 0]
                qty_con_precio = sum(l["cantidad"] for l in lineas_con_precio)
                valor_tipo = sum(l["cantidad"] * l["list_price"] for l in lineas_con_precio)
                precio_prom_tipo = round(valor_tipo / qty_con_precio, 2) if qty_con_precio > 0 else None
                precio_prom_tipo_sin_igv = round(precio_prom_tipo / IGV, 2) if precio_prom_tipo else None
                # Margen del tipo (contra costo_unitario del corte completo)
                margen_b_tipo = None
                margen_r_tipo = None
                if precio_prom_tipo and costo_unitario > 0:
                    margen_b_tipo = round((precio_prom_tipo - costo_unitario) / precio_prom_tipo * 100, 1)
                    if precio_prom_tipo_sin_igv:
                        margen_r_tipo = round((precio_prom_tipo_sin_igv - costo_unitario) / precio_prom_tipo_sin_igv * 100, 1)
                desglose_precios.append({
                    "tipo_salida": tipo,
                    "cantidad": qty_tipo,
                    "templates": [
                        {"template_id": l["template_id"], "nombre": l["template_nombre"],
                         "cantidad": l["cantidad"], "list_price": l["list_price"]}
                        for l in lineas_tipo
                    ],
                    "precio_promedio_con_igv": precio_prom_tipo,
                    "precio_promedio_sin_igv": precio_prom_tipo_sin_igv,
                    "valor_estimado": round(precio_prom_tipo * qty_tipo, 2) if precio_prom_tipo else None,
                    "margen_bruto_pct": margen_b_tipo,
                    "margen_real_pct": margen_r_tipo,
                })
                distribucion_qty_total += qty_tipo
                if precio_prom_tipo:
                    valor_total_con_igv += precio_prom_tipo * qty_tipo

            # Orden estable: normal primero, luego LQ
            orden_tipo = {"normal": 0, "liquidacion_leve": 1, "liquidacion_grave": 2}
            desglose_precios.sort(key=lambda x: orden_tipo.get(x["tipo_salida"], 99))

            precio_con_igv = round(valor_total_con_igv / distribucion_qty_total, 2) if (distribucion_qty_total > 0 and valor_total_con_igv > 0) else None
            precio_sin_igv = round(precio_con_igv / IGV, 2) if precio_con_igv else None
            tiene_precio = precio_con_igv is not None and precio_con_igv > 0

            margen_bruto = None
            margen_real = None
            if tiene_precio and costo_unitario > 0:
                margen_bruto = round((precio_con_igv - costo_unitario) / precio_con_igv * 100, 1)
                if precio_sin_igv and precio_sin_igv > 0:
                    margen_real = round((precio_sin_igv - costo_unitario) / precio_sin_igv * 100, 1)

            items.append({
                "id": row["id"],
                "n_corte": row["n_corte"],
                "modelo": row["modelo_nombre"],
                "marca": row["marca_nombre"],
                "tipo": row["tipo_nombre"],
                "entalle": row["entalle_nombre"],
                "tela": row["tela_nombre"],
                "estado": row["estado"],
                "urgente": row["urgente"],
                "cerrado": cerrado,
                "cantidad_prendas": cant,
                "costo_mp": round(cmp, 2),
                "costo_servicios": round(cserv, 2),
                "costo_otros": round(cotros, 2),
                "costo_cif": round(ccif, 2),
                "costo_total": round(ctotal, 2),
                "costo_unitario": costo_unitario,
                "tiene_distribucion": tiene_distribucion,
                "distribucion_qty": round(distribucion_qty_total, 2),
                "distribucion_incompleta": tiene_distribucion and cant > 0 and distribucion_qty_total < cant,
                "precio_con_igv": precio_con_igv,
                "precio_sin_igv": precio_sin_igv,
                "tiene_precio": tiene_precio,
                "margen_bruto_pct": margen_bruto,
                "margen_real_pct": margen_real,
                "valor_venta_estimado": round(precio_con_igv * distribucion_qty_total, 2) if tiene_precio else None,
                "desglose_precios": desglose_precios,
            })

            totales["costo_mp"] += cmp
            totales["costo_servicios"] += cserv
            totales["costo_otros"] += cotros
            totales["costo_cif"] += ccif
            totales["costo_total"] += ctotal
            totales["cantidad_prendas"] += cant

        # Redondear totales
        for k in totales:
            if isinstance(totales[k], float):
                totales[k] = round(totales[k], 2)

        return {"items": items, "totales": totales}


@router.get("/costo-lote/{registro_id}/detalle")
async def costo_lote_detalle(registro_id: str):
    """Detalle desglosado de costos para un lote específico."""
    IGV = 1.18
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Info del registro
        reg = await conn.fetchrow("""
            SELECT r.id, r.n_corte, r.estado, r.urgente, r.curva,
                   COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') AS marca,
                   r.tallas AS tallas_json,
                   c.id AS cierre_id, c.costo_mp AS cierre_mp,
                   c.costo_servicios AS cierre_serv, c.otros_costos AS cierre_otros,
                   c.costo_cif AS cierre_cif, c.costo_total AS cierre_total,
                   c.qty_terminada AS cierre_qty
            FROM produccion.prod_registros r
            LEFT JOIN produccion.prod_modelos m ON m.id = r.modelo_id
            LEFT JOIN produccion.prod_marcas ma ON ma.id = m.marca_id
            LEFT JOIN produccion.prod_registro_cierre c ON c.registro_id = r.id
            WHERE r.id = $1
        """, registro_id)

        # Distribución Esperada (fuente del precio)
        dist_rows = await conn.fetch("""
            SELECT d.tipo_salida, d.product_template_id_odoo,
                   d.cantidad, pt.name AS template_nombre, pt.list_price
              FROM produccion.prod_registro_pt_relacion d
              LEFT JOIN odoo.product_template pt ON pt.odoo_id = d.product_template_id_odoo
             WHERE d.registro_id = $1
        """, registro_id)

        if not reg:
            from fastapi import HTTPException
            raise HTTPException(404, "Registro no encontrado")

        # Detalle MP (salidas de inventario)
        mp_rows = await conn.fetch("""
            SELECT s.id, i.nombre AS item, i.codigo, s.cantidad, s.costo_total, s.fecha
            FROM produccion.prod_inventario_salidas s
            LEFT JOIN produccion.prod_inventario i ON i.id = s.item_id
            WHERE s.registro_id = $1
            ORDER BY s.fecha DESC
        """, registro_id)

        # Detalle servicios (movimientos producción)
        serv_rows = await conn.fetch("""
            SELECT mp.id, sv.nombre AS servicio, p.nombre AS persona,
                   mp.cantidad_enviada, mp.cantidad_recibida, mp.tarifa_aplicada,
                   mp.costo_calculado, mp.fecha_inicio, mp.fecha_fin, mp.detalle_costos
            FROM produccion.prod_movimientos_produccion mp
            LEFT JOIN produccion.prod_servicios_produccion sv ON sv.id = mp.servicio_id
            LEFT JOIN produccion.prod_personas_produccion p ON p.id = mp.persona_id
            WHERE mp.registro_id = $1
            ORDER BY mp.fecha_inicio DESC
        """, registro_id)

        # Detalle otros costos
        otros_rows = await conn.fetch("""
            SELECT cs.id, cs.descripcion, cs.proveedor_texto AS proveedor,
                   cs.monto, cs.fecha
            FROM produccion.prod_registro_costos_servicio cs
            WHERE cs.registro_id = $1
            ORDER BY cs.fecha DESC
        """, registro_id)

        cerrado = reg["cierre_id"] is not None

        mp_items = [{"item": r["item"], "codigo": r["codigo"], "cantidad": float(r["cantidad"] or 0),
                      "costo": float(r["costo_total"] or 0), "fecha": str(r["fecha"]) if r["fecha"] else None}
                     for r in mp_rows]

        serv_items = [{"servicio": r["servicio"], "persona": r["persona"],
                        "enviadas": int(r["cantidad_enviada"] or 0), "recibidas": int(r["cantidad_recibida"] or 0),
                        "tarifa": float(r["tarifa_aplicada"] or 0), "costo": float(r["costo_calculado"] or 0),
                        "fecha_inicio": str(r["fecha_inicio"]) if r["fecha_inicio"] else None,
                        "fecha_fin": str(r["fecha_fin"]) if r["fecha_fin"] else None,
                        "detalle_costos": parse_jsonb(r["detalle_costos"]) if r.get("detalle_costos") else None,
                        } for r in serv_rows]

        otros_items = [{"descripcion": r["descripcion"], "proveedor": r["proveedor"],
                         "monto": float(r["monto"] or 0), "fecha": str(r["fecha"]) if r["fecha"] else None}
                       for r in otros_rows]

        total_mp = sum(x["costo"] for x in mp_items)
        total_serv = sum(x["costo"] for x in serv_items)
        total_otros = sum(x["monto"] for x in otros_items)

        costo_total = round(float(reg["cierre_total"]) if cerrado else (total_mp + total_serv + total_otros), 2)
        if cerrado:
            cant = int(reg["cierre_qty"] or 0)
        else:
            # Fallback: suma de tallas del registro (mismo criterio que /costo-lote)
            cant = 0
            try:
                tallas = reg["tallas_json"]
                if tallas:
                    import json as _json
                    if isinstance(tallas, str):
                        tallas = _json.loads(tallas)
                    if isinstance(tallas, list):
                        cant = sum(int(t.get("cantidad", 0)) for t in tallas if isinstance(t, dict))
            except Exception:
                cant = 0
        costo_unitario = round(costo_total / cant, 2) if cant > 0 else 0

        # ── Precio desde Distribución Esperada (mismo cálculo que /costo-lote) ──
        dist_lineas = [
            {
                "tipo_salida": d["tipo_salida"] or "normal",
                "template_id": d["product_template_id_odoo"],
                "template_nombre": d["template_nombre"],
                "cantidad": float(d["cantidad"] or 0),
                "list_price": float(d["list_price"] or 0) if d["list_price"] is not None else None,
            }
            for d in dist_rows
        ]
        por_tipo: dict = {}
        for d in dist_lineas:
            por_tipo.setdefault(d["tipo_salida"], []).append(d)

        desglose_precios = []
        distribucion_qty_total = 0.0
        valor_total_con_igv = 0.0
        for tipo, lineas_tipo in por_tipo.items():
            qty_tipo = sum(l["cantidad"] for l in lineas_tipo)
            lineas_con_precio = [l for l in lineas_tipo if l["list_price"] and l["list_price"] > 0]
            qty_con_precio = sum(l["cantidad"] for l in lineas_con_precio)
            valor_tipo = sum(l["cantidad"] * l["list_price"] for l in lineas_con_precio)
            precio_prom_tipo = round(valor_tipo / qty_con_precio, 2) if qty_con_precio > 0 else None
            precio_prom_tipo_sin_igv = round(precio_prom_tipo / IGV, 2) if precio_prom_tipo else None
            margen_b_tipo = None
            margen_r_tipo = None
            margen_b_soles_tipo = None
            margen_r_soles_tipo = None
            if precio_prom_tipo and costo_unitario > 0:
                margen_b_tipo = round((precio_prom_tipo - costo_unitario) / precio_prom_tipo * 100, 1)
                margen_b_soles_tipo = round(precio_prom_tipo - costo_unitario, 2)
                if precio_prom_tipo_sin_igv:
                    margen_r_tipo = round((precio_prom_tipo_sin_igv - costo_unitario) / precio_prom_tipo_sin_igv * 100, 1)
                    margen_r_soles_tipo = round(precio_prom_tipo_sin_igv - costo_unitario, 2)
            desglose_precios.append({
                "tipo_salida": tipo,
                "cantidad": qty_tipo,
                "templates": [
                    {"template_id": l["template_id"], "nombre": l["template_nombre"],
                     "cantidad": l["cantidad"], "list_price": l["list_price"]}
                    for l in lineas_tipo
                ],
                "precio_promedio_con_igv": precio_prom_tipo,
                "precio_promedio_sin_igv": precio_prom_tipo_sin_igv,
                "valor_estimado": round(precio_prom_tipo * qty_tipo, 2) if precio_prom_tipo else None,
                "margen_bruto_pct": margen_b_tipo,
                "margen_real_pct": margen_r_tipo,
                "margen_bruto_soles": margen_b_soles_tipo,
                "margen_real_soles": margen_r_soles_tipo,
            })
            distribucion_qty_total += qty_tipo
            if precio_prom_tipo:
                valor_total_con_igv += precio_prom_tipo * qty_tipo

        orden_tipo = {"normal": 0, "liquidacion_leve": 1, "liquidacion_grave": 2}
        desglose_precios.sort(key=lambda x: orden_tipo.get(x["tipo_salida"], 99))

        precio_con_igv = round(valor_total_con_igv / distribucion_qty_total, 2) if (distribucion_qty_total > 0 and valor_total_con_igv > 0) else None
        precio_sin_igv = round(precio_con_igv / IGV, 2) if precio_con_igv else None
        tiene_precio = precio_con_igv is not None and precio_con_igv > 0
        tiene_distribucion = len(dist_lineas) > 0

        margen_bruto_pct = None
        margen_real_pct = None
        margen_bruto_soles = None
        margen_real_soles = None
        if tiene_precio and costo_unitario > 0:
            margen_bruto_pct = round((precio_con_igv - costo_unitario) / precio_con_igv * 100, 1)
            margen_bruto_soles = round(precio_con_igv - costo_unitario, 2)
            if precio_sin_igv and precio_sin_igv > 0:
                margen_real_pct = round((precio_sin_igv - costo_unitario) / precio_sin_igv * 100, 1)
                margen_real_soles = round(precio_sin_igv - costo_unitario, 2)

        return {
            "registro_id": reg["id"],
            "n_corte": reg["n_corte"],
            "modelo": reg["modelo"],
            "marca": reg["marca"],
            "estado": reg["estado"],
            "urgente": reg["urgente"],
            "cerrado": cerrado,
            "cantidad_prendas": cant,
            "costo_unitario": costo_unitario,
            "resumen": {
                "costo_mp": round(float(reg["cierre_mp"]) if cerrado else total_mp, 2),
                "costo_servicios": round(float(reg["cierre_serv"]) if cerrado else total_serv, 2),
                "costo_otros": round(float(reg["cierre_otros"] or 0) if cerrado else total_otros, 2),
                "costo_cif": round(float(reg["cierre_cif"] or 0) if cerrado else 0, 2),
                "costo_total": costo_total,
            },
            "precio": {
                "tiene_distribucion": tiene_distribucion,
                "distribucion_qty": round(distribucion_qty_total, 2),
                "distribucion_incompleta": tiene_distribucion and cant > 0 and distribucion_qty_total < cant,
                "precio_con_igv": precio_con_igv,
                "precio_sin_igv": precio_sin_igv,
                "tiene_precio": tiene_precio,
                "margen_bruto_pct": margen_bruto_pct,
                "margen_real_pct": margen_real_pct,
                "margen_bruto_soles": margen_bruto_soles,
                "margen_real_soles": margen_real_soles,
                "desglose": desglose_precios,
            },
            "detalle_mp": mp_items,
            "detalle_servicios": serv_items,
            "detalle_otros": otros_items,
        }


@router.get("/costo-lote/{registro_id}/detalle-pdf")
async def costo_lote_detalle_pdf(registro_id: str):
    """Genera PDF del detalle de costos de un lote."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from fastapi.responses import StreamingResponse
    import io

    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("""
            SELECT r.id, r.n_corte, r.estado, r.urgente, r.tallas,
                   COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') AS marca,
                   c.id AS cierre_id, c.costo_mp AS cierre_mp,
                   c.costo_servicios AS cierre_serv, c.otros_costos AS cierre_otros,
                   c.costo_cif AS cierre_cif, c.costo_total AS cierre_total,
                   c.qty_terminada AS cierre_qty
            FROM produccion.prod_registros r
            LEFT JOIN produccion.prod_modelos m ON m.id = r.modelo_id
            LEFT JOIN produccion.prod_marcas ma ON ma.id = m.marca_id
            LEFT JOIN produccion.prod_registro_cierre c ON c.registro_id = r.id
            WHERE r.id = $1
        """, registro_id)

        if not reg:
            from fastapi import HTTPException
            raise HTTPException(404, "Registro no encontrado")

        mp_rows = await conn.fetch("""
            SELECT i.nombre AS item, i.codigo, s.cantidad, s.costo_total
            FROM produccion.prod_inventario_salidas s
            LEFT JOIN produccion.prod_inventario i ON i.id = s.item_id
            WHERE s.registro_id = $1
        """, registro_id)

        serv_rows = await conn.fetch("""
            SELECT sv.nombre AS servicio, p.nombre AS persona,
                   mp.cantidad_enviada, mp.tarifa_aplicada, mp.costo_calculado
            FROM produccion.prod_movimientos_produccion mp
            LEFT JOIN produccion.prod_servicios_produccion sv ON sv.id = mp.servicio_id
            LEFT JOIN produccion.prod_personas_produccion p ON p.id = mp.persona_id
            WHERE mp.registro_id = $1
        """, registro_id)

        otros_rows = await conn.fetch("""
            SELECT cs.descripcion, cs.proveedor_texto AS proveedor, cs.monto, cs.fecha
            FROM produccion.prod_registro_costos_servicio cs
            WHERE cs.registro_id = $1
        """, registro_id)

        cerrado = reg["cierre_id"] is not None

        # Calcular totales
        total_mp = sum(float(r["costo_total"] or 0) for r in mp_rows)
        total_serv = sum(float(r["costo_calculado"] or 0) for r in serv_rows)
        total_otros = sum(float(r["monto"] or 0) for r in otros_rows)

        if cerrado:
            r_mp = float(reg["cierre_mp"] or 0)
            r_serv = float(reg["cierre_serv"] or 0)
            r_otros = float(reg["cierre_otros"] or 0)
            r_cif = float(reg["cierre_cif"] or 0)
            r_total = float(reg["cierre_total"] or 0)
        else:
            r_mp, r_serv, r_otros = total_mp, total_serv, total_otros
            r_cif = 0
            r_total = r_mp + r_serv + r_otros

        # Cantidad prendas
        cant = 0
        try:
            tallas = reg["tallas"]
            if tallas:
                import json as _json
                if isinstance(tallas, str):
                    tallas = _json.loads(tallas)
                if isinstance(tallas, list):
                    cant = sum(int(t.get("cantidad", 0)) for t in tallas if isinstance(t, dict))
        except Exception:
            cant = 0

        costo_unit = round(r_total / cant, 2) if cant > 0 else 0

        # --- Generar PDF ---
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm, leftMargin=2*cm, rightMargin=2*cm)
        styles = getSampleStyleSheet()
        elements = []

        titulo_style = ParagraphStyle('titulo', parent=styles['Heading1'], fontSize=16, spaceAfter=6)
        sub_style = ParagraphStyle('sub', parent=styles['Normal'], fontSize=10, textColor=colors.grey)
        seccion_style = ParagraphStyle('seccion', parent=styles['Heading2'], fontSize=12, spaceBefore=14, spaceAfter=6,
                                        textColor=colors.HexColor('#1e40af'))

        elements.append(Paragraph(f"Detalle de Costos — Corte {reg['n_corte']}", titulo_style))
        elements.append(Paragraph(f"{reg['modelo'] or ''} | {reg['marca'] or ''} | Estado: {reg['estado']}"
                                   + (" | CERRADO" if cerrado else ""), sub_style))
        elements.append(Spacer(1, 0.4*cm))

        # Resumen general
        elements.append(Paragraph("Resumen de Costos", seccion_style))
        resumen_data = [
            ["Concepto", "Monto", "% del Total"],
            ["Materia Prima", f"S/ {r_mp:,.2f}", f"{round(r_mp/r_total*100) if r_total else 0}%"],
            ["Servicios", f"S/ {r_serv:,.2f}", f"{round(r_serv/r_total*100) if r_total else 0}%"],
            ["Otros Costos", f"S/ {r_otros:,.2f}", f"{round(r_otros/r_total*100) if r_total else 0}%"],
            ["CIF", f"S/ {r_cif:,.2f}", f"{round(r_cif/r_total*100) if r_total else 0}%"],
            ["TOTAL", f"S/ {r_total:,.2f}", "100%"],
        ]
        resumen_data.append(["", "", ""])
        resumen_data.append(["Cantidad Prendas", str(cant), ""])
        resumen_data.append(["Costo Unitario", f"S/ {costo_unit:,.2f}", ""])

        t = Table(resumen_data, colWidths=[8*cm, 5*cm, 3*cm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('BACKGROUND', (0, 5), (-1, 5), colors.HexColor('#eff6ff')),
            ('FONTNAME', (0, 5), (-1, 5), 'Helvetica-Bold'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 0.3*cm))

        # Detalle MP
        if mp_rows:
            elements.append(Paragraph("Materia Prima", seccion_style))
            mp_data = [["Material", "Codigo", "Cantidad", "Costo"]]
            for r in mp_rows:
                mp_data.append([
                    str(r["item"] or ""),
                    str(r["codigo"] or ""),
                    f"{float(r['cantidad'] or 0):,.2f}",
                    f"S/ {float(r['costo_total'] or 0):,.2f}",
                ])
            mp_data.append(["", "", "Subtotal", f"S/ {total_mp:,.2f}"])
            t2 = Table(mp_data, colWidths=[6*cm, 3*cm, 3*cm, 4*cm])
            t2.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#eff6ff')),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(t2)
            elements.append(Spacer(1, 0.3*cm))

        # Detalle Servicios
        if serv_rows:
            elements.append(Paragraph("Servicios", seccion_style))
            sv_data = [["Servicio", "Persona", "Enviadas", "Tarifa", "Costo"]]
            for r in serv_rows:
                sv_data.append([
                    str(r["servicio"] or ""),
                    str(r["persona"] or ""),
                    str(int(r["cantidad_enviada"] or 0)),
                    f"S/ {float(r['tarifa_aplicada'] or 0):,.2f}",
                    f"S/ {float(r['costo_calculado'] or 0):,.2f}",
                ])
            sv_data.append(["", "", "", "Subtotal", f"S/ {total_serv:,.2f}"])
            t3 = Table(sv_data, colWidths=[4*cm, 4*cm, 2.5*cm, 2.5*cm, 3*cm])
            t3.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7c3aed')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f5f3ff')),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(t3)
            elements.append(Spacer(1, 0.3*cm))

        # Detalle Otros
        if otros_rows:
            elements.append(Paragraph("Otros Costos", seccion_style))
            ot_data = [["Descripcion", "Proveedor", "Fecha", "Monto"]]
            for r in otros_rows:
                ot_data.append([
                    str(r["descripcion"] or ""),
                    str(r["proveedor"] or "—"),
                    str(r["fecha"] or "—"),
                    f"S/ {float(r['monto'] or 0):,.2f}",
                ])
            ot_data.append(["", "", "Subtotal", f"S/ {total_otros:,.2f}"])
            t4 = Table(ot_data, colWidths=[5*cm, 4*cm, 3*cm, 4*cm])
            t4.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#d97706')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#fffbeb')),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(t4)

        # CIF
        if cerrado and r_cif > 0:
            elements.append(Spacer(1, 0.3*cm))
            elements.append(Paragraph("CIF (Costos Indirectos de Fabricacion)", seccion_style))
            cif_data = [["Concepto", "Monto"], ["CIF asignado al cierre", f"S/ {r_cif:,.2f}"]]
            t5 = Table(cif_data, colWidths=[10*cm, 6*cm])
            t5.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ea580c')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(t5)

        doc.build(elements)
        buffer.seek(0)

        filename = f"costo_lote_corte_{reg['n_corte']}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={filename}"},
        )


# =====================================================================
# AGENDA DE ENTREGAS — basada en movimientos de producción
# =====================================================================

@router.get("/agenda-movimientos")
async def agenda_movimientos():
    """
    Devuelve movimientos de producción con sus fechas para la agenda.
    Para cada movimiento calcula la 'fecha_agenda':
      1) fecha_esperada_movimiento (si existe)
      2) fecha_fin (si ya terminó)
      3) fecha_inicio (si está en proceso, sin fecha esperada ni fin)
    Solo incluye registros no anulados.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT
                m.id as movimiento_id,
                m.registro_id,
                r.n_corte,
                r.estado_op,
                r.fecha_entrega_final,
                COALESCE(mo.nombre, r.modelo_manual->>'nombre_modelo') as modelo_nombre,
                COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') as marca_nombre,
                s.nombre as servicio_nombre,
                m.servicio_id,
                m.cantidad_enviada,
                m.cantidad_recibida,
                m.fecha_inicio,
                m.fecha_fin,
                m.fecha_esperada_movimiento,
                m.avance_porcentaje,
                p.nombre as persona_nombre,
                CASE
                    WHEN m.fecha_fin IS NOT NULL AND m.cantidad_recibida >= m.cantidad_enviada THEN 'completado'
                    WHEN m.fecha_fin IS NOT NULL THEN 'completado'
                    WHEN m.fecha_inicio IS NOT NULL THEN 'en_proceso'
                    ELSE 'pendiente'
                END as estado_mov,
                COALESCE(
                    m.fecha_esperada_movimiento,
                    m.fecha_fin,
                    m.fecha_inicio
                ) as fecha_agenda
            FROM prod_movimientos_produccion m
            JOIN prod_registros r ON m.registro_id = r.id
            LEFT JOIN prod_modelos mo ON r.modelo_id = mo.id
            LEFT JOIN prod_marcas ma ON mo.marca_id = ma.id
            LEFT JOIN prod_servicios_produccion s ON m.servicio_id = s.id
            LEFT JOIN prod_personas_produccion p ON m.persona_id = p.id
            WHERE r.estado_op NOT IN ('ANULADA')
              AND COALESCE(m.fecha_esperada_movimiento, m.fecha_fin, m.fecha_inicio) IS NOT NULL
            ORDER BY COALESCE(m.fecha_esperada_movimiento, m.fecha_fin, m.fecha_inicio), r.n_corte
        """
        rows = await conn.fetch(query)

        result = []
        for r in rows:
            d = dict(r)
            # Convertir dates a string
            for k in ('fecha_inicio', 'fecha_fin', 'fecha_esperada_movimiento', 'fecha_agenda', 'fecha_entrega_final'):
                if d.get(k):
                    d[k] = str(d[k])
            # Determinar el tipo de fecha que se usó
            if d.get('fecha_esperada_movimiento'):
                d['fecha_tipo'] = 'esperada'
            elif d.get('fecha_fin'):
                d['fecha_tipo'] = 'fin'
            else:
                d['fecha_tipo'] = 'inicio'
            result.append(d)

        return result


# ==================== RENDIMIENTO SERVICIOS EXTERNOS ====================

@router.get("/rendimiento-servicios")
async def rendimiento_servicios(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    empresa_id: int = Query(7),
):
    """
    Rendimiento de servicios externos por persona/proveedor:
    OPs asignadas, a tiempo, con atraso, promedio días atraso, % confiabilidad.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        where = ["r.empresa_id = $1", "m.fecha_inicio IS NOT NULL"]
        params = [empresa_id]
        idx = 2

        if fecha_desde:
            where.append(f"m.fecha_inicio >= ${idx}")
            params.append(date.fromisoformat(fecha_desde))
            idx += 1
        if fecha_hasta:
            where.append(f"m.fecha_inicio <= ${idx}")
            params.append(date.fromisoformat(fecha_hasta))
            idx += 1

        where_sql = " AND ".join(where)

        rows = await conn.fetch(f"""
            SELECT
                pp.id as persona_id,
                pp.nombre as persona,
                pp.tipo_persona,
                sp.id as servicio_id,
                sp.nombre as servicio,
                COUNT(DISTINCT m.id) as total_movimientos,
                COUNT(DISTINCT m.id) FILTER (WHERE m.fecha_fin IS NOT NULL) as completados,
                COUNT(DISTINCT m.id) FILTER (
                    WHERE m.fecha_fin IS NOT NULL
                    AND m.fecha_esperada_movimiento IS NOT NULL
                    AND m.fecha_fin <= m.fecha_esperada_movimiento
                ) as a_tiempo,
                COUNT(DISTINCT m.id) FILTER (
                    WHERE m.fecha_fin IS NOT NULL
                    AND m.fecha_esperada_movimiento IS NOT NULL
                    AND m.fecha_fin > m.fecha_esperada_movimiento
                ) as con_atraso,
                COALESCE(AVG(
                    CASE WHEN m.fecha_fin IS NOT NULL
                         AND m.fecha_esperada_movimiento IS NOT NULL
                         AND m.fecha_fin > m.fecha_esperada_movimiento
                    THEN (m.fecha_fin - m.fecha_esperada_movimiento)
                    END
                ), 0) as prom_dias_atraso,
                COUNT(DISTINCT m.id) FILTER (
                    WHERE m.fecha_fin IS NULL
                    AND m.fecha_esperada_movimiento IS NOT NULL
                    AND m.fecha_esperada_movimiento < CURRENT_DATE
                ) as vencidos_abiertos,
                COALESCE(SUM(m.cantidad_enviada), 0) as total_prendas,
                COALESCE(SUM(m.costo_calculado), 0) as costo_total
            FROM prod_movimientos_produccion m
            JOIN prod_registros r ON r.id = m.registro_id
            JOIN prod_servicios_produccion sp ON sp.id = m.servicio_id
            LEFT JOIN prod_personas_produccion pp ON pp.id = m.persona_id
            WHERE {where_sql}
              AND m.persona_id IS NOT NULL
            GROUP BY pp.id, pp.nombre, pp.tipo_persona, sp.id, sp.nombre
            ORDER BY total_movimientos DESC
        """, *params)

        items = []
        mejor = None
        peor = None
        total_conf = 0
        total_con_conf = 0

        for row in rows:
            completados = row["completados"] or 0
            a_tiempo = row["a_tiempo"] or 0
            con_atraso = row["con_atraso"] or 0
            evaluables = a_tiempo + con_atraso
            confiabilidad = round((a_tiempo / evaluables * 100), 1) if evaluables > 0 else None

            item = {
                "persona_id": str(row["persona_id"]) if row["persona_id"] else None,
                "persona": row["persona"] or "Sin asignar",
                "tipo_persona": row["tipo_persona"],
                "servicio_id": str(row["servicio_id"]),
                "servicio": row["servicio"],
                "total_movimientos": row["total_movimientos"],
                "completados": completados,
                "a_tiempo": a_tiempo,
                "con_atraso": con_atraso,
                "vencidos_abiertos": row["vencidos_abiertos"] or 0,
                "prom_dias_atraso": round(float(row["prom_dias_atraso"]), 1),
                "confiabilidad": confiabilidad,
                "total_prendas": int(row["total_prendas"]),
                "costo_total": float(row["costo_total"]),
            }
            items.append(item)

            if confiabilidad is not None:
                total_conf += confiabilidad
                total_con_conf += 1
                if mejor is None or confiabilidad > mejor["confiabilidad"]:
                    mejor = item
                if peor is None or confiabilidad < peor["confiabilidad"]:
                    peor = item

        promedio_general = round(total_conf / total_con_conf, 1) if total_con_conf > 0 else None

        return {
            "items": items,
            "resumen": {
                "total_proveedores": len(items),
                "promedio_confiabilidad": promedio_general,
                "mejor": {"persona": mejor["persona"], "servicio": mejor["servicio"], "confiabilidad": mejor["confiabilidad"]} if mejor else None,
                "peor": {"persona": peor["persona"], "servicio": peor["servicio"], "confiabilidad": peor["confiabilidad"]} if peor else None,
            },
        }


# ============================================================================
# REPORTE: DESPACHOS A TIENDA
# ============================================================================
# Lista los lotes que se enviaron a tienda en un rango de fechas.
# 'Tienda' no es un estado productivo — es el evento de despacho al local.
# Requisito: la columna prod_registros.fecha_envio_tienda se captura al
# transicionar el estado a 'Tienda' (ver routes/registros_main.py).
@router.get("/despachos-tienda")
async def reporte_despachos_tienda(
    desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    linea_negocio_id: Optional[int] = Query(None),
    user=Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Default: últimos 30 días si no viene rango
        hoy = date.today()
        if not desde and not hasta:
            from datetime import timedelta
            desde_dt = hoy - timedelta(days=30)
            hasta_dt = hoy
        else:
            try:
                desde_dt = date.fromisoformat(desde) if desde else date(2000, 1, 1)
            except Exception:
                desde_dt = date(2000, 1, 1)
            try:
                hasta_dt = date.fromisoformat(hasta) if hasta else hoy
            except Exception:
                hasta_dt = hoy

        where_clauses = [
            "r.fecha_envio_tienda IS NOT NULL",
            "r.fecha_envio_tienda::date >= $1",
            "r.fecha_envio_tienda::date <= $2",
        ]
        params = [desde_dt, hasta_dt]
        if linea_negocio_id is not None:
            where_clauses.append(f"r.linea_negocio_id = ${len(params) + 1}")
            params.append(linea_negocio_id)

        where_sql = " AND ".join(where_clauses)

        rows = await conn.fetch(f"""
            SELECT
                r.id,
                r.n_corte,
                r.urgente,
                r.fecha_envio_tienda,
                r.fecha_inicio_real,
                r.fecha_creacion,
                r.estado,
                COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
                COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') AS marca_nombre,
                COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto', '') AS tipo_nombre,
                COALESCE(te.nombre, r.modelo_manual->>'tela_texto', '') AS tela_nombre,
                COALESCE(ln.nombre, '') AS linea_negocio_nombre,
                r.linea_negocio_id,
                r.tallas,
                (SELECT c.qty_terminada FROM prod_registro_cierre c WHERE c.registro_id = r.id) AS qty_cierre,
                (SELECT c.costo_total FROM prod_registro_cierre c WHERE c.registro_id = r.id) AS costo_total_cierre
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON m.id = r.modelo_id
            LEFT JOIN prod_marcas ma ON ma.id = m.marca_id
            LEFT JOIN prod_tipos tp ON tp.id = m.tipo_id
            LEFT JOIN prod_telas te ON te.id = m.tela_id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON ln.id = r.linea_negocio_id
            WHERE {where_sql}
            ORDER BY r.fecha_envio_tienda DESC
        """, *params)

        items = []
        total_prendas = 0
        total_valor = 0.0
        for r in rows:
            # Cantidad final: qty del cierre si existe, sino suma de tallas
            qty = r["qty_cierre"]
            if qty is None or qty == 0:
                tallas_raw = r["tallas"]
                if tallas_raw:
                    try:
                        tallas = tallas_raw if isinstance(tallas_raw, list) else json.loads(tallas_raw)
                        qty = sum(int(t.get("cantidad", 0)) for t in tallas if isinstance(t, dict))
                    except Exception:
                        qty = 0
                else:
                    qty = 0
            costo = float(r["costo_total_cierre"] or 0)
            total_prendas += int(qty or 0)
            total_valor += costo
            items.append({
                "registro_id": str(r["id"]),
                "n_corte": r["n_corte"],
                "urgente": r["urgente"],
                "fecha_envio_tienda": r["fecha_envio_tienda"].isoformat() + 'Z' if r["fecha_envio_tienda"] else None,
                "fecha_inicio_real": str(r["fecha_inicio_real"]) if r["fecha_inicio_real"] else None,
                "modelo": r["modelo_nombre"] or '—',
                "marca": r["marca_nombre"] or '—',
                "tipo": r["tipo_nombre"] or '',
                "tela": r["tela_nombre"] or '',
                "linea_negocio": r["linea_negocio_nombre"] or '—',
                "prendas": int(qty or 0),
                "costo_total": costo,
                "costo_unitario": round(costo / qty, 4) if qty and qty > 0 else 0,
            })

        return {
            "items": items,
            "resumen": {
                "total_lotes": len(items),
                "total_prendas": total_prendas,
                "total_valor": round(total_valor, 2),
                "desde": str(desde_dt),
                "hasta": str(hasta_dt),
            },
        }


# ==================== MOVIMIENTOS DE COSTO (Reporte para Finanzas) ====================

@router.get("/movimientos-costos")
async def movimientos_costos(
    fecha_desde: Optional[str] = Query(None, description="YYYY-MM-DD (fecha_inicio del movimiento)"),
    fecha_hasta: Optional[str] = Query(None, description="YYYY-MM-DD inclusive"),
    servicio_id: Optional[str] = Query(None),
    persona_id: Optional[str] = Query(None),
    facturado: Optional[str] = Query(None, description="'si' | 'no' | null para todos"),
    tipo_persona: Optional[str] = Query(None, description="'INTERNO' | 'EXTERNO' | null para todos"),
    _u=Depends(get_current_user),
):
    """
    Lista detallada de movimientos de producción con información de corte, modelo,
    persona, servicio y costo referencial. Diseñado para conciliar con Finanzas.

    Filtros:
    - Rango de fechas (sobre fecha_inicio del movimiento)
    - Servicio
    - Persona (en cascada: usualmente se filtra por servicio primero, luego persona)
    - Estado de facturación: si / no / todos

    Devuelve tanto los movimientos individuales como un resumen agrupado por factura
    cuando ya están vinculados, para identificar "gastos con múltiples cortes".
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["COALESCE(mp.costo_calculado, 0) >= 0"]
        params: list = []
        idx = 1

        # asyncpg requiere objetos date, no strings
        if fecha_desde:
            try:
                fd = date.fromisoformat(fecha_desde)
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="fecha_desde con formato inválido (YYYY-MM-DD)")
            conditions.append(f"mp.fecha_inicio >= ${idx}")
            params.append(fd)
            idx += 1
        if fecha_hasta:
            try:
                fh = date.fromisoformat(fecha_hasta)
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="fecha_hasta con formato inválido (YYYY-MM-DD)")
            conditions.append(f"mp.fecha_inicio <= ${idx}")
            params.append(fh)
            idx += 1
        if servicio_id:
            conditions.append(f"mp.servicio_id = ${idx}")
            params.append(servicio_id)
            idx += 1
        if persona_id:
            conditions.append(f"mp.persona_id = ${idx}")
            params.append(persona_id)
            idx += 1
        if facturado == "si":
            conditions.append("mp.factura_numero IS NOT NULL")
        elif facturado == "no":
            conditions.append("mp.factura_numero IS NULL")
        if tipo_persona in ("INTERNO", "EXTERNO"):
            conditions.append(f"COALESCE(p.tipo_persona, 'EXTERNO') = ${idx}")
            params.append(tipo_persona)
            idx += 1

        where = " AND ".join(conditions)

        rows = await conn.fetch(f"""
            SELECT
                mp.id AS movimiento_id,
                mp.registro_id,
                mp.servicio_id,
                mp.persona_id,
                mp.fecha_inicio,
                mp.fecha_fin,
                mp.cantidad_enviada,
                mp.cantidad_recibida,
                mp.tarifa_aplicada,
                mp.costo_calculado,
                mp.factura_numero,
                mp.factura_id,
                s.nombre  AS servicio_nombre,
                p.nombre  AS persona_nombre,
                COALESCE(p.tipo_persona, 'EXTERNO') AS persona_tipo,
                p.unidad_interna_id AS unidad_interna_id,
                ui.nombre AS unidad_interna_nombre,
                r.n_corte AS n_corte,
                COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
                COALESCE(ma.nombre, r.modelo_manual->>'marca_texto')  AS marca_nombre,
                COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto')   AS tipo_nombre,
                (
                    SELECT COALESCE(SUM(cantidad_real), 0)::int
                    FROM prod_registro_tallas rt
                    WHERE rt.registro_id = r.id
                ) AS prendas_registro,
                EXISTS(
                    SELECT 1 FROM finanzas2.fin_cargo_interno ci
                    WHERE ci.movimiento_id = mp.id
                ) AS tiene_cargo_interno
            FROM prod_movimientos_produccion mp
            LEFT JOIN prod_servicios_produccion s ON mp.servicio_id = s.id
            LEFT JOIN prod_personas_produccion  p ON mp.persona_id  = p.id
            LEFT JOIN finanzas2.fin_unidad_interna ui ON p.unidad_interna_id = ui.id
            LEFT JOIN prod_registros            r ON mp.registro_id = r.id
            LEFT JOIN prod_modelos              m ON r.modelo_id    = m.id
            LEFT JOIN prod_marcas               ma ON m.marca_id    = ma.id
            LEFT JOIN prod_tipos                tp ON m.tipo_id     = tp.id
            WHERE {where}
            ORDER BY mp.fecha_inicio DESC NULLS LAST, r.n_corte DESC
            LIMIT 1000
        """, *params)

        items = []
        total_costo = 0.0
        total_prendas = 0
        personas_set = set()
        facturados = 0
        pendientes = 0
        internos = 0
        externos = 0
        costo_interno = 0.0
        costo_externo = 0.0
        by_factura: dict = {}
        by_unidad: dict = {}

        for r in rows:
            d = row_to_dict(r)
            # Normalizar fechas
            for f in ("fecha_inicio", "fecha_fin"):
                if d.get(f):
                    d[f] = str(d[f])
            costo = safe_float(d.get("costo_calculado"))
            qty_rec = safe_int(d.get("cantidad_recibida"))
            qty_env = safe_int(d.get("cantidad_enviada"))
            # "cantidad de prendas" = cantidad_recibida si ya está, sino la del corte
            d["prendas"] = qty_rec if qty_rec else safe_int(d.get("prendas_registro"))
            d["facturado"] = bool(d.get("factura_numero"))
            d["es_interno"] = d.get("persona_tipo") == "INTERNO"

            total_costo += costo
            total_prendas += d["prendas"]
            if d.get("persona_nombre"):
                personas_set.add(d["persona_nombre"])
            if d["es_interno"]:
                internos += 1
                costo_interno += costo
                # agrupar por unidad interna
                uid = d.get("unidad_interna_id")
                if uid:
                    g = by_unidad.setdefault(uid, {
                        "unidad_interna_id": uid,
                        "unidad_interna_nombre": d.get("unidad_interna_nombre"),
                        "movimientos": 0,
                        "costo_total": 0.0,
                        "con_cargo": 0,
                        "sin_cargo": 0,
                    })
                    g["movimientos"] += 1
                    g["costo_total"] += costo
                    if d.get("tiene_cargo_interno"):
                        g["con_cargo"] += 1
                    else:
                        g["sin_cargo"] += 1
            else:
                externos += 1
                costo_externo += costo
            if d["facturado"]:
                facturados += 1
                key = d.get("factura_id") or d.get("factura_numero")
                g = by_factura.setdefault(key, {
                    "factura_numero": d.get("factura_numero"),
                    "factura_id": d.get("factura_id"),
                    "movimientos": 0,
                    "costo_total": 0.0,
                    "cortes": set(),
                })
                g["movimientos"] += 1
                g["costo_total"] += costo
                if d.get("n_corte"):
                    g["cortes"].add(d["n_corte"])
            else:
                pendientes += 1
            items.append(d)

        # Reformatear agrupado por factura (set -> list)
        facturas_resumen = []
        for k, v in by_factura.items():
            facturas_resumen.append({
                "factura_numero": v["factura_numero"],
                "factura_id": v["factura_id"],
                "movimientos": v["movimientos"],
                "costo_total": round(v["costo_total"], 2),
                "cortes": sorted(list(v["cortes"])),
            })
        facturas_resumen.sort(key=lambda x: -x["costo_total"])

        unidades_resumen = []
        for v in by_unidad.values():
            unidades_resumen.append({
                **v,
                "costo_total": round(v["costo_total"], 2),
            })
        unidades_resumen.sort(key=lambda x: -x["costo_total"])

        return {
            "items": items,
            "resumen": {
                "total_movimientos": len(items),
                "total_costo": round(total_costo, 2),
                "total_prendas": total_prendas,
                "personas_distintas": len(personas_set),
                "facturados": facturados,
                "pendientes": pendientes,
                "internos": internos,
                "externos": externos,
                "costo_interno": round(costo_interno, 2),
                "costo_externo": round(costo_externo, 2),
            },
            "facturas": facturas_resumen,
            "unidades_internas": unidades_resumen,
        }


class VincularFacturaBulkInput(BaseModel):
    movimiento_ids: list[str]
    factura_numero: str
    factura_id: str


@router.post("/movimientos-costos/vincular-factura-bulk")
async def vincular_factura_bulk(
    input: VincularFacturaBulkInput,
    _u=Depends(get_current_user),
):
    """Vincula una misma factura a varios movimientos de producción.
    Permite cubrir el caso 'una factura / un gasto con varios cortes'."""
    if not input.movimiento_ids:
        raise HTTPException(status_code=400, detail="Lista de movimientos vacía")
    if not input.factura_numero.strip():
        raise HTTPException(status_code=400, detail="factura_numero es obligatorio")
    if not input.factura_id.strip():
        raise HTTPException(status_code=400, detail="factura_id es obligatorio")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.execute(
                """
                UPDATE prod_movimientos_produccion
                SET factura_numero = $1, factura_id = $2
                WHERE id = ANY($3::text[])
                """,
                input.factura_numero.strip(),
                input.factura_id.strip(),
                input.movimiento_ids,
            )
    # result es tipo "UPDATE N"
    try:
        affected = int(result.split()[-1])
    except Exception:
        affected = 0
    return {
        "message": f"{affected} movimiento(s) vinculados a {input.factura_numero}",
        "movimientos_actualizados": affected,
        "factura_numero": input.factura_numero,
        "factura_id": input.factura_id,
    }


@router.post("/movimientos-costos/desvincular-factura-bulk")
async def desvincular_factura_bulk(
    movimiento_ids: list[str],
    _u=Depends(get_current_user),
):
    """Rompe el vínculo con factura de varios movimientos."""
    if not movimiento_ids:
        raise HTTPException(status_code=400, detail="Lista de movimientos vacía")
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE prod_movimientos_produccion
            SET factura_numero = NULL, factura_id = NULL
            WHERE id = ANY($1::text[])
            """,
            movimiento_ids,
        )
    try:
        affected = int(result.split()[-1])
    except Exception:
        affected = 0
    return {
        "message": f"{affected} movimiento(s) desvinculados",
        "movimientos_actualizados": affected,
    }


class GenerarCargosInternosInput(BaseModel):
    movimiento_ids: list[str]


@router.post("/movimientos-costos/generar-cargos-internos")
async def generar_cargos_internos_seleccion(
    input: GenerarCargosInternosInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Genera cargos internos (fin_cargo_interno) para los movimientos seleccionados,
    equivalente al POST /cargos-internos/generar de Finanzas pero acotado a los
    movimiento_ids que mandes.

    Para cada movimiento:
    - Valida que la persona sea INTERNO y tenga unidad_interna_id
    - Inserta fin_cargo_interno (ON CONFLICT DO NOTHING por movimiento_id)
    - Registra INGRESO en la cuenta ficticia de la unidad
    - Suma el importe al saldo_actual de esa cuenta

    Skipea movimientos que ya tienen cargo (idempotente) o que no cumplen reglas.
    """
    if not input.movimiento_ids:
        raise HTTPException(status_code=400, detail="Lista de movimientos vacía")

    empresa_id = current_user.get("empresa_id") or 7

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Traer los movimientos con info enriquecida y validar persona INTERNO
        movs = await conn.fetch(
            """
            SELECT mp.id AS movimiento_id, mp.registro_id, mp.servicio_id, mp.persona_id,
                   mp.cantidad_recibida, mp.cantidad_enviada, mp.tarifa_aplicada, mp.costo_calculado,
                   COALESCE(mp.fecha_fin, mp.fecha_inicio, mp.created_at::date) AS fecha,
                   p.nombre AS persona_nombre,
                   p.unidad_interna_id,
                   COALESCE(p.tipo_persona, 'EXTERNO') AS persona_tipo,
                   s.nombre AS servicio_nombre
            FROM prod_movimientos_produccion mp
            JOIN prod_personas_produccion p ON p.id = mp.persona_id
            LEFT JOIN prod_servicios_produccion s ON s.id = mp.servicio_id
            WHERE mp.id = ANY($1::text[])
            """,
            input.movimiento_ids,
        )
        if not movs:
            raise HTTPException(status_code=404, detail="No se encontraron movimientos")

        no_internos = [m["movimiento_id"] for m in movs if m["persona_tipo"] != "INTERNO"]
        if no_internos:
            raise HTTPException(
                status_code=400,
                detail=f"{len(no_internos)} movimiento(s) son de personas EXTERNO — usá 'Generar factura borrador' para ellos.",
            )
        sin_unidad = [m["movimiento_id"] for m in movs if not m["unidad_interna_id"]]
        if sin_unidad:
            raise HTTPException(
                status_code=400,
                detail=f"{len(sin_unidad)} persona(s) INTERNO no tienen unidad asignada. Asignales una unidad en el maestro de personas.",
            )

        generados = 0
        saltados = 0
        errores: list[dict] = []
        unidades_afectadas: dict = {}

        async with conn.transaction():
            for mov in movs:
                cantidad = safe_int(mov["cantidad_recibida"] or mov["cantidad_enviada"])
                tarifa = safe_float(mov["tarifa_aplicada"])
                importe = safe_float(mov["costo_calculado"])
                if importe == 0 and tarifa > 0 and cantidad > 0:
                    importe = round(cantidad * tarifa, 2)
                if importe == 0:
                    saltados += 1
                    errores.append({"movimiento_id": mov["movimiento_id"], "razon": "importe=0"})
                    continue

                try:
                    cargo_id = await conn.fetchval(
                        """
                        INSERT INTO finanzas2.fin_cargo_interno
                            (fecha, registro_id, movimiento_id, unidad_interna_id,
                             servicio_nombre, persona_nombre, cantidad, tarifa, importe,
                             estado, empresa_id)
                        VALUES ($1, $2, $3, $4,
                                $5, $6, $7, $8, $9,
                                'generado', $10)
                        ON CONFLICT (movimiento_id) DO NOTHING
                        RETURNING id
                        """,
                        mov["fecha"], mov["registro_id"], mov["movimiento_id"],
                        mov["unidad_interna_id"],
                        mov["servicio_nombre"] or "Servicio",
                        mov["persona_nombre"] or "",
                        cantidad, tarifa, importe,
                        empresa_id,
                    )
                    if cargo_id is None:
                        saltados += 1
                        errores.append({"movimiento_id": mov["movimiento_id"], "razon": "ya tenía cargo"})
                        continue

                    generados += 1
                    # Registrar INGRESO en cuenta ficticia
                    cuenta_id = await conn.fetchval(
                        """
                        SELECT id FROM finanzas2.cont_cuenta_financiera
                        WHERE empresa_id = $1 AND unidad_interna_id = $2 AND es_ficticia = TRUE
                        LIMIT 1
                        """,
                        empresa_id, mov["unidad_interna_id"],
                    )
                    if cuenta_id:
                        await conn.execute(
                            """
                            INSERT INTO finanzas2.fin_movimiento_cuenta
                                (cuenta_id, empresa_id, tipo, monto, descripcion, fecha,
                                 referencia_id, referencia_tipo)
                            VALUES ($1, $2, 'INGRESO', $3, $4, $5, $6, 'CARGO_INTERNO')
                            """,
                            cuenta_id, empresa_id, importe,
                            f"Cobro {cantidad} prendas - {mov['servicio_nombre'] or 'Servicio'}",
                            mov["fecha"], str(cargo_id),
                        )
                        await conn.execute(
                            """
                            UPDATE finanzas2.cont_cuenta_financiera
                            SET saldo_actual = COALESCE(saldo_actual, 0) + $1
                            WHERE id = $2
                            """,
                            importe, cuenta_id,
                        )
                    # Acumular resumen por unidad
                    uid = mov["unidad_interna_id"]
                    g = unidades_afectadas.setdefault(uid, {
                        "unidad_interna_id": uid,
                        "cargos": 0,
                        "total": 0.0,
                    })
                    g["cargos"] += 1
                    g["total"] += importe
                except Exception as e:
                    errores.append({"movimiento_id": mov["movimiento_id"], "razon": str(e)})

        resumen_unidades = [
            {**v, "total": round(v["total"], 2)} for v in unidades_afectadas.values()
        ]

        return {
            "message": f"{generados} cargo(s) interno(s) generado(s), {saltados} saltado(s)",
            "generados": generados,
            "saltados": saltados,
            "errores": errores,
            "unidades_afectadas": resumen_unidades,
        }


class GenerarFacturaBorradorInput(BaseModel):
    movimiento_ids: list[str]
    empresa_id: Optional[int] = None
    tipo_documento: Optional[str] = "factura"  # factura | boleta | recibo | nota_interna (auto)
    aplicar_igv: Optional[bool] = False         # si True, calcula 18% sobre subtotal
    notas: Optional[str] = None


@router.post("/movimientos-costos/generar-factura-borrador")
async def generar_factura_borrador(
    input: GenerarFacturaBorradorInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Crea un documento borrador en Finanzas a partir de los movimientos seleccionados.

    El sistema detecta automáticamente el tipo según la persona:
    - Persona EXTERNO → factura de proveedor normal (con CxP)
    - Persona INTERNO → 'nota_interna' (sin CxP) + cargo interno + INGRESO en cuenta ficticia

    Reglas:
    - Todos los movimientos deben pertenecer a la misma persona.
    - Todos los movimientos deben ser del MISMO tipo (todos INTERNO o todos EXTERNO).
    - Ningún movimiento puede estar ya facturado.
    - Si la persona externa no existe como proveedor, se crea automáticamente.

    El número se genera como 'BORR-<timestamp>' (factura) o 'NI-<timestamp>' (nota interna).
    """
    if not input.movimiento_ids:
        raise HTTPException(status_code=400, detail="Lista de movimientos vacía")

    empresa_id = input.empresa_id or current_user.get("empresa_id") or 7

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # 1) Traer los movimientos con info enriquecida (incluye tipo_persona)
            movs = await conn.fetch(
                """
                SELECT
                    mp.id, mp.registro_id, mp.persona_id, mp.servicio_id,
                    mp.cantidad_recibida, mp.tarifa_aplicada, mp.costo_calculado,
                    mp.factura_numero,
                    p.nombre  AS persona_nombre,
                    COALESCE(p.tipo_persona, 'EXTERNO') AS persona_tipo,
                    p.unidad_interna_id,
                    s.nombre  AS servicio_nombre,
                    r.n_corte AS n_corte,
                    r.linea_negocio_id,
                    COALESCE(mp.fecha_fin, mp.fecha_inicio, mp.created_at::date) AS fecha_mov
                FROM prod_movimientos_produccion mp
                LEFT JOIN prod_personas_produccion p ON p.id = mp.persona_id
                LEFT JOIN prod_servicios_produccion s ON s.id = mp.servicio_id
                LEFT JOIN prod_registros r ON r.id = mp.registro_id
                WHERE mp.id = ANY($1::text[])
                """,
                input.movimiento_ids,
            )
            if len(movs) != len(input.movimiento_ids):
                raise HTTPException(
                    status_code=400,
                    detail=f"Se encontraron {len(movs)} movimientos de {len(input.movimiento_ids)} solicitados",
                )

            # 2) Validaciones generales
            ya_facturados = [m["id"] for m in movs if m["factura_numero"]]
            if ya_facturados:
                raise HTTPException(
                    status_code=400,
                    detail=f"{len(ya_facturados)} movimiento(s) ya están facturados. Desvinculalos primero.",
                )
            personas = {m["persona_id"] for m in movs if m["persona_id"]}
            if not personas:
                raise HTTPException(status_code=400, detail="Los movimientos no tienen persona asignada")
            if len(personas) > 1:
                raise HTTPException(
                    status_code=400,
                    detail="Todos los movimientos deben ser de la misma persona. Seleccioná uno a la vez o filtrá por persona.",
                )
            persona_nombre = movs[0]["persona_nombre"] or "Sin nombre"
            tipos = {m["persona_tipo"] for m in movs}
            if len(tipos) > 1:
                raise HTTPException(
                    status_code=400,
                    detail="No se puede mezclar movimientos INTERNO y EXTERNO en un mismo documento.",
                )
            es_nota_interna = (movs[0]["persona_tipo"] == "INTERNO")
            unidad_interna_id = movs[0]["unidad_interna_id"] if es_nota_interna else None
            if es_nota_interna and not unidad_interna_id:
                raise HTTPException(
                    status_code=400,
                    detail="La persona INTERNO no tiene unidad asignada en el maestro de personas.",
                )

            # 3) Proveedor:
            #    EXTERNO → buscar/crear tercero
            #    INTERNO → proveedor_id queda NULL; usamos unidad_interna_id en la factura
            proveedor_id = None
            proveedor_creado = False
            if not es_nota_interna:
                prov = await conn.fetchrow(
                    """
                    SELECT id FROM finanzas2.cont_tercero
                    WHERE nombre ILIKE $1 AND es_proveedor = TRUE AND empresa_id = $2
                    LIMIT 1
                    """,
                    persona_nombre, empresa_id,
                )
                if prov:
                    proveedor_id = prov["id"]
                else:
                    proveedor_id = await conn.fetchval(
                        """
                        INSERT INTO finanzas2.cont_tercero
                            (nombre, es_proveedor, es_cliente, activo, empresa_id, notas)
                        VALUES ($1, TRUE, FALSE, TRUE, $2, $3)
                        RETURNING id
                        """,
                        persona_nombre, empresa_id,
                        "Creado automáticamente desde Producción",
                    )
                    proveedor_creado = True

            # 4) (Las líneas van como tipo_linea='servicio' en 'Detalle del artículo / servicio')

            # 5) Totales
            subtotal = sum(safe_float(m["costo_calculado"]) for m in movs)
            # Para notas internas no aplicamos IGV (no es doc SUNAT)
            aplicar_igv_efectivo = (not es_nota_interna) and bool(input.aplicar_igv)
            igv_val = round(subtotal * 0.18, 2) if aplicar_igv_efectivo else 0.0
            total = round(subtotal + igv_val, 2)

            # 6) Número y tipo de documento
            from datetime import datetime as _dt
            ts = _dt.now().strftime("%Y%m%d%H%M%S")
            if es_nota_interna:
                numero_borrador = f"NI-{ts}"
                tipo_doc_final = "nota_interna"
                tipo_sunat = None  # no es doc SUNAT
            else:
                numero_borrador = f"BORR-{ts}"
                tipo_doc_final = input.tipo_documento or "factura"
                tipo_sunat = "01" if tipo_doc_final == "factura" else "03"

            notas_auto = (
                f"{'Nota interna' if es_nota_interna else 'Factura'} generada desde Producción · "
                f"{len(movs)} movimiento(s) · Persona: {persona_nombre}"
            )
            if input.notas:
                notas_auto = f"{input.notas}\n---\n{notas_auto}"

            # 7) Insertar factura (incluyendo unidad_interna_id si aplica)
            factura_id = await conn.fetchval(
                """
                INSERT INTO finanzas2.cont_factura_proveedor
                    (numero, proveedor_id, fecha_factura, terminos_dias,
                     tipo_documento, estado, subtotal, igv, total, saldo_pendiente,
                     notas, empresa_id, tipo_comprobante_sunat, impuestos_incluidos,
                     base_gravada, igv_sunat, unidad_interna_id)
                VALUES ($1, $2, CURRENT_DATE, 0,
                        $3, 'pendiente', $4, $5, $6, $6,
                        $7, $8, $9, FALSE,
                        $4, $5, $10)
                RETURNING id
                """,
                numero_borrador, proveedor_id,
                tipo_doc_final,
                subtotal, igv_val, total,
                notas_auto, empresa_id,
                tipo_sunat,
                unidad_interna_id,
            )

            # 8) Insertar una línea por movimiento — como tipo_linea='servicio'
            # Campos que llenamos (mapeo al UI 'Detalle del artículo / servicio'):
            #   - tipo_linea       = 'servicio'
            #   - servicio_id      = UUID del servicio de producción (Corte, Costura, etc.)
            #   - servicio_detalle = texto descriptivo (corte + n° prendas)
            #   - modelo_corte_id  = registro_id (UUID del corte) → enlace al "Registro"
            #   - cantidad         = cantidad_recibida (prendas procesadas)
            #   - precio_unitario  = tarifa_aplicada del movimiento
            #   - importe          = costo_calculado (cantidad × precio)
            #   - linea_negocio_id = del registro
            #   - igv_aplica       = respeta la elección del usuario (False por defecto)
            for m in movs:
                cantidad = safe_int(m["cantidad_recibida"])
                tarifa = safe_float(m["tarifa_aplicada"])
                importe = safe_float(m["costo_calculado"])
                # Fallback por si el movimiento no tiene tarifa pero sí costo y cantidad
                if tarifa == 0 and cantidad > 0 and importe > 0:
                    tarifa = round(importe / cantidad, 4)

                servicio_detalle = (
                    f"Corte #{m['n_corte'] or '?'} · {cantidad} prendas"
                )
                descripcion = f"{m['servicio_nombre'] or 'Servicio'} — Corte #{m['n_corte'] or '?'}"

                await conn.execute(
                    """
                    INSERT INTO finanzas2.cont_factura_proveedor_linea
                        (factura_id, tipo_linea, servicio_id, servicio_detalle,
                         modelo_corte_id, descripcion, cantidad, precio_unitario,
                         importe, igv_aplica, linea_negocio_id, empresa_id,
                         categoria_id)
                    VALUES ($1, 'servicio', $2, $3,
                            $4, $5, $6, $7,
                            $8, $9, $10, $11,
                            NULL)
                    """,
                    factura_id,
                    m["servicio_id"],            # UUID del servicio de producción
                    servicio_detalle,
                    m["registro_id"],            # UUID del corte → "Registro"
                    descripcion,
                    cantidad,
                    tarifa,
                    importe,
                    bool(input.aplicar_igv),
                    m["linea_negocio_id"],
                    empresa_id,
                )

            # 9) Vincular los movimientos a esta factura
            await conn.execute(
                """
                UPDATE prod_movimientos_produccion
                SET factura_numero = $1, factura_id = $2
                WHERE id = ANY($3::text[])
                """,
                numero_borrador, str(factura_id), input.movimiento_ids,
            )

            # 10) Si es NOTA INTERNA: generar los cargos internos en estado 'generado' (CxC virtual)
            #     NOTA IMPORTANTE: al crear la NI NO se mueve el saldo de la cuenta ficticia.
            #     El ingreso se materializa recién cuando la NI se "procesa" (análogo a pagar
            #     la factura). Hasta entonces, el cargo representa una cuenta por cobrar virtual
            #     de la unidad interna hacia la empresa.
            cargos_creados = 0
            saldo_cuenta_ficticia = None
            cuenta_ficticia_id = None
            if es_nota_interna:
                cuenta_ficticia_id = await conn.fetchval(
                    """
                    SELECT id FROM finanzas2.cont_cuenta_financiera
                    WHERE empresa_id = $1 AND unidad_interna_id = $2 AND es_ficticia = TRUE
                    LIMIT 1
                    """,
                    empresa_id, unidad_interna_id,
                )
                for m in movs:
                    cantidad = safe_int(m["cantidad_recibida"])
                    tarifa = safe_float(m["tarifa_aplicada"])
                    importe = safe_float(m["costo_calculado"])
                    if importe == 0 and tarifa > 0 and cantidad > 0:
                        importe = round(cantidad * tarifa, 2)
                    if importe == 0:
                        continue
                    cargo_id = await conn.fetchval(
                        """
                        INSERT INTO finanzas2.fin_cargo_interno
                            (fecha, registro_id, movimiento_id, unidad_interna_id,
                             servicio_nombre, persona_nombre, cantidad, tarifa, importe,
                             estado, empresa_id)
                        VALUES ($1, $2, $3, $4,
                                $5, $6, $7, $8, $9,
                                'generado', $10)
                        ON CONFLICT (movimiento_id) DO NOTHING
                        RETURNING id
                        """,
                        m["fecha_mov"], m["registro_id"], m["id"], unidad_interna_id,
                        m["servicio_nombre"] or "Servicio",
                        m["persona_nombre"] or "",
                        cantidad, tarifa, importe,
                        empresa_id,
                    )
                    if cargo_id is None:
                        continue
                    cargos_creados += 1
                    # ⚠️ NO creamos fin_movimiento_cuenta aquí. Eso se hace recién cuando
                    #    se procesa la NI desde Finanzas.
                if cuenta_ficticia_id:
                    saldo_cuenta_ficticia = await conn.fetchval(
                        "SELECT saldo_actual FROM finanzas2.cont_cuenta_financiera WHERE id = $1",
                        cuenta_ficticia_id,
                    )

    return {
        "message": (
            f"Nota interna creada (pendiente de procesar) con {len(movs)} movimiento(s) · {cargos_creados} cargo(s) como CxC virtual"
            if es_nota_interna
            else f"Factura borrador creada con {len(movs)} movimiento(s)"
        ),
        "tipo_documento": tipo_doc_final,
        "es_nota_interna": es_nota_interna,
        "unidad_interna_id": unidad_interna_id,
        "cargos_internos_creados": cargos_creados,
        "saldo_cuenta_ficticia": float(saldo_cuenta_ficticia) if saldo_cuenta_ficticia is not None else None,
        "factura_id": factura_id,
        "factura_numero": numero_borrador,
        "proveedor_id": proveedor_id,
        "proveedor_creado": proveedor_creado,
        "persona_nombre": persona_nombre,
        "subtotal": round(subtotal, 2),
        "igv": igv_val,
        "total": total,
        "movimientos_vinculados": len(movs),
    }


# ==================== LISTADO COMPLETO DE CORTES ====================

@router.get("/cortes-listado")
async def cortes_listado(
    marca_id: Optional[str] = Query(None, description="Filtra por marca (id). Si vacío, todas."),
    tipo_id: Optional[str] = Query(None),
    entalle_id: Optional[str] = Query(None),
    tela_id: Optional[str] = Query(None),
    estado: Optional[str] = Query(None, description="Filtra por estado exacto (Para Corte, Costura, etc.)"),
    incluir_tienda: bool = Query(True, description="Si False, excluye cortes en estado 'Tienda'"),
    solo_pendientes_conciliar: bool = Query(False, description="Si True, solo cortes en Almacén PT/Tienda con conciliación pendiente o parcial"),
    solo_fallados_abiertos: bool = Query(False, description="Si True, solo cortes con fallados aún sin resolver (sin enviar a arreglo o arreglo en proceso)"),
    limit: int = Query(500, le=2000),
    offset: int = 0,
    _u: dict = Depends(get_current_user),
):
    """
    Listado completo de cortes para control rápido (vista 'todos los cortes que existen').
    - Filtros: marca/tipo/entalle/tela/estado (todos opcionales).
    - Orden: año del corte DESC, luego número DESC dentro del año (más nuevo arriba).
    - Soporta modelos normales y modelos manuales (modelo_manual JSONB).
    - Default: incluye cortes en Tienda (control total). Pasar incluir_tienda=false para ocultarlos.

    Conciliación (solo para estados 'Almacen PT' y 'Tienda'):
    - Compara Distribución Esperada (prod_registro_pt_relacion) vs Ingresado en Odoo
      (stock_move 'done' vinculados al corte vía prod_registro_pt_odoo_vinculo).
    - Devuelve estado: 'completo' | 'parcial' | 'pendiente' | 'sin_distribucion' | None.
    - `solo_pendientes_conciliar=true` filtra solo los que aún tienen pendientes.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conds: List[str] = ["TRUE"]
        params: list = []
        idx = 1

        # Filtros — match contra modelo catalogado OR modelo_manual->>'X_id'
        def add_filter(col_modelo: str, col_manual: str, val: Optional[str]):
            nonlocal idx
            if not val:
                return
            params.append(val)
            conds.append(
                f"(m.{col_modelo} = ${idx} OR r.modelo_manual->>'{col_manual}' = ${idx})"
            )
            idx += 1

        add_filter("marca_id",   "marca_id",   marca_id)
        add_filter("tipo_id",    "tipo_id",    tipo_id)
        add_filter("entalle_id", "entalle_id", entalle_id)
        add_filter("tela_id",    "tela_id",    tela_id)

        if estado:
            params.append(estado)
            conds.append(f"r.estado = ${idx}")
            idx += 1

        if not incluir_tienda:
            conds.append("r.estado <> 'Tienda'")

        where_clause = " AND ".join(conds)

        # Filtro extra: solo cortes en Almacén PT/Tienda con conciliación pendiente.
        # Se aplica DESPUÉS de calcular conc.* en el LATERAL — usamos un wrapper.
        having_conciliacion = ""
        if solo_pendientes_conciliar:
            having_conciliacion = (
                " AND r.estado IN ('Almacen PT','Tienda') "
                " AND COALESCE(conc.total_esperado, 0) > 0 "
                " AND COALESCE(conc.total_ingresado, 0) < COALESCE(conc.total_esperado, 0) "
            )
        # Filtro: solo cortes con fallados aún abiertos. Cuenta como "abierto"
        # cualquier prenda que el sistema sepa que NO se resolvió todavía:
        #   - sin_enviar > 0  (detectado, todavía no fue a arreglo)
        #   - en_proceso > 0  (mandado a arreglo pero el arreglo aún no
        #                      está COMPLETADO)
        if solo_fallados_abiertos:
            having_conciliacion += (
                " AND (COALESCE(fall.sin_enviar, 0) > 0 "
                "      OR COALESCE(fall.en_proceso, 0) > 0) "
            )

        rows = await conn.fetch(f"""
            SELECT
                r.id,
                r.n_corte,
                r.estado,
                r.urgente,
                r.fecha_creacion,
                r.fecha_envio_tienda,
                r.fecha_entrega_final,
                r.fecha_inicio_real,
                r.odoo_template_id,
                r.odoo_product_id,
                COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo')      AS modelo,
                COALESCE(ma.nombre, mma.nombre)                            AS marca,
                COALESCE(t.nombre,  tma.nombre)                            AS tipo,
                COALESCE(e.nombre,  ema.nombre)                            AS entalle,
                COALESCE(te.nombre, tema.nombre)                           AS tela,
                COUNT(*) OVER() AS _total_count,
                (SELECT COALESCE(SUM(rt.cantidad_real), 0)
                   FROM prod_registro_tallas rt
                  WHERE rt.registro_id = r.id) AS prendas,
                -- Cantidad de productos Odoo vinculados via "Distribución Esperada".
                -- Ese es el sistema 1:N (Normal + LQ + etc.) que el usuario llena
                -- en el detalle del corte. El reporte muestra "Vinculado" si tiene
                -- al menos una relación aquí O si los campos directos odoo_* están
                -- llenos (sistema 1:1 alternativo).
                (SELECT COUNT(*) FROM produccion.prod_registro_pt_relacion rr
                  WHERE rr.registro_id = r.id) AS pt_relaciones_count,
                -- ===== Conciliación =====
                -- Total esperado por producto Odoo (suma de Distribución Esperada).
                -- Total ingresado = stock_move 'done' de los ajustes Odoo vinculados
                -- a este corte (prod_registro_pt_odoo_vinculo). Solo se cuenta el
                -- ingresado de productos que están en la distribución (igual que
                -- /registros/{id}/conciliacion-odoo).
                conc.total_esperado    AS conc_total_esperado,
                conc.total_ingresado   AS conc_total_ingresado,
                conc.lineas_total      AS conc_lineas_total,
                conc.lineas_completas  AS conc_lineas_completas,
                conc.lineas_pendientes AS conc_lineas_pendientes,
                -- Resumen de fallados (cuántos detectados / arreglados / pendientes
                -- de resolver) para la columna nueva en el Listado de Cortes.
                COALESCE(fall.detectados, 0)     AS fall_detectados,
                COALESCE(fall.enviados_arreglo, 0) AS fall_enviados,
                COALESCE(fall.resueltos, 0)      AS fall_resueltos,
                COALESCE(fall.en_proceso, 0)     AS fall_en_proceso,
                COALESCE(fall.sin_enviar, 0)     AS fall_sin_enviar
            FROM prod_registros r
            LEFT JOIN prod_modelos m  ON m.id = r.modelo_id
            LEFT JOIN prod_marcas   ma ON ma.id = m.marca_id
            LEFT JOIN prod_tipos    t  ON t.id  = m.tipo_id
            LEFT JOIN prod_entalles e  ON e.id  = m.entalle_id
            LEFT JOIN prod_telas    te ON te.id = m.tela_id
            LEFT JOIN prod_marcas   mma ON mma.id = (r.modelo_manual->>'marca_id')
            LEFT JOIN prod_tipos    tma ON tma.id = (r.modelo_manual->>'tipo_id')
            LEFT JOIN prod_entalles ema ON ema.id = (r.modelo_manual->>'entalle_id')
            LEFT JOIN prod_telas    tema ON tema.id = (r.modelo_manual->>'tela_id')
            LEFT JOIN LATERAL (
                SELECT
                    COALESCE(SUM(esp.cantidad), 0)                                   AS total_esperado,
                    COALESCE(SUM(COALESCE(ing.ingresado, 0)), 0)                     AS total_ingresado,
                    COUNT(*)                                                          AS lineas_total,
                    COUNT(*) FILTER (WHERE COALESCE(ing.ingresado, 0) >= esp.cantidad) AS lineas_completas,
                    COUNT(*) FILTER (WHERE COALESCE(ing.ingresado, 0) <= 0)            AS lineas_pendientes
                FROM (
                    SELECT product_template_id_odoo, SUM(cantidad) AS cantidad
                    FROM produccion.prod_registro_pt_relacion
                    WHERE registro_id = r.id
                    GROUP BY product_template_id_odoo
                ) esp
                LEFT JOIN (
                    SELECT sm.product_tmpl_id AS tmpl, SUM(sm.product_qty) AS ingresado
                    FROM odoo.stock_move sm
                    JOIN produccion.prod_registro_pt_odoo_vinculo v
                      ON v.stock_inventory_odoo_id = sm.inventory_id
                    WHERE v.registro_id = r.id AND sm.state = 'done'
                    GROUP BY sm.product_tmpl_id
                ) ing ON ing.tmpl = esp.product_template_id_odoo
            ) conc ON TRUE
            LEFT JOIN LATERAL (
                -- Conteo de fallados del corte. "Resueltos" = lo que ya pasó
                -- por arreglo cerrado (recuperado + liquidación + merma + tela).
                -- "En proceso" = arreglos abiertos. "Sin enviar" = detectados
                -- que aún no se mandaron a ningún arreglo.
                SELECT
                    COALESCE(f.detectados, 0)                                     AS detectados,
                    COALESCE(a.enviadas, 0)                                       AS enviados_arreglo,
                    COALESCE(a.recuperadas, 0)
                      + COALESCE(a.a_liquidacion, 0)
                      + COALESCE(a.a_merma, 0)
                      + COALESCE(a.a_tela, 0)
                      + COALESCE(f.tela_resuelta, 0)                              AS resueltos,
                    COALESCE(a.en_proceso, 0)                                     AS en_proceso,
                    -- sin_enviar = detectados de SERVICIO no mandados a arreglo.
                    -- Los fallados de tela (causa='tela') NO van por arreglo;
                    -- se resuelven con cantidad_tela_recuperada/_liquidada y
                    -- no deben contarse como "faltan enviar".
                    GREATEST(COALESCE(f.detectados_servicio, 0) - COALESCE(a.enviadas, 0), 0) AS sin_enviar
                FROM (SELECT 1) _dummy
                LEFT JOIN LATERAL (
                    SELECT
                        SUM(cantidad_detectada)                                                 AS detectados,
                        SUM(cantidad_detectada) FILTER (WHERE COALESCE(causa,'servicio') = 'servicio') AS detectados_servicio,
                        SUM(COALESCE(cantidad_tela_recuperada,0) + COALESCE(cantidad_tela_liquidada,0))
                          FILTER (WHERE causa = 'tela')                                          AS tela_resuelta
                    FROM produccion.prod_fallados
                    WHERE registro_id = r.id
                ) f ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        SUM(cantidad)                                                                  AS enviadas,
                        SUM(CASE WHEN estado <> 'COMPLETADO' THEN cantidad ELSE 0 END)                 AS en_proceso,
                        SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_recuperada,0) END) AS recuperadas,
                        SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_liquidacion,0) END)AS a_liquidacion,
                        SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_merma,0) END)      AS a_merma,
                        SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_pasa_a_tela,0) END)AS a_tela
                    FROM produccion.prod_registro_arreglos
                    WHERE registro_id = r.id
                ) a ON TRUE
            ) fall ON TRUE
            WHERE {where_clause}{having_conciliacion}
            ORDER BY
                -- 1° Cortes SIN n_corte (vacíos / NULL) primero — son los que necesitan
                --    asignación de número.  Aparecen al tope del listado.
                CASE WHEN r.n_corte IS NULL OR TRIM(r.n_corte) = '' THEN 0 ELSE 1 END ASC,
                -- 2° Año del corte: sufijo '-YYYY' si lo tiene, sino año de fecha_creacion
                CASE
                    WHEN r.n_corte ~ '-[0-9]{{4}}$' THEN (split_part(r.n_corte, '-', 2))::int
                    ELSE EXTRACT(YEAR FROM r.fecha_creacion)::int
                END DESC,
                -- 3° Dentro del mismo año: por número de corte DESC (más reciente arriba)
                CASE
                    WHEN r.n_corte ~ '^[0-9]+-[0-9]{{4}}$' THEN (split_part(r.n_corte, '-', 1))::int
                    WHEN r.n_corte ~ '^[0-9]+$' THEN r.n_corte::int
                    ELSE 0
                END DESC,
                r.fecha_creacion DESC
            LIMIT ${idx} OFFSET ${idx + 1}
        """, *params, limit, offset)

        total = rows[0]["_total_count"] if rows else 0

        # Estados donde tiene sentido conciliar (ya hay producto terminado entregado).
        # Comparación case-insensitive y sin tildes para evitar problemas con
        # 'Almacen PT' vs 'Almacen PT'.
        import unicodedata
        def _norm_estado(s: Optional[str]) -> str:
            if not s:
                return ""
            return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().strip().lower()

        ESTADOS_CONCILIAR = {"almacen pt", "tienda"}

        items = []
        for r in rows:
            # ---- Conciliación: solo se evalúa para estados Almacén PT / Tienda ----
            necesita_conc = _norm_estado(r["estado"]) in ESTADOS_CONCILIAR
            conciliacion = None
            if necesita_conc:
                total_esperado  = float(r["conc_total_esperado"]  or 0)
                total_ingresado = float(r["conc_total_ingresado"] or 0)
                lineas_total      = int(r["conc_lineas_total"]      or 0)
                lineas_completas  = int(r["conc_lineas_completas"]  or 0)
                lineas_pendientes = int(r["conc_lineas_pendientes"] or 0)
                pendiente = max(total_esperado - total_ingresado, 0)

                if lineas_total == 0 or total_esperado == 0:
                    estado_conc = "sin_distribucion"
                elif lineas_completas == lineas_total and total_ingresado >= total_esperado:
                    estado_conc = "completo"
                elif lineas_pendientes == lineas_total and total_ingresado <= 0:
                    estado_conc = "pendiente"
                else:
                    estado_conc = "parcial"

                conciliacion = {
                    "estado":            estado_conc,
                    "esperado":          total_esperado,
                    "ingresado":         total_ingresado,
                    "pendiente":         pendiente,
                    "lineas_total":      lineas_total,
                    "lineas_completas":  lineas_completas,
                    "lineas_pendientes": lineas_pendientes,
                }

            items.append({
                "id":                  r["id"],
                "n_corte":             r["n_corte"],
                "estado":              r["estado"],
                "urgente":             bool(r["urgente"]),
                "modelo":              r["modelo"] or "",
                "marca":               r["marca"] or "",
                "tipo":                r["tipo"] or "",
                "entalle":             r["entalle"] or "",
                "tela":                r["tela"] or "",
                "prendas":             safe_int(r["prendas"]),
                "fecha_creacion":      r["fecha_creacion"].isoformat() if r["fecha_creacion"] else None,
                "fecha_envio_tienda":  r["fecha_envio_tienda"].isoformat() if r["fecha_envio_tienda"] else None,
                "fecha_entrega_final": str(r["fecha_entrega_final"]) if r["fecha_entrega_final"] else None,
                "fecha_inicio_real":   str(r["fecha_inicio_real"]) if r["fecha_inicio_real"] else None,
                # Vinculado si tiene producto Odoo directo (1:1) o relaciones de
                # Distribución Esperada (1:N). Ambos son válidos.
                "vinculado_odoo": bool(
                    r["odoo_template_id"] or r["odoo_product_id"]
                    or (r["pt_relaciones_count"] or 0) > 0
                ),
                "pt_relaciones_count": int(r["pt_relaciones_count"] or 0),
                # null si no aplica (corte no está en Almacén PT/Tienda).
                "conciliacion": conciliacion,
                # Resumen de fallados (siempre, para todos los estados)
                "fallados": {
                    "detectados":  int(r["fall_detectados"] or 0),
                    "enviados":    int(r["fall_enviados"] or 0),
                    "resueltos":   int(r["fall_resueltos"] or 0),
                    "en_proceso":  int(r["fall_en_proceso"] or 0),
                    "sin_enviar":  int(r["fall_sin_enviar"] or 0),
                },
            })

        # Resumen agregado de conciliación (útil para el header del reporte)
        resumen_conc = {
            "total_en_estados":  0,
            "completos":         0,
            "parciales":         0,
            "pendientes":        0,
            "sin_distribucion":  0,
            "prendas_pendientes": 0.0,
        }
        for it in items:
            c = it.get("conciliacion")
            if not c:
                continue
            resumen_conc["total_en_estados"] += 1
            if   c["estado"] == "completo":         resumen_conc["completos"] += 1
            elif c["estado"] == "parcial":          resumen_conc["parciales"] += 1
            elif c["estado"] == "pendiente":        resumen_conc["pendientes"] += 1
            elif c["estado"] == "sin_distribucion": resumen_conc["sin_distribucion"] += 1
            resumen_conc["prendas_pendientes"] += float(c.get("pendiente") or 0)

        return {"items": items, "total": total, "resumen_conciliacion": resumen_conc}


# ============================================================================
#  /conciliacion-pendiente — vista agregada de lo que falta ingresar a Odoo
# ============================================================================
#
# Para el almacén / supervisor: una sola pantalla que dice
#   "estos productos faltan ser ingresados a Odoo y en qué cortes están".
# Solo considera cortes en estados Almacén PT / Tienda — son los que ya
# deberían tener producto terminado entregado y conciliable.
#
# Devuelve dos bloques independientes:
#   1) por_producto: agrupado por template_id_odoo, con drill-down a los cortes
#      que tienen pendiente ese producto.
#   2) sin_distribucion: cortes en Almacén PT/Tienda que aún no tienen líneas
#      de Distribución Esperada definidas → no se pueden conciliar todavía.
@router.get("/conciliacion-pendiente")
async def conciliacion_pendiente(
    marca_odoo: Optional[str] = Query(
        None,
        description="Filtra por marca del producto Odoo (texto exacto, ej. 'ELEMENT PREMIUM')."
    ),
    incluir_tienda: bool = Query(True, description="Si False, excluye cortes en estado 'Tienda'."),
    _u: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Filtros de estado
        estados_validos = ["Almacen PT", "Tienda"] if incluir_tienda else ["Almacen PT"]

        # ---- Bloque 1: pendiente por producto (template) con sus cortes ----
        # Sacamos por_corte+producto las cantidades esperado/ingresado, filtramos
        # los que tengan pendiente > 0, y agregamos en Python por template_id.
        sql_lineas = """
            SELECT
                r.id                                                       AS registro_id,
                r.n_corte,
                r.estado,
                r.fecha_creacion,
                COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo')      AS modelo,
                detalle.template_id,
                pt.name                                                    AS producto_nombre,
                pt.marca                                                   AS producto_marca,
                detalle.esperado,
                detalle.ingresado,
                (detalle.esperado - detalle.ingresado)                     AS pendiente
            FROM produccion.prod_registros r
            LEFT JOIN produccion.prod_modelos m ON m.id = r.modelo_id
            CROSS JOIN LATERAL (
                SELECT
                    esp.product_template_id_odoo AS template_id,
                    esp.cantidad                  AS esperado,
                    COALESCE(ing.ingresado, 0)    AS ingresado
                FROM (
                    SELECT product_template_id_odoo, SUM(cantidad) AS cantidad
                    FROM produccion.prod_registro_pt_relacion
                    WHERE registro_id = r.id
                    GROUP BY product_template_id_odoo
                ) esp
                LEFT JOIN (
                    SELECT sm.product_tmpl_id AS tmpl, SUM(sm.product_qty) AS ingresado
                    FROM odoo.stock_move sm
                    JOIN produccion.prod_registro_pt_odoo_vinculo v
                      ON v.stock_inventory_odoo_id = sm.inventory_id
                    WHERE v.registro_id = r.id AND sm.state = 'done'
                    GROUP BY sm.product_tmpl_id
                ) ing ON ing.tmpl = esp.product_template_id_odoo
            ) detalle
            LEFT JOIN odoo.product_template pt ON pt.odoo_id = detalle.template_id
            WHERE r.estado = ANY($1::text[])
              AND detalle.esperado > detalle.ingresado
        """
        params: list = [estados_validos]
        if marca_odoo:
            params.append(marca_odoo)
            sql_lineas += f" AND pt.marca = ${len(params)}"

        sql_lineas += " ORDER BY pt.name NULLS LAST, r.n_corte"

        rows_lineas = await conn.fetch(sql_lineas, *params)

        # Agrupar por template_id
        por_producto_map: dict = {}
        for r in rows_lineas:
            tid = r["template_id"]
            if tid not in por_producto_map:
                por_producto_map[tid] = {
                    "template_id":     tid,
                    "producto_nombre": r["producto_nombre"] or f"Template #{tid}",
                    "producto_marca":  r["producto_marca"] or "",
                    "esperado":        0.0,
                    "ingresado":       0.0,
                    "pendiente":       0.0,
                    "cortes":          [],
                }
            grp = por_producto_map[tid]
            esperado  = float(r["esperado"]  or 0)
            ingresado = float(r["ingresado"] or 0)
            pendiente = float(r["pendiente"] or 0)
            grp["esperado"]  += esperado
            grp["ingresado"] += ingresado
            grp["pendiente"] += pendiente
            grp["cortes"].append({
                "registro_id":    r["registro_id"],
                "n_corte":        r["n_corte"],
                "estado":         r["estado"],
                "modelo":         r["modelo"] or "",
                "fecha_creacion": r["fecha_creacion"].isoformat() if r["fecha_creacion"] else None,
                "esperado":       esperado,
                "ingresado":      ingresado,
                "pendiente":      pendiente,
            })

        # Helper para ordenar n_corte por año DESC + número DESC (mismo criterio
        # que /cortes-listado y "Sin Distribución"). Empuja los sin n_corte al final.
        import re
        def _sort_key_corte(c):
            nc = (c.get("n_corte") or "").strip()
            if not nc:
                # Sin número → al final dentro del grupo
                return (1, 0, 0)
            m_anio = re.match(r"^(\d+)-(\d{4})$", nc)
            if m_anio:
                return (0, -int(m_anio.group(2)), -int(m_anio.group(1)))
            m_num = re.match(r"^(\d+)$", nc)
            if m_num:
                # Año implícito: tomamos del fecha_creacion si está
                anio_impl = 0
                fc = c.get("fecha_creacion")
                if fc:
                    try:
                        anio_impl = int(str(fc)[:4])
                    except Exception:
                        anio_impl = 0
                return (0, -anio_impl, -int(m_num.group(1)))
            return (0, 0, 0)

        # Ordenar cortes dentro de cada producto por año/número DESC.
        for p in por_producto_map.values():
            p["cortes"].sort(key=_sort_key_corte)

        por_producto = sorted(
            por_producto_map.values(),
            key=lambda x: x["pendiente"],
            reverse=True,
        )

        # ---- Bloque 1.5: balance/diagnóstico por corte ----
        #
        # Para cada corte que aparece con pendiente, calculamos cuántas prendas
        # están bloqueadas por cada causa. Esto le dice al supervisor exactamente
        # qué hacer (ej. "6 fallados sin enviar a arreglo + 6 recuperadas sin
        # ingresar a Odoo = 12 pendientes").
        #
        # Fórmula validada con corte 043 (DORIAN, 12 pendientes):
        #   producido (619) - ingresado (607) = 12
        #   = fallados_sin_enviar (33-27=6) + en_arreglo_proceso (0)
        #   + recuperadas_sin_ingresar (= residual = 6)
        unique_corte_ids = list({c["registro_id"] for p in por_producto for c in p["cortes"]})
        balance_por_corte: dict = {}
        if unique_corte_ids:
            balance_rows = await conn.fetch("""
                SELECT
                    r.id                                                       AS registro_id,
                    r.fecha_creacion,
                    COALESCE(prod_sum.producido, 0)                            AS producido,
                    COALESCE(fall.detectados, 0)                               AS fallados_detectados,
                    COALESCE(arr.enviadas, 0)                                  AS arreglos_enviadas,
                    COALESCE(arr.en_proceso, 0)                                AS arreglos_en_proceso,
                    COALESCE(arr.recuperadas, 0)                               AS arreglos_recuperadas,
                    COALESCE(arr.a_liquidacion, 0)                             AS arreglos_a_liquidacion,
                    COALESCE(arr.a_merma, 0)                                   AS arreglos_a_merma,
                    COALESCE(arr.a_tela, 0)                                    AS arreglos_a_tela,
                    COALESCE(mer.total, 0)                                     AS mermas_directas
                FROM produccion.prod_registros r
                LEFT JOIN LATERAL (
                    SELECT SUM(cantidad_real) AS producido
                    FROM produccion.prod_registro_tallas
                    WHERE registro_id = r.id
                ) prod_sum ON TRUE
                LEFT JOIN LATERAL (
                    SELECT SUM(cantidad_detectada) AS detectados
                    FROM produccion.prod_fallados
                    WHERE registro_id = r.id
                ) fall ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        SUM(cantidad)                                                                  AS enviadas,
                        SUM(CASE WHEN estado <> 'COMPLETADO' THEN cantidad ELSE 0 END)                 AS en_proceso,
                        SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_recuperada,0) END) AS recuperadas,
                        SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_liquidacion,0) END)AS a_liquidacion,
                        SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_merma,0) END)      AS a_merma,
                        SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_pasa_a_tela,0) END)AS a_tela
                    FROM produccion.prod_registro_arreglos
                    WHERE registro_id = r.id
                ) arr ON TRUE
                LEFT JOIN LATERAL (
                    SELECT SUM(cantidad) AS total
                    FROM produccion.prod_mermas
                    WHERE registro_id = r.id
                ) mer ON TRUE
                WHERE r.id = ANY($1::text[])
            """, unique_corte_ids)

            # Pendiente total POR CORTE (suma de pendientes por producto del corte).
            pendiente_por_corte: dict = {}
            for p in por_producto:
                for c in p["cortes"]:
                    cid = c["registro_id"]
                    pendiente_por_corte[cid] = pendiente_por_corte.get(cid, 0) + float(c["pendiente"])

            from datetime import datetime, timezone
            hoy = datetime.now(timezone.utc).date()

            for br in balance_rows:
                cid = br["registro_id"]
                pendiente_total = int(pendiente_por_corte.get(cid, 0))
                producido = int(br["producido"] or 0)
                fall_det = int(br["fallados_detectados"] or 0)
                arr_env  = int(br["arreglos_enviadas"] or 0)
                arr_proc = int(br["arreglos_en_proceso"] or 0)
                arr_rec  = int(br["arreglos_recuperadas"] or 0)
                arr_liq  = int(br["arreglos_a_liquidacion"] or 0)
                arr_mer  = int(br["arreglos_a_merma"] or 0)
                arr_tel  = int(br["arreglos_a_tela"] or 0)
                merm_dir = int(br["mermas_directas"] or 0)

                fallados_sin_enviar       = max(0, fall_det - arr_env)
                en_arreglo_proceso        = arr_proc
                a_merma_o_tela            = arr_mer + arr_tel
                explicado_calidad         = fallados_sin_enviar + en_arreglo_proceso
                recuperadas_sin_ingresar  = max(0, pendiente_total - explicado_calidad)
                # "Inexplicable" solo si después de todo aún sobra algo (raro).
                # Si sale negativo (caso AMERICAN BEIGE: over-ingreso interno),
                # lo dejamos en 0 — no es informativo a nivel corte.
                inexplicable = max(0, pendiente_total - explicado_calidad - recuperadas_sin_ingresar)

                # Días desde fecha_creacion (proxy para "días en estado actual").
                # Sin updated_at específico por estado, este es el dato más útil.
                dias = None
                if br["fecha_creacion"]:
                    dias = (hoy - br["fecha_creacion"].date()).days

                balance_por_corte[cid] = {
                    "pendiente_total":         pendiente_total,
                    "producido":               producido,
                    "fallados_detectados":     fall_det,
                    "arreglos_enviadas":       arr_env,
                    "arreglos_recuperadas":    arr_rec,
                    "arreglos_a_liquidacion":  arr_liq,
                    "mermas_directas":         merm_dir,
                    "dias_en_estado":          dias,
                    # Desglose accionable del pendiente
                    "fallados_sin_enviar":      fallados_sin_enviar,
                    "en_arreglo_proceso":       en_arreglo_proceso,
                    "recuperadas_sin_ingresar": recuperadas_sin_ingresar,
                    "a_merma_o_tela":           a_merma_o_tela,
                    "inexplicable":             inexplicable,
                }

        # Adjuntar el balance a cada corte en por_producto
        for p in por_producto:
            for c in p["cortes"]:
                c["balance"] = balance_por_corte.get(c["registro_id"])

        # ---- Bloque 2: cortes en Almacén PT/Tienda SIN Distribución Esperada ----
        sql_sin = """
            SELECT
                r.id,
                r.n_corte,
                r.estado,
                r.fecha_creacion,
                COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo,
                COALESCE(ma.nombre, mma.nombre)                       AS marca,
                COALESCE(t.nombre,  tma.nombre)                       AS tipo,
                (SELECT COALESCE(SUM(rt.cantidad_real), 0)
                   FROM prod_registro_tallas rt
                  WHERE rt.registro_id = r.id) AS prendas
            FROM produccion.prod_registros r
            LEFT JOIN produccion.prod_modelos m  ON m.id = r.modelo_id
            LEFT JOIN produccion.prod_marcas   ma ON ma.id = m.marca_id
            LEFT JOIN produccion.prod_tipos    t  ON t.id  = m.tipo_id
            LEFT JOIN produccion.prod_marcas   mma ON mma.id = (r.modelo_manual->>'marca_id')
            LEFT JOIN produccion.prod_tipos    tma ON tma.id = (r.modelo_manual->>'tipo_id')
            WHERE r.estado = ANY($1::text[])
              AND NOT EXISTS (
                  SELECT 1 FROM produccion.prod_registro_pt_relacion rr
                  WHERE rr.registro_id = r.id
              )
            ORDER BY
                -- Igual que /cortes-listado: cortes sin n_corte primero,
                -- luego año DESC, luego número DESC dentro del año.
                CASE WHEN r.n_corte IS NULL OR TRIM(r.n_corte) = '' THEN 0 ELSE 1 END ASC,
                CASE
                    WHEN r.n_corte ~ '-[0-9]{4}$' THEN (split_part(r.n_corte, '-', 2))::int
                    ELSE EXTRACT(YEAR FROM r.fecha_creacion)::int
                END DESC,
                CASE
                    WHEN r.n_corte ~ '^[0-9]+-[0-9]{4}$' THEN (split_part(r.n_corte, '-', 1))::int
                    WHEN r.n_corte ~ '^[0-9]+$' THEN r.n_corte::int
                    ELSE 0
                END DESC,
                r.fecha_creacion DESC
        """
        rows_sin = await conn.fetch(sql_sin, estados_validos)
        sin_distribucion = [
            {
                "registro_id":    r["id"],
                "n_corte":        r["n_corte"],
                "estado":         r["estado"],
                "modelo":         r["modelo"] or "",
                "marca":          r["marca"]  or "",
                "tipo":           r["tipo"]   or "",
                "prendas":        safe_int(r["prendas"]),
                "fecha_creacion": r["fecha_creacion"].isoformat() if r["fecha_creacion"] else None,
            }
            for r in rows_sin
        ]

        # Resumen
        resumen = {
            "productos_pendientes":  len(por_producto),
            "prendas_pendientes":    sum(p["pendiente"] for p in por_producto),
            "cortes_afectados":      len({c["registro_id"] for p in por_producto for c in p["cortes"]}),
            "cortes_sin_distribucion": len(sin_distribucion),
        }

        return {
            "por_producto":     por_producto,
            "sin_distribucion": sin_distribucion,
            "resumen":          resumen,
        }








