"""Reporte: cortes desde Lavandería en adelante que aún no tienen
matriz de colores aprobada (o tienen matriz incompleta).

Pensado para que Diana/operario móvil pueda detectar rápidamente qué
cortes están "avanzados" pero les falta la asignación de colores, y poder
ir directo a la matriz para asignarlos.

Para los cortes que están en Lavandería, también devuelve la lavandería
donde están (último movimiento abierto de servicio Lavandería).
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query

from db import get_pool
from auth_utils import get_current_user
from helpers import row_to_dict, parse_jsonb

router = APIRouter(prefix="/api", tags=["cortes-pendientes-colores"])


# Estados desde Lavandería en adelante (incluye también Muestra Lavanderia,
# que es una variante paralela del flujo).
ESTADOS_OBJETIVO = [
    "Para Lavanderia",
    "Lavanderia",
    "Muestra Lavanderia",
    "Para Acabado",
    "Acabado",
    "Almacen PT",
    "Tienda",
]


@router.get("/cortes/pendientes-colores")
async def cortes_pendientes_colores(
    estado_matriz: str = Query("incompleta", description="incompleta | sin_matriz | parcial | aprobada | todas"),
    estados: Optional[str] = Query(None, description="Coma-separados. Default: lavandería en adelante."),
    marca_id: Optional[str] = None,
    lavanderia_id: Optional[str] = None,
    solo_urgentes: bool = Query(False),
    empresa_id: int = Query(7),
    limit: int = Query(200, ge=1, le=500),
    _user = Depends(get_current_user),
):
    """Lista de cortes con detalle del estado de su matriz + lavandería actual.

    Reglas para clasificar el estado de la matriz:
      - "sin_matriz":  distribucion_colores vacío/null
      - "parcial":     distribucion_colores con datos pero colores_aprobados=false
      - "aprobada":    colores_aprobados=true
      - "incompleta":  sin_matriz + parcial (default que pide la pantalla)

    El campo lavanderia_* solo se llena cuando el estado del corte es
    'Lavanderia' o 'Muestra Lavanderia'.
    """
    estados_list = (
        [e.strip() for e in estados.split(",") if e.strip()] if estados else ESTADOS_OBJETIVO
    )

    pool = await get_pool()
    async with pool.acquire() as conn:
        conds = ["r.empresa_id = $1", f"r.estado = ANY($2::varchar[])"]
        params: list = [empresa_id, estados_list]
        idx = 3

        if marca_id:
            conds.append(
                f"(COALESCE(m.marca_id, r.modelo_manual->>'marca_id') = ${idx})"
            )
            params.append(marca_id)
            idx += 1

        if solo_urgentes:
            conds.append("r.urgente = TRUE")

        # Filtro estado_op: ignoramos cerrados/anulados salvo que el front pida estados que los incluyan
        conds.append("r.estado_op IN ('ABIERTA','EN_PROCESO')")

        where_sql = " AND ".join(conds)

        rows = await conn.fetch(f"""
            SELECT r.id,
                   r.n_corte,
                   r.estado,
                   r.estado_op,
                   r.urgente,
                   r.fecha_entrega_final,
                   r.fecha_creacion,
                   r.distribucion_colores,
                   COALESCE(r.colores_aprobados, FALSE) AS colores_aprobados,
                   COALESCE(m.nombre, r.modelo_manual->>'nombre_modelo') AS modelo_nombre,
                   COALESCE(ma.nombre, r.modelo_manual->>'marca_texto') AS marca_nombre,
                   COALESCE(t.nombre,  r.modelo_manual->>'tipo_texto')  AS tipo_nombre,
                   COALESCE(e.nombre,  r.modelo_manual->>'entalle_texto') AS entalle_nombre,
                   COALESCE(te.nombre, r.modelo_manual->>'tela_texto') AS tela_nombre,
                   (SELECT COALESCE(SUM(rt.cantidad_real), 0)
                      FROM prod_registro_tallas rt
                     WHERE rt.registro_id = r.id) AS total_prendas
              FROM prod_registros r
              LEFT JOIN prod_modelos m ON m.id = r.modelo_id
              LEFT JOIN prod_marcas ma ON ma.id = m.marca_id
              LEFT JOIN prod_tipos t ON t.id = m.tipo_id
              LEFT JOIN prod_entalles e ON e.id = m.entalle_id
              LEFT JOIN prod_telas te ON te.id = m.tela_id
             WHERE {where_sql}
             ORDER BY r.urgente DESC, r.fecha_entrega_final ASC NULLS LAST
             LIMIT ${idx}
        """, *params, limit)

        # Para los cortes con estado de Lavandería, buscar el último movimiento
        # abierto de servicio Lavandería para enriquecer la persona/taller.
        en_lavanderia_ids = [
            r["id"] for r in rows
            if r["estado"] in ("Lavanderia", "Muestra Lavanderia")
        ]

        lavanderia_por_corte = {}
        if en_lavanderia_ids:
            # Movimientos abiertos de servicio Lavandería para esos cortes
            mov_rows = await conn.fetch("""
                SELECT DISTINCT ON (mp.registro_id)
                       mp.registro_id,
                       mp.persona_id,
                       p.nombre AS persona_nombre,
                       mp.fecha_inicio,
                       sp.nombre AS servicio_nombre
                  FROM prod_movimientos_produccion mp
                  JOIN prod_servicios_produccion sp ON sp.id = mp.servicio_id
                  LEFT JOIN prod_personas_produccion p ON p.id = mp.persona_id
                 WHERE mp.registro_id = ANY($1::varchar[])
                   AND LOWER(sp.nombre) LIKE 'lavander%'
                   AND mp.fecha_inicio IS NOT NULL
                 ORDER BY mp.registro_id, mp.fecha_inicio DESC NULLS LAST
            """, en_lavanderia_ids)
            for m in mov_rows:
                lavanderia_por_corte[m["registro_id"]] = {
                    "persona_id": m["persona_id"],
                    "persona_nombre": m["persona_nombre"],
                    "fecha_inicio": str(m["fecha_inicio"]) if m["fecha_inicio"] else None,
                    "servicio_nombre": m["servicio_nombre"],
                }

        items = []
        for r in rows:
            d = row_to_dict(r)
            d["distribucion_colores"] = parse_jsonb(d.get("distribucion_colores"))
            dist = d["distribucion_colores"] or []

            # Resumir colores asignados
            colores_asignados = set()
            total_asignado = 0
            for talla in dist:
                for c in (talla.get("colores") or []):
                    if c.get("color_nombre"):
                        colores_asignados.add(c["color_nombre"])
                    total_asignado += int(c.get("cantidad") or 0)

            total_prendas = int(d.get("total_prendas") or 0)
            tiene_dist = len(dist) > 0 and total_asignado > 0
            aprobada = bool(d.get("colores_aprobados"))

            if not tiene_dist:
                estado_matriz_calc = "sin_matriz"
            elif aprobada:
                estado_matriz_calc = "aprobada"
            else:
                estado_matriz_calc = "parcial"

            d["estado_matriz"] = estado_matriz_calc
            d["n_colores_asignados"] = len(colores_asignados)
            d["total_asignado"] = total_asignado
            d["cobertura_pct"] = round((total_asignado / total_prendas * 100), 1) if total_prendas else 0

            # Resumen mini de colores para la card (top 3 por cantidad)
            resumen_colores: List[dict] = []
            agg: dict = {}
            for talla in dist:
                for c in (talla.get("colores") or []):
                    nombre = c.get("color_nombre") or "—"
                    cant = int(c.get("cantidad") or 0)
                    if nombre not in agg:
                        agg[nombre] = {"nombre": nombre, "cantidad": 0, "color_id": c.get("color_id")}
                    agg[nombre]["cantidad"] += cant
            for v in sorted(agg.values(), key=lambda x: -x["cantidad"])[:3]:
                resumen_colores.append(v)
            d["resumen_colores"] = resumen_colores

            # Lavandería actual (si aplica)
            d["lavanderia"] = lavanderia_por_corte.get(r["id"])

            # Filtro por lavandería específica (post-fetch, simple)
            if lavanderia_id:
                lav = d.get("lavanderia") or {}
                if lav.get("persona_id") != lavanderia_id:
                    continue

            # Filtro por estado de matriz
            if estado_matriz == "sin_matriz" and estado_matriz_calc != "sin_matriz":
                continue
            if estado_matriz == "parcial" and estado_matriz_calc != "parcial":
                continue
            if estado_matriz == "aprobada" and estado_matriz_calc != "aprobada":
                continue
            if estado_matriz == "incompleta" and estado_matriz_calc not in ("sin_matriz", "parcial"):
                continue
            # "todas" → no filtra

            # Limpiar el JSONB grande de la respuesta (ya extrajimos resumen)
            d.pop("distribucion_colores", None)
            d.pop("fecha_creacion", None)
            items.append(d)

        # KPIs globales para los chips superiores (totales por estado del corte)
        kpis_estado = {}
        for it in items:
            est = it.get("estado") or "—"
            kpis_estado[est] = kpis_estado.get(est, 0) + 1

        return {
            "items": items,
            "total": len(items),
            "kpis": {
                "total": len(items),
                "por_estado": kpis_estado,
                "en_lavanderia": sum(1 for i in items if i["estado"] in ("Lavanderia", "Muestra Lavanderia")),
                "acabado_o_mas": sum(1 for i in items if i["estado"] in ("Para Acabado", "Acabado", "Almacen PT", "Tienda")),
                "sin_matriz": sum(1 for i in items if i["estado_matriz"] == "sin_matriz"),
                "parcial": sum(1 for i in items if i["estado_matriz"] == "parcial"),
            },
        }
