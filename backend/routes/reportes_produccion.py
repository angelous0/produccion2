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
from auth import get_current_user
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
            WHERE r.empresa_id = $1
              AND r.dividido_desde_registro_id IS NULL
              {linea_filter}
            GROUP BY r.estado_op
        """, empresa_id)

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
            WHERE r.empresa_id = $1
              AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND r.dividido_desde_registro_id IS NULL
              {linea_filter}
            GROUP BY r.estado
            ORDER BY cnt DESC
        """, empresa_id)
        dist_estado = [{"estado": r["estado"], "cantidad": int(r["cnt"]), "prendas": int(r["prendas"])} for r in rows_estado]

        # KPI 3: Lotes atrasados
        atrasados_count = await conn.fetchval("""
            SELECT COUNT(DISTINCT r.id)
            FROM prod_registros r
            WHERE r.empresa_id = $1
              AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND (
                r.fecha_entrega_final < CURRENT_DATE
                OR EXISTS (
                    SELECT 1 FROM prod_movimientos_produccion mp
                    WHERE mp.registro_id = r.id
                      AND mp.fecha_esperada_movimiento < CURRENT_DATE
                      AND mp.fecha_fin IS NULL
                )
              )
        """, empresa_id)

        # KPI 4: Movimientos abiertos (sin fecha_fin)
        movs_abiertos = await conn.fetchval("""
            SELECT COUNT(*)
            FROM prod_movimientos_produccion mp
            JOIN prod_registros r ON mp.registro_id = r.id
            WHERE r.empresa_id = $1
              AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND mp.fecha_fin IS NULL
        """, empresa_id)

        # KPI 5: Prendas por servicio (top 10)
        rows_srv = await conn.fetch("""
            SELECT sp.nombre as servicio, 
                   COUNT(DISTINCT mp.registro_id) as lotes,
                   COALESCE(SUM(mp.cantidad_enviada),0) as enviadas,
                   COALESCE(SUM(mp.cantidad_recibida),0) as recibidas
            FROM prod_movimientos_produccion mp
            JOIN prod_registros r ON mp.registro_id = r.id
            JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id
            WHERE r.empresa_id = $1
              AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
            GROUP BY sp.nombre
            ORDER BY lotes DESC
            LIMIT 10
        """, empresa_id)
        por_servicio = [
            {"servicio": r["servicio"], "lotes": int(r["lotes"]),
             "enviadas": safe_int(r["enviadas"]), "recibidas": safe_int(r["recibidas"])}
            for r in rows_srv
        ]

        # KPI 6: Lotes fraccionados count
        fraccionados = await conn.fetchval("""
            SELECT COUNT(*) FROM prod_registros
            WHERE empresa_id = $1 AND dividido_desde_registro_id IS NOT NULL
        """, empresa_id)

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
                   m.nombre as modelo_nombre,
                   ma.nombre as marca_nombre,
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
            WHERE r.empresa_id = $1
              AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
        """
        params = [empresa_id]

        if estado:
            params.append(estado)
            query += f" AND r.estado = ${len(params)}"
        if modelo_id:
            params.append(modelo_id)
            query += f" AND r.modelo_id = ${len(params)}"
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
            WHERE r.empresa_id = $1
              AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND r.dividido_desde_registro_id IS NULL
            GROUP BY r.estado
            ORDER BY lotes DESC
        """, empresa_id)

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
            WHERE r.empresa_id = $1
              AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
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
        """, empresa_id)

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
            WHERE r.empresa_id = $1
              AND r.estado_op IN ('ABIERTA', 'EN_PROCESO')
              AND r.dividido_desde_registro_id IS NULL
              AND rp.id IS NOT NULL
        """
        params = [empresa_id]
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
            WHERE r.empresa_id = $1
        """
        params = [empresa_id]
        if servicio_id:
            params.append(servicio_id)
            query_srv += f" AND mp.servicio_id = ${len(params)}"
        if persona_id:
            params.append(persona_id)
            query_srv += f" AND mp.persona_id = ${len(params)}"

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
                   mo.nombre as modelo_nombre,
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
            WHERE p.empresa_id = $1
              AND EXISTS (SELECT 1 FROM prod_registros h WHERE h.dividido_desde_registro_id = p.id)
            ORDER BY p.fecha_creacion DESC
        """, empresa_id)

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
        modelos = await conn.fetch("SELECT id, nombre FROM prod_modelos ORDER BY nombre")
        estados = await conn.fetch("""
            SELECT DISTINCT estado FROM prod_registros WHERE empresa_id = $1 AND estado_op IN ('ABIERTA','EN_PROCESO') ORDER BY estado
        """, empresa_id)

        return {
            "servicios": [{"id": r["id"], "nombre": r["nombre"]} for r in servicios],
            "rutas": [{"id": r["id"], "nombre": r["nombre"]} for r in rutas],
            "modelos": [{"id": r["id"], "nombre": r["nombre"]} for r in modelos],
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
        where_clauses = ["r.empresa_id = $1"]
        params = [empresa_id]

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

        where_sql = " AND ".join(where_clauses)

        rows = await conn.fetch(f"""
            SELECT
                r.id, r.n_corte, r.estado, r.estado_op, r.urgente,
                r.fecha_entrega_final, r.tallas as tallas_jsonb,
                r.dividido_desde_registro_id,
                r.curva,
                r.fecha_creacion,
                r.distribucion_colores as dist_colores_raw,
                COALESCE(ma.id,'')   as marca_id,
                COALESCE(ma.nombre,'Sin marca')  as marca,
                COALESCE(tp.id,'')   as tipo_id_val,
                COALESCE(tp.nombre,'Sin tipo')   as tipo,
                COALESCE(en.id,'')   as entalle_id_val,
                COALESCE(en.nombre,'Sin entalle') as entalle,
                COALESCE(te.id,'')   as tela_id_val,
                COALESCE(te.nombre,'Sin tela')   as tela,
                COALESCE(hi.id,'')   as hilo_id_val,
                COALESCE(hi.nombre,'Sin hilo')   as hilo,
                COALESCE(he.nombre,'')   as hilo_especifico,
                m.nombre  as modelo_nombre,
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
            ORDER BY ma.nombre, tp.nombre, en.nombre, te.nombre, hi.nombre, r.n_corte
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
                mod.nombre as modelo_nombre,
                marca.nombre as marca_nombre,
                tipo.nombre as tipo_nombre,
                ent.nombre as entalle_nombre,
                tela.nombre as tela_nombre,
                COALESCE(he.nombre, '') as hilo_especifico_nombre,
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
                "avance_porcentaje": r["avance_porcentaje"],
                "usuario": r["usuario"],
                "fecha": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]



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
                mod.nombre as modelo_nombre,
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
                SELECT ut.registro_id,
                       bool_or(m2.fecha_inicio IS NOT NULL) as siguiente_iniciado
                FROM ultimo_terminado ut
                LEFT JOIN produccion.prod_movimientos_produccion m2
                    ON m2.registro_id = ut.registro_id
                    AND m2.created_at > ut.mov_created
                    AND m2.id != ut.movimiento_id
                GROUP BY ut.registro_id
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
                mod.nombre as modelo_nombre,
                marca.nombre as marca_nombre,
                COALESCE(tp.nombre, '') as tipo_nombre,
                COALESCE(en.nombre, '') as entalle_nombre,
                COALESCE(te.nombre, '') as tela_nombre,
                COALESCE(he.nombre, '') as hilo_especifico_nombre,
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

        items = []
        resumen = {"total": 0, "en_espera": 0, "criticos": 0, "dias_perdidos": 0}

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

            items.append({
                "registro_id": str(row["registro_id"]),
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
            })

            if en_espera:
                resumen["en_espera"] += 1
                resumen["dias_perdidos"] += dias_parado
            if nivel == 'critico':
                resumen["criticos"] += 1

        resumen["total"] = len(items)

        # Ordenar: en espera primero, luego por días desc
        items.sort(key=lambda a: (0 if a["en_espera"] else 1, -a["dias_parado"]))

        return {"items": items, "resumen": resumen}

        return {"alertas": alertas, "resumen": resumen}
