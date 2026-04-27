"""
Router: Reportes de Producción P0
Dashboard KPIs, En Proceso, WIP por Etapa, Atrasados, Trazabilidad,
Cumplimiento de Ruta, Balance Terceros, Lotes Fraccionados.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import date, datetime, timezone
import json

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


# ==================== 3. WIP POR ETAPA ====================

@router.get("/wip-etapa")
async def wip_por_etapa(
    empresa_id: int = Query(7),
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT r.estado,
                   COUNT(*) as lotes,
                   COALESCE(SUM((SELECT COALESCE(SUM(rt.cantidad_real),0) FROM prod_registro_tallas rt WHERE rt.registro_id = r.id)),0) as prendas,
                   MIN(r.fecha_creacion) as lote_mas_antiguo,
                   COUNT(*) FILTER (WHERE r.urgente = true) as urgentes
            FROM prod_registros r
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND r.dividido_desde_registro_id IS NULL
            GROUP BY r.estado
            ORDER BY lotes DESC
        """)

        etapas = []
        for r in rows:
            d = {
                "etapa": r["estado"],
                "lotes": int(r["lotes"]),
                "prendas": safe_int(r["prendas"]),
                "urgentes": int(r["urgentes"]),
                "lote_mas_antiguo": str(r["lote_mas_antiguo"]) if r["lote_mas_antiguo"] else None,
            }
            etapas.append(d)

        return {"etapas": etapas, "total_etapas": len(etapas)}


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

        return {
            "servicios": [{"id": r["id"], "nombre": r["nombre"]} for r in servicios],
            "rutas": [{"id": r["id"], "nombre": r["nombre"]} for r in rutas],
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

        # ── 1. Determinar columnas (estados) ──────────────────────
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
        where_clauses = []
        params = []

        if solo_activos:
            where_clauses.append("r.estado_op IN ('ABIERTA','EN_PROCESO')")

        if ruta_id:
            params.append(ruta_id)
            where_clauses.append(f"m.ruta_produccion_id = ${len(params)}")
        if marca_id:
            params.append(marca_id)
            where_clauses.append(f"m.marca_id = ${len(params)}")
        if tipo_id:
            params.append(tipo_id)
            where_clauses.append(f"m.tipo_id = ${len(params)}")
        if entalle_id:
            params.append(entalle_id)
            where_clauses.append(f"m.entalle_id = ${len(params)}")
        if tela_id:
            params.append(tela_id)
            where_clauses.append(f"m.tela_id = ${len(params)}")
        if hilo_id:
            params.append(hilo_id)
            where_clauses.append(f"m.hilo_id = ${len(params)}")
        if modelo_id:
            params.append(modelo_id)
            where_clauses.append(f"r.modelo_id = ${len(params)}")
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
                COALESCE(mov_agg.diferencia_total, 0) as diferencia_acumulada,
                COALESCE(mov_agg.total_movimientos, 0) as total_movimientos
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
                SELECT sp.nombre as ult_servicio, mp.fecha_inicio as ult_fecha_inicio
                FROM prod_movimientos_produccion mp
                LEFT JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id
                WHERE mp.registro_id = r.id
                ORDER BY mp.fecha_inicio DESC NULLS LAST, mp.created_at DESC
                LIMIT 1
            ) mov_ult ON true
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(mp2.diferencia), 0) as diferencia_total,
                       COUNT(*) as total_movimientos
                FROM prod_movimientos_produccion mp2
                WHERE mp2.registro_id = r.id
            ) mov_agg ON true
            WHERE {where_sql}
            ORDER BY
                COALESCE(ma.nombre, mma.nombre, r.modelo_manual->>'marca_texto'),
                COALESCE(tp.nombre, mtp.nombre, r.modelo_manual->>'tipo_texto'),
                COALESCE(en.nombre, men.nombre, r.modelo_manual->>'entalle_texto'),
                COALESCE(te.nombre, mte.nombre, r.modelo_manual->>'tela_texto'),
                COALESCE(hi.nombre, mhi.nombre, r.modelo_manual->>'hilo_texto'),
                r.n_corte
        """, *params)

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
                "diferencia_acumulada": safe_int(r["diferencia_acumulada"]),
                "total_movimientos": safe_int(r["total_movimientos"]),
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
                s.nombre as servicio_nombre,
                (SELECT COUNT(*) FROM produccion.prod_incidencia i
                 WHERE i.registro_id = r.id AND i.estado = 'ABIERTA') as incidencias_abiertas
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
    requeridos según su etapa actual de producción."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        linea_filter = f"AND r.linea_negocio_id = {linea_negocio_id}" if linea_negocio_id else ""

        registros = await conn.fetch(f"""
            SELECT
                r.id::text AS id,
                r.n_corte,
                r.estado,
                COALESCE(mod.nombre, r.modelo_manual->>'nombre_modelo', '') AS modelo_nombre,
                COALESCE(tp.nombre, r.modelo_manual->>'tipo_texto', '')    AS tipo_nombre,
                COALESCE(
                    (SELECT SUM(rt.cantidad_real)
                     FROM prod_registro_tallas rt WHERE rt.registro_id = r.id),
                    0
                ) AS total_prendas
            FROM prod_registros r
            LEFT JOIN prod_modelos mod ON mod.id = r.modelo_id
            LEFT JOIN prod_tipos tp    ON tp.id  = mod.tipo_id
            WHERE r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND r.dividido_desde_registro_id IS NULL
              {linea_filter}
              AND (
                tp.nombre ILIKE '%pantalon%' OR tp.nombre ILIKE '%pantalón%'
                OR tp.nombre ILIKE '%short%'
                OR tp.nombre ILIKE '%casaca%'
                OR r.modelo_manual->>'tipo_texto' ILIKE '%pantalon%'
                OR r.modelo_manual->>'tipo_texto' ILIKE '%pantalón%'
                OR r.modelo_manual->>'tipo_texto' ILIKE '%short%'
                OR r.modelo_manual->>'tipo_texto' ILIKE '%casaca%'
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

        mov_rows = await conn.fetch("""
            SELECT m.registro_id::text AS registro_id,
                   s.nombre            AS servicio_nombre
            FROM prod_movimientos_produccion m
            JOIN prod_servicios_produccion s ON s.id = m.servicio_id
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
            mov_by_reg.setdefault(row["registro_id"], []).append(
                (row["servicio_nombre"] or "").lower()
            )

        STAGE_ORDER = {
            "Para Corte": 0, "Corte": 1,
            "Para Costura": 2, "Costura": 3,
            "Para Atraque": 4, "Atraque": 5,
            "Para Lavandería": 6, "Muestra Lavanderia": 7, "Lavandería": 8,
            "Para Acabado": 9, "Acabado": 10,
            "Almacén PT": 11, "Tienda": 12,
        }

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

        def has_svc(rid, kw):
            return any(kw in s for s in mov_by_reg.get(rid, []))

        groups: dict = {}

        for reg in registros:
            rid = reg["id"]
            estado = reg["estado"] or ""
            stage_idx = STAGE_ORDER.get(estado, -1)

            if stage_idx < 2:
                continue

            faltantes = []

            # Materiales requeridos desde Para Costura
            if not has_mp(rid, "tocuyo"):
                faltantes.append("tocuyo")
            if not has_tela_no_tocuyo(rid):
                faltantes.append("tela principal")
            if not has_mp(rid, "cierre"):
                faltantes.append("Cierre")
            if not has_tallas_mp(rid):
                faltantes.append("Tallas")

            # Servicios comunes desde Para Costura
            if not has_svc(rid, "corte"):
                faltantes.append("servicio Corte")
            if not has_svc(rid, "estampado"):
                faltantes.append("Estampado")
            if not has_svc(rid, "bordado"):
                faltantes.append("Bordado")
            if not has_svc(rid, "pretina"):
                faltantes.append("Pretina")

            # Desde Para Lavandería: deben tener movimiento Costura y Atraque
            if stage_idx >= 6:
                if not has_svc(rid, "costura"):
                    faltantes.append("Costura")
                if not has_svc(rid, "atraque"):
                    faltantes.append("Atraque")

            # Desde Para Acabado: deben tener servicio Lavandería
            if stage_idx >= 9:
                if not has_svc(rid, "lavand"):
                    faltantes.append("Lavandería")

            # Desde Acabado: servicio Acabado + avíos de acabado
            if stage_idx >= 10:
                if not has_svc(rid, "acabado"):
                    faltantes.append("servicio Acabado")
                if not has_mp(rid, "boton") and not has_mp(rid, "botón"):
                    faltantes.append("Botón")
                if not has_mp(rid, "remache"):
                    faltantes.append("Remache x2")
                if not has_mp(rid, "bolsillero"):
                    faltantes.append("Hangtag Bolsillero")
                if not has_mp(rid, "pretinero"):
                    faltantes.append("Hangtag Pretinero")
                if not has_mp(rid, "entalle") and not has_mp(rid, "perfect"):
                    faltantes.append("Hangtag Entalle")
                if not has_mp(rid, "colgante"):
                    faltantes.append("Colgante")
                if not has_mp(rid, "adhesivo"):
                    faltantes.append("Adhesivo por talla")

            if faltantes:
                groups.setdefault(estado, []).append({
                    "id": rid,
                    "n_corte": reg["n_corte"],
                    "modelo": reg["modelo_nombre"],
                    "tipo": reg["tipo_nombre"],
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

        resumen["total"] = len(items)

        # Ordenar: en espera primero, luego por días desc
        items.sort(key=lambda a: (0 if a["en_espera"] else 1, -a["dias_parado"]))

        return {"items": items, "resumen": resumen}


@router.get("/costo-lote")
async def costo_por_lote(
    modelo_id: str = None,
    marca_id: str = None,
    estado: str = None,
    linea_negocio_id: str = None,
    empresa_id: int = Query(None),
):
    """Reporte completo de costos por lote: MP + Servicios + Otros + CIF."""
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
        if estado:
            where_clauses.append(f"r.estado = ${idx}")
            params.append(estado)
            idx += 1
        if linea_negocio_id:
            where_clauses.append(f"r.linea_negocio_id = ${idx}")
            params.append(linea_negocio_id)
            idx += 1

        where_sql = " AND ".join(where_clauses)

        query = f"""
        SELECT
            r.id,
            r.n_corte,
            r.estado,
            r.urgente,
            COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
            COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') AS marca_nombre,
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
        LEFT JOIN produccion.prod_registro_cierre c ON c.registro_id = r.id
        WHERE {where_sql}
        ORDER BY r.fecha_creacion DESC
        """

        rows = await conn.fetch(query, *params)

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

            items.append({
                "id": row["id"],
                "n_corte": row["n_corte"],
                "modelo": row["modelo_nombre"],
                "marca": row["marca_nombre"],
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
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Info del registro
        reg = await conn.fetchrow("""
            SELECT r.id, r.n_corte, r.estado, r.urgente, r.curva,
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

        return {
            "registro_id": reg["id"],
            "n_corte": reg["n_corte"],
            "modelo": reg["modelo"],
            "marca": reg["marca"],
            "estado": reg["estado"],
            "urgente": reg["urgente"],
            "cerrado": cerrado,
            "resumen": {
                "costo_mp": round(float(reg["cierre_mp"]) if cerrado else total_mp, 2),
                "costo_servicios": round(float(reg["cierre_serv"]) if cerrado else total_serv, 2),
                "costo_otros": round(float(reg["cierre_otros"] or 0) if cerrado else total_otros, 2),
                "costo_cif": round(float(reg["cierre_cif"] or 0) if cerrado else 0, 2),
                "costo_total": round(float(reg["cierre_total"]) if cerrado else (total_mp + total_serv + total_otros), 2),
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


# ==================== COSTOS DE PRODUCCIÓN ====================

@router.get("/costos-produccion")
async def get_costos_produccion(
    empresa_id: int = Query(7),
    estado: Optional[str] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    linea_negocio_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Reporte de costos de producción agrupado por línea de negocio.
    Devuelve materiales (por ítem) y servicios (por tipo) desagregados por corte.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # ── Build filter ──────────────────────────────────────────────
        where_parts = ["r.empresa_id = $1"]
        params = [empresa_id]
        idx = 2

        if estado:
            params.append(estado)
            where_parts.append(f"r.estado_op = ${idx}"); idx += 1
        if fecha_desde:
            # Convertir string 'YYYY-MM-DD' a date — asyncpg NO acepta strings para columnas DATE
            try:
                fd = date.fromisoformat(fecha_desde) if isinstance(fecha_desde, str) else fecha_desde
                params.append(fd)
                where_parts.append(f"r.fecha_creacion >= ${idx}"); idx += 1
            except ValueError:
                pass  # fecha inválida → se ignora
        if fecha_hasta:
            try:
                fh = date.fromisoformat(fecha_hasta) if isinstance(fecha_hasta, str) else fecha_hasta
                params.append(fh)
                where_parts.append(f"r.fecha_creacion <= ${idx}"); idx += 1
            except ValueError:
                pass
        if linea_negocio_id:
            params.append(linea_negocio_id)
            where_parts.append(f"r.linea_negocio_id = ${idx}"); idx += 1

        where_sql = " AND ".join(where_parts)

        # ── 1. Main registros ─────────────────────────────────────────
        reg_rows = await conn.fetch(f"""
            SELECT
                r.id,
                r.n_corte,
                r.estado_op,
                r.fecha_creacion,
                r.tallas AS tallas_json,
                r.linea_negocio_id,
                COALESCE(ln.nombre, 'SIN CLASIFICAR') AS linea_nombre,
                m.nombre AS modelo_nombre
            FROM produccion.prod_registros r
            LEFT JOIN finanzas2.cont_linea_negocio ln ON ln.id = r.linea_negocio_id
            LEFT JOIN produccion.prod_modelos m ON m.id = r.modelo_id
            WHERE {where_sql}
            ORDER BY ln.nombre NULLS LAST, r.fecha_creacion DESC
        """, *params)

        if not reg_rows:
            return {"grupos": [], "tallas_keys": [], "servicios_keys": [], "materiales_keys": []}

        reg_ids = [str(r["id"]) for r in reg_rows]

        # ── 2. Service costs per registro ─────────────────────────────
        serv_rows = await conn.fetch("""
            SELECT
                mp.registro_id::text AS registro_id,
                sv.nombre            AS servicio,
                SUM(COALESCE(mp.costo_calculado, 0)) AS costo
            FROM produccion.prod_movimientos_produccion mp
            LEFT JOIN produccion.prod_servicios_produccion sv ON sv.id = mp.servicio_id
            WHERE mp.registro_id::text = ANY($1::text[])
              AND COALESCE(mp.costo_calculado, 0) > 0
            GROUP BY mp.registro_id, sv.nombre
        """, reg_ids)

        # ── 3. Material costs per registro ────────────────────────────
        mat_rows = await conn.fetch("""
            SELECT
                s.registro_id::text AS registro_id,
                COALESCE(inv.nombre, 'Otro') AS material,
                COALESCE(inv.codigo, '') AS codigo,
                SUM(COALESCE(s.costo_total, 0)) AS costo
            FROM produccion.prod_inventario_salidas s
            LEFT JOIN produccion.prod_inventario inv ON inv.id = s.item_id
            WHERE s.registro_id::text = ANY($1::text[])
              AND COALESCE(s.costo_total, 0) > 0
            GROUP BY s.registro_id, inv.nombre, inv.codigo
        """, reg_ids)

        # ── Index by registro_id ──────────────────────────────────────
        servicios_by_reg = {}  # {reg_id: {servicio: costo}}
        all_servicios = set()
        for row in serv_rows:
            rid = row["registro_id"]
            svc = row["servicio"] or "Sin nombre"
            servicios_by_reg.setdefault(rid, {})[svc] = float(row["costo"])
            all_servicios.add(svc)

        materiales_by_reg = {}  # {reg_id: {material_key: costo}}
        all_materiales = set()
        for row in mat_rows:
            rid = row["registro_id"]
            mat_key = row["material"] or "Otro"
            materiales_by_reg.setdefault(rid, {})[mat_key] = \
                materiales_by_reg.get(rid, {}).get(mat_key, 0) + float(row["costo"])
            all_materiales.add(mat_key)

        # ── Collect all talla keys ────────────────────────────────────
        all_tallas = set()
        for row in reg_rows:
            tallas_list = parse_jsonb(row["tallas_json"])
            for t in tallas_list:
                tn = t.get("talla_nombre") or t.get("talla") or ""
                if tn:
                    all_tallas.add(tn)

        # Ordered talla keys: numeric first, then alpha
        def talla_sort_key(t):
            try:
                return (0, int(t))
            except ValueError:
                return (1, t)
        tallas_keys = sorted(all_tallas, key=talla_sort_key)

        # Ordered service keys: canonical order then alphabetical
        SVC_ORDER = ["Corte", "Costura", "Lavanderia", "Lavandería", "Acabado",
                     "Estampado", "Bordado", "Atraque", "Cuero lazer", "Pegado cuero"]
        def svc_sort_key(s):
            s_lower = s.lower()
            for i, canonical in enumerate(SVC_ORDER):
                if canonical.lower() in s_lower or s_lower in canonical.lower():
                    return (i, s)
            return (len(SVC_ORDER), s)
        servicios_keys = sorted(all_servicios, key=svc_sort_key)

        # Material keys order
        MAT_ORDER = ["denim", "tocuyo", "forro", "tela"]
        def mat_sort_key(m):
            m_lower = m.lower()
            for i, canonical in enumerate(MAT_ORDER):
                if canonical in m_lower:
                    return (i, m)
            return (len(MAT_ORDER), m)
        materiales_keys = sorted(all_materiales, key=mat_sort_key)

        # ── Group registros by linea ──────────────────────────────────
        from collections import defaultdict, OrderedDict
        grupos_dict = OrderedDict()

        for row in reg_rows:
            rid = str(row["id"])
            linea_id = row["linea_negocio_id"]
            linea_nombre = row["linea_nombre"]
            grupo_key = linea_id or 0

            if grupo_key not in grupos_dict:
                grupos_dict[grupo_key] = {
                    "linea_negocio_id": linea_id,
                    "linea_nombre": linea_nombre,
                    "registros": [],
                    "totales": {
                        "total_prendas": 0,
                        "costo_materiales": 0,
                        "costo_servicios": 0,
                        "costo_total": 0,
                    }
                }

            # Build tallas dict for this registro
            tallas_list = parse_jsonb(row["tallas_json"])
            tallas_dict = {}
            total_prendas = 0
            for t in tallas_list:
                tn = t.get("talla_nombre") or t.get("talla") or ""
                qty = safe_int(t.get("cantidad", 0))
                if tn:
                    tallas_dict[tn] = tallas_dict.get(tn, 0) + qty
                    total_prendas += qty

            svc_dict = servicios_by_reg.get(rid, {})
            mat_dict = materiales_by_reg.get(rid, {})

            costo_mat = sum(mat_dict.values())
            costo_svc = sum(svc_dict.values())
            costo_total = costo_mat + costo_svc

            registro_item = {
                "id": rid,
                "n_corte": row["n_corte"],
                "estado_op": row["estado_op"],
                "fecha_creacion": str(row["fecha_creacion"]) if row["fecha_creacion"] else None,
                "modelo_nombre": row["modelo_nombre"] or "",
                "total_prendas": total_prendas,
                "tallas": tallas_dict,
                "materiales": mat_dict,
                "servicios": svc_dict,
                "costo_materiales": round(costo_mat, 2),
                "costo_servicios": round(costo_svc, 2),
                "costo_total": round(costo_total, 2),
                "costo_unitario": round(costo_total / total_prendas, 4) if total_prendas > 0 else 0,
            }

            grupos_dict[grupo_key]["registros"].append(registro_item)
            g = grupos_dict[grupo_key]["totales"]
            g["total_prendas"] += total_prendas
            g["costo_materiales"] = round(g.get("costo_materiales", 0) + costo_mat, 2)
            g["costo_servicios"] = round(g.get("costo_servicios", 0) + costo_svc, 2)
            g["costo_total"] = round(g.get("costo_total", 0) + costo_total, 2)

        # Add per-column totals per grupo
        for grupo in grupos_dict.values():
            tallas_total = {}
            mat_total = {}
            svc_total = {}
            for reg in grupo["registros"]:
                for k, v in reg["tallas"].items():
                    tallas_total[k] = tallas_total.get(k, 0) + v
                for k, v in reg["materiales"].items():
                    mat_total[k] = mat_total.get(k, 0) + v
                for k, v in reg["servicios"].items():
                    svc_total[k] = svc_total.get(k, 0) + v
            grupo["totales"]["tallas"] = tallas_total
            grupo["totales"]["materiales"] = {k: round(v, 2) for k, v in mat_total.items()}
            grupo["totales"]["servicios"] = {k: round(v, 2) for k, v in svc_total.items()}

        return {
            "grupos": list(grupos_dict.values()),
            "tallas_keys": tallas_keys,
            "servicios_keys": servicios_keys,
            "materiales_keys": materiales_keys,
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
