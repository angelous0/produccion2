"""Router for modelos/bases CRUD, tallas, BOM, variantes, muestras, PT."""
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from db import get_pool
from auth_utils import get_current_user, require_permiso as require_permission
from models import (
    Modelo, ModeloCreate, ModeloTallaCreate, ModeloTallaUpdate, ModeloBomLineaCreate,
    ModeloBomLineaUpdate, ReorderRequest,
)
from helpers import row_to_dict, parse_jsonb, registrar_actividad, get_muestra_pool
from typing import Optional, List
from pydantic import BaseModel

router = APIRouter(prefix="/api")

@router.get("/muestras-modelos")
async def get_muestras_modelos(search: str = ""):
    try:
        pool = await get_muestra_pool()
        async with pool.acquire() as conn:
            if search:
                rows = await conn.fetch("""
                    SELECT m.id, m.nombre, m.aprobado, m.activo,
                        b.nombre as base_nombre, h.nombre as hilo_nombre
                    FROM muestra.modelos m
                    LEFT JOIN muestra.bases b ON b.id = m.base_id
                    LEFT JOIN muestra.hilos h ON h.id = m.hilo_id
                    WHERE m.activo = true AND (
                        LOWER(m.nombre) LIKE $1 OR LOWER(b.nombre) LIKE $1 OR LOWER(h.nombre) LIKE $1
                    )
                    ORDER BY m.orden, m.nombre
                """, f"%{search.lower()}%")
            else:
                rows = await conn.fetch("""
                    SELECT m.id, m.nombre, m.aprobado, m.activo,
                        b.nombre as base_nombre, h.nombre as hilo_nombre
                    FROM muestra.modelos m
                    LEFT JOIN muestra.bases b ON b.id = m.base_id
                    LEFT JOIN muestra.hilos h ON h.id = m.hilo_id
                    WHERE m.activo = true
                    ORDER BY m.orden, m.nombre
                """)
            return [{**dict(r), "nombre": r["nombre"].replace("Modelo - ", "").replace("Modelo -", "")} for r in rows]
    except Exception as e:
        return {"error": str(e), "items": []}


@router.get("/muestras-bases")
async def get_muestras_bases(search: str = ""):
    try:
        pool = await get_muestra_pool()
        async with pool.acquire() as conn:
            query = """
                SELECT b.id, b.nombre,
                    h.nombre as hilo_nombre,
                    m.nombre as marca_nombre, tp.nombre as tipo_nombre,
                    e.nombre as entalle_nombre, t.nombre as tela_nombre
                FROM muestra.bases b
                LEFT JOIN muestra.hilos h ON h.id = b.hilo_id
                LEFT JOIN muestra.muestras_base mb ON mb.id = b.muestra_base_id
                LEFT JOIN muestra.marcas m ON m.id = mb.marca_id
                LEFT JOIN muestra.tipos_producto tp ON tp.id = mb.tipo_producto_id
                LEFT JOIN muestra.entalles e ON e.id = mb.entalle_id
                LEFT JOIN muestra.telas t ON t.id = mb.tela_id
                WHERE b.activo = true
            """
            if search:
                query += " AND (LOWER(b.nombre) LIKE $1 OR LOWER(m.nombre) LIKE $1 OR LOWER(tp.nombre) LIKE $1)"
                rows = await conn.fetch(query + " ORDER BY b.nombre", f"%{search.lower()}%")
            else:
                rows = await conn.fetch(query + " ORDER BY b.nombre")
            return [dict(r) for r in rows]
    except Exception as e:
        return {"error": str(e), "items": []}



@router.get("/modelos")
async def get_modelos(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    tela: str = "",
    all: str = "",
    tipo_modelo: str = "",
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # If all=true, return all modelos without pagination (for dropdowns/selects)
        if all == "true":
            rows = await conn.fetch("""
                SELECT m.*,
                    ma.nombre as marca_nombre,
                    t.nombre as tipo_nombre,
                    e.nombre as entalle_nombre,
                    te.nombre as tela_nombre,
                    h.nombre as hilo_nombre,
                    he.nombre as hilo_especifico_nombre,
                    rp.nombre as ruta_nombre,
                    inv.nombre as pt_item_nombre,
                    inv.codigo as pt_item_codigo,
                    ln.nombre as linea_negocio_nombre,
                    base_m.nombre as base_nombre,
                    COALESCE(reg_count.total, 0) as registros_count,
                    COALESCE(var_count.total, 0) as variantes_count
                FROM prod_modelos m
                LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
                LEFT JOIN prod_tipos t ON m.tipo_id = t.id
                LEFT JOIN prod_entalles e ON m.entalle_id = e.id
                LEFT JOIN prod_telas te ON m.tela_id = te.id
                LEFT JOIN prod_hilos h ON m.hilo_id = h.id
                LEFT JOIN prod_hilos_especificos he ON m.hilo_especifico_id = he.id
                LEFT JOIN prod_rutas_produccion rp ON m.ruta_produccion_id = rp.id
                LEFT JOIN prod_inventario inv ON m.pt_item_id = inv.id
                LEFT JOIN finanzas2.cont_linea_negocio ln ON m.linea_negocio_id = ln.id
                LEFT JOIN prod_modelos base_m ON m.base_id = base_m.id
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) as total FROM prod_registros r WHERE r.modelo_id = m.id
                ) reg_count ON true
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) as total FROM prod_modelos v WHERE v.base_id = m.id
                ) var_count ON true
                WHERE ($1 = '' OR ($1 = 'base' AND m.base_id IS NULL) OR ($1 = 'variante' AND m.base_id IS NOT NULL))
                ORDER BY m.created_at DESC
            """, tipo_modelo)
            result = []
            for r in rows:
                d = row_to_dict(r)
                d['servicios_ids'] = parse_jsonb(d.get('servicios_ids'))
                result.append(d)

            # Resolve muestra names from external DB
            muestra_ids = [d['muestra_modelo_id'] for d in result if d.get('muestra_modelo_id')]
            muestra_base_ids = [d['muestra_base_id'] for d in result if d.get('muestra_base_id')]
            if muestra_ids or muestra_base_ids:
                try:
                    m_pool = await get_muestra_pool()
                    async with m_pool.acquire() as m_conn:
                        if muestra_ids:
                            m_rows = await m_conn.fetch(
                                "SELECT m.id, m.nombre, h.nombre as hilo_nombre FROM muestra.modelos m LEFT JOIN muestra.hilos h ON h.id = m.hilo_id WHERE m.id = ANY($1::text[])",
                                muestra_ids
                            )
                            m_map = {str(r['id']): f"{r['nombre'].replace('Modelo - ', '').replace('Modelo -', '')} ({r['hilo_nombre'] or '-'})" for r in m_rows}
                            for d in result:
                                if d.get('muestra_modelo_id'):
                                    d['muestra_nombre'] = m_map.get(d['muestra_modelo_id'], '')
                        if muestra_base_ids:
                            b_rows = await m_conn.fetch(
                                """SELECT b.id, b.nombre, m.nombre as marca, tp.nombre as tipo, e.nombre as entalle, t.nombre as tela
                                FROM muestra.bases b
                                LEFT JOIN muestra.muestras_base mb ON mb.id = b.muestra_base_id
                                LEFT JOIN muestra.marcas m ON m.id = mb.marca_id
                                LEFT JOIN muestra.tipos_producto tp ON tp.id = mb.tipo_producto_id
                                LEFT JOIN muestra.entalles e ON e.id = mb.entalle_id
                                LEFT JOIN muestra.telas t ON t.id = mb.tela_id
                                WHERE b.id = ANY($1::text[])""",
                                muestra_base_ids
                            )
                            b_map = {str(r['id']): r['nombre'] for r in b_rows}
                            b_info_map = {str(r['id']): f"Marca: {r['marca'] or '-'} | Tipo: {r['tipo'] or '-'} | Entalle: {r['entalle'] or '-'} | Tela: {r['tela'] or '-'}" for r in b_rows}
                            for d in result:
                                if d.get('muestra_base_id'):
                                    d['muestra_base_nombre'] = b_map.get(d['muestra_base_id'], '')
                                    d['muestra_base_info'] = b_info_map.get(d['muestra_base_id'], '')
                except Exception:
                    pass

            return result

        # Build WHERE clause dynamically for paginated query
        conditions = []
        params = []
        param_idx = 1

        if tipo_modelo == 'base':
            conditions.append("m.base_id IS NULL")
        elif tipo_modelo == 'variante':
            conditions.append("m.base_id IS NOT NULL")

        if search:
            conditions.append(f"(m.nombre ILIKE ${param_idx} OR ma.nombre ILIKE ${param_idx} OR t.nombre ILIKE ${param_idx} OR e.nombre ILIKE ${param_idx} OR te.nombre ILIKE ${param_idx})")
            params.append(f"%{search}%")
            param_idx += 1

        if marca:
            conditions.append(f"ma.nombre = ${param_idx}")
            params.append(marca)
            param_idx += 1

        if tipo:
            conditions.append(f"t.nombre = ${param_idx}")
            params.append(tipo)
            param_idx += 1

        if entalle:
            conditions.append(f"e.nombre = ${param_idx}")
            params.append(entalle)
            param_idx += 1

        if tela:
            conditions.append(f"te.nombre = ${param_idx}")
            params.append(tela)
            param_idx += 1

        where_clause = " AND ".join(conditions) if conditions else "TRUE"

        # Count total
        count_row = await conn.fetchrow(f"""
            SELECT COUNT(*) as total
            FROM prod_modelos m
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_tipos t ON m.tipo_id = t.id
            LEFT JOIN prod_entalles e ON m.entalle_id = e.id
            LEFT JOIN prod_telas te ON m.tela_id = te.id
            WHERE {where_clause}
        """, *params)
        total = count_row['total']

        # Get paginated data
        rows = await conn.fetch(f"""
            SELECT m.*,
                ma.nombre as marca_nombre,
                t.nombre as tipo_nombre,
                e.nombre as entalle_nombre,
                te.nombre as tela_nombre,
                h.nombre as hilo_nombre,
                he.nombre as hilo_especifico_nombre,
                rp.nombre as ruta_nombre,
                inv.nombre as pt_item_nombre,
                inv.codigo as pt_item_codigo,
                ln.nombre as linea_negocio_nombre,
                base_m.nombre as base_nombre,
                COALESCE(reg_count.total, 0) as registros_count,
                COALESCE(var_count.total, 0) as variantes_count
            FROM prod_modelos m
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_tipos t ON m.tipo_id = t.id
            LEFT JOIN prod_entalles e ON m.entalle_id = e.id
            LEFT JOIN prod_telas te ON m.tela_id = te.id
            LEFT JOIN prod_hilos h ON m.hilo_id = h.id
            LEFT JOIN prod_hilos_especificos he ON m.hilo_especifico_id = he.id
            LEFT JOIN prod_rutas_produccion rp ON m.ruta_produccion_id = rp.id
            LEFT JOIN prod_inventario inv ON m.pt_item_id = inv.id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON m.linea_negocio_id = ln.id
            LEFT JOIN prod_modelos base_m ON m.base_id = base_m.id
            LEFT JOIN LATERAL (
                SELECT COUNT(*) as total FROM prod_registros r WHERE r.modelo_id = m.id
            ) reg_count ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) as total FROM prod_modelos v WHERE v.base_id = m.id
            ) var_count ON true
            WHERE {where_clause}
            ORDER BY m.created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """, *params, limit, offset)
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['servicios_ids'] = parse_jsonb(d.get('servicios_ids'))
            result.append(d)

        # Resolve muestra names from external DB
        muestra_ids = [d['muestra_modelo_id'] for d in result if d.get('muestra_modelo_id')]
        if muestra_ids:
            try:
                m_pool = await get_muestra_pool()
                async with m_pool.acquire() as m_conn:
                    m_rows = await m_conn.fetch(
                        "SELECT m.id, m.nombre, h.nombre as hilo_nombre FROM muestra.modelos m LEFT JOIN muestra.hilos h ON h.id = m.hilo_id WHERE m.id = ANY($1::text[])",
                        muestra_ids
                    )
                    m_map = {str(r['id']): f"{r['nombre']} ({r['hilo_nombre'] or '-'})" for r in m_rows}
                    for d in result:
                        if d.get('muestra_modelo_id'):
                            d['muestra_nombre'] = m_map.get(d['muestra_modelo_id'], '')
            except Exception:
                pass

        return {"items": result, "total": total, "limit": limit, "offset": offset}

@router.get("/modelos-filtros")
async def get_modelos_filtros():
    """Retorna valores únicos de marca, tipo, entalle y tela para filtros de modelos."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        marcas = await conn.fetch("SELECT DISTINCT ma.nombre FROM prod_modelos m JOIN prod_marcas ma ON m.marca_id = ma.id WHERE ma.nombre IS NOT NULL ORDER BY ma.nombre")
        tipos = await conn.fetch("SELECT DISTINCT t.nombre FROM prod_modelos m JOIN prod_tipos t ON m.tipo_id = t.id WHERE t.nombre IS NOT NULL ORDER BY t.nombre")
        entalles = await conn.fetch("SELECT DISTINCT e.nombre FROM prod_modelos m JOIN prod_entalles e ON m.entalle_id = e.id WHERE e.nombre IS NOT NULL ORDER BY e.nombre")
        telas = await conn.fetch("SELECT DISTINCT te.nombre FROM prod_modelos m JOIN prod_telas te ON m.tela_id = te.id WHERE te.nombre IS NOT NULL ORDER BY te.nombre")
        return {
            "marcas": [r['nombre'] for r in marcas],
            "tipos": [r['nombre'] for r in tipos],
            "entalles": [r['nombre'] for r in entalles],
            "telas": [r['nombre'] for r in telas],
        }


@router.get("/modelos/{modelo_id}")
async def get_modelo_detalle(modelo_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT m.*, he.nombre as hilo_especifico_nombre, base_m.nombre as base_nombre
            FROM prod_modelos m
            LEFT JOIN prod_hilos_especificos he ON m.hilo_especifico_id = he.id
            LEFT JOIN prod_modelos base_m ON m.base_id = base_m.id
            WHERE m.id = $1
        """, modelo_id)
        if not row:
            raise HTTPException(status_code=404, detail="Modelo no encontrado")

        d = row_to_dict(row)
        return d


@router.get("/modelos/{modelo_id}/variantes")
async def get_modelo_variantes(modelo_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT m.*, he.nombre as hilo_especifico_nombre,
                COALESCE(reg_count.total, 0) as registros_count
            FROM prod_modelos m
            LEFT JOIN prod_hilos_especificos he ON m.hilo_especifico_id = he.id
            LEFT JOIN LATERAL (
                SELECT COUNT(*) as total FROM prod_registros r WHERE r.modelo_id = m.id
            ) reg_count ON true
            WHERE m.base_id = $1
            ORDER BY m.nombre
        """, modelo_id)
        return [row_to_dict(r) for r in rows]


# ==================== MODELO ↔ TALLAS (BOM) ====================

@router.get("/modelos/{modelo_id}/tallas")
async def get_modelo_tallas(modelo_id: str, activo: str = "true"):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT mt.*, tc.nombre as talla_nombre
            FROM prod_modelo_tallas mt
            LEFT JOIN prod_tallas_catalogo tc ON mt.talla_id = tc.id
            WHERE mt.modelo_id = $1
        """
        params = [modelo_id]
        if activo == "true":
            query += " AND mt.activo = true"
        elif activo == "false":
            query += " AND mt.activo = false"
        query += " ORDER BY mt.orden ASC, mt.created_at ASC"
        rows = await conn.fetch(query, *params)

    result = []
    for r in rows:
        d = row_to_dict(r)
        if isinstance(d.get('created_at'), datetime):
            d['created_at'] = d['created_at'].strftime('%d/%m/%Y %H:%M')
        if isinstance(d.get('updated_at'), datetime):
            d['updated_at'] = d['updated_at'].strftime('%d/%m/%Y %H:%M')
        result.append(d)
    return result


@router.post("/modelos/{modelo_id}/tallas")
async def add_modelo_talla(modelo_id: str, data: ModeloTallaCreate, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    # Validar talla activa en catálogo
    pool = await get_pool()
    async with pool.acquire() as conn:
        talla = await conn.fetchrow("SELECT * FROM prod_tallas_catalogo WHERE id=$1", data.talla_id)
        if not talla:
            raise HTTPException(status_code=404, detail="Talla no encontrada")
        # Nota: prod_tallas_catalogo no tiene campo 'activo' en este proyecto; todas las tallas del catálogo se consideran disponibles.


        # Validación duplicado activo (mensaje claro)
        exists = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_modelo_tallas WHERE modelo_id=$1 AND talla_id=$2 AND activo=true",
            modelo_id,
            data.talla_id,
        )
        if exists and int(exists) > 0:
            raise HTTPException(status_code=400, detail="La talla ya está agregada (activa) en este modelo")

        new_id = str(uuid4())
        await conn.execute(
            """
            INSERT INTO prod_modelo_tallas (id, modelo_id, talla_id, activo, orden, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            """,
            new_id,
            modelo_id,
            data.talla_id,
            bool(data.activo),
            int(data.orden),
        )

        row = await conn.fetchrow(
            """
            SELECT mt.*, tc.nombre as talla_nombre
            FROM prod_modelo_tallas mt
            LEFT JOIN prod_tallas_catalogo tc ON mt.talla_id = tc.id
            WHERE mt.id = $1
            """,
            new_id,
        )

    return row_to_dict(row)


@router.put("/modelos/{modelo_id}/tallas/{rel_id}")
async def update_modelo_talla(modelo_id: str, rel_id: str, data: ModeloTallaUpdate, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rel = await conn.fetchrow("SELECT * FROM prod_modelo_tallas WHERE id=$1 AND modelo_id=$2", rel_id, modelo_id)
        if not rel:
            raise HTTPException(status_code=404, detail="Relación modelo-talla no encontrada")

        orden = data.orden if data.orden is not None else rel.get('orden')
        activo_val = data.activo if data.activo is not None else rel.get('activo')

        # Si se intenta reactivar, validar no duplicado activo
        if bool(activo_val) and not bool(rel.get('activo')):
            exists = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_modelo_tallas WHERE modelo_id=$1 AND talla_id=$2 AND activo=true AND id<>$3",
                modelo_id,
                rel.get('talla_id'),
                rel_id,
            )
            if exists and int(exists) > 0:
                raise HTTPException(status_code=400, detail="Ya existe una talla activa duplicada para este modelo")

        await conn.execute(
            "UPDATE prod_modelo_tallas SET orden=$1, activo=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3",
            int(orden),
            bool(activo_val),
            rel_id,
        )

        row = await conn.fetchrow(
            """
            SELECT mt.*, tc.nombre as talla_nombre
            FROM prod_modelo_tallas mt
            LEFT JOIN prod_tallas_catalogo tc ON mt.talla_id = tc.id
            WHERE mt.id = $1
            """,
            rel_id,
        )

    return row_to_dict(row)


@router.delete("/modelos/{modelo_id}/tallas/{rel_id}")
async def delete_modelo_talla(modelo_id: str, rel_id: str, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rel = await conn.fetchrow("SELECT * FROM prod_modelo_tallas WHERE id=$1 AND modelo_id=$2", rel_id, modelo_id)
        if not rel:
            raise HTTPException(status_code=404, detail="Relación modelo-talla no encontrada")

        await conn.execute(
            "UPDATE prod_modelo_tallas SET activo=false, updated_at=CURRENT_TIMESTAMP WHERE id=$1",
            rel_id,
        )

    return {"message": "Talla desactivada"}


# ==================== BOM POR MODELO ====================

@router.get("/modelos/{modelo_id}/bom")
async def get_modelo_bom(modelo_id: str, activo: str = "true"):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT bl.*, i.nombre as inventario_nombre, i.codigo as inventario_codigo,
                   tc.nombre as talla_nombre
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON bl.talla_id = tc.id
            WHERE bl.modelo_id = $1
        """
        params = [modelo_id]
        if activo == "true":
            query += " AND bl.activo = true"
        elif activo == "false":
            query += " AND bl.activo = false"
        query += " ORDER BY bl.orden ASC, bl.created_at ASC"
        rows = await conn.fetch(query, *params)

    result = []
    for r in rows:
        d = row_to_dict(r)
        if isinstance(d.get('created_at'), datetime):
            d['created_at'] = d['created_at'].strftime('%d/%m/%Y %H:%M')
        if isinstance(d.get('updated_at'), datetime):
            d['updated_at'] = d['updated_at'].strftime('%d/%m/%Y %H:%M')
        result.append(d)
    return result


@router.post("/modelos/{modelo_id}/bom")
async def add_modelo_bom_linea(modelo_id: str, data: ModeloBomLineaCreate, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    # Validaciones
    if data.cantidad_base is None or float(data.cantidad_base) <= 0:
        raise HTTPException(status_code=400, detail="cantidad_base debe ser mayor a 0")


    pool = await get_pool()
    async with pool.acquire() as conn:
        # Inventario debe existir
        inv = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id=$1", data.inventario_id)
        if not inv:
            raise HTTPException(status_code=404, detail="Item de inventario no encontrado")

        # Si talla_id viene, debe pertenecer a tallas activas del modelo
        talla_id = data.talla_id
        if talla_id:
            exists_talla = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_modelo_tallas WHERE modelo_id=$1 AND talla_id=$2 AND activo=true",
                modelo_id,
                talla_id,
            )
            if not exists_talla or int(exists_talla) == 0:
                raise HTTPException(status_code=400, detail="La talla no pertenece a este modelo (o está inactiva)")

        # Duplicado activo exacto
        exists = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM prod_modelo_bom_linea
            WHERE modelo_id=$1
              AND inventario_id=$2
              AND talla_id IS NOT DISTINCT FROM $3
              AND activo=true
            """,
            modelo_id,
            data.inventario_id,
            talla_id,
        )
        if exists and int(exists) > 0:
            raise HTTPException(status_code=400, detail="Ya existe una línea activa duplicada para este item y talla")

        new_id = str(uuid4())
        await conn.execute(
            """
            INSERT INTO prod_modelo_bom_linea (id, modelo_id, inventario_id, talla_id, unidad_base, cantidad_base, orden, activo, created_at, updated_at)
            VALUES ($1,$2,$3,$4,'PRENDA',$5,$6,$7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            """,
            new_id,
            modelo_id,
            data.inventario_id,
            talla_id,
            float(data.cantidad_base),
            10,
            bool(data.activo),
        )

        row = await conn.fetchrow(
            """
            SELECT bl.*, i.nombre as inventario_nombre, i.codigo as inventario_codigo,
                   tc.nombre as talla_nombre
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON bl.talla_id = tc.id
            WHERE bl.id = $1
            """,
            new_id,
        )

    return row_to_dict(row)


@router.post("/modelos/{modelo_id}/bom/copiar-de/{source_modelo_id}")
async def copiar_bom_de_modelo(modelo_id: str, source_modelo_id: str, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    """Copia todas las líneas BOM activas de un modelo fuente al modelo destino."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        source_lines = await conn.fetch(
            "SELECT inventario_id, talla_id, unidad_base, cantidad_base, orden FROM prod_modelo_bom_linea WHERE modelo_id=$1 AND activo=true ORDER BY orden",
            source_modelo_id
        )
        if not source_lines:
            raise HTTPException(status_code=404, detail="El modelo fuente no tiene líneas BOM activas")

        count = 0
        for sl in source_lines:
            exists = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_modelo_bom_linea WHERE modelo_id=$1 AND inventario_id=$2 AND talla_id IS NOT DISTINCT FROM $3 AND activo=true",
                modelo_id, sl['inventario_id'], sl['talla_id']
            )
            if exists and int(exists) > 0:
                continue
            new_id = str(uuid4())
            await conn.execute(
                "INSERT INTO prod_modelo_bom_linea (id, modelo_id, inventario_id, talla_id, unidad_base, cantidad_base, orden, activo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
                new_id, modelo_id, sl['inventario_id'], sl['talla_id'], sl['unidad_base'], sl['cantidad_base'], sl['orden']
            )
            count += 1
        return {"message": f"Se copiaron {count} líneas BOM", "lineas_copiadas": count}




@router.put("/modelos/{modelo_id}/bom/reorder")
async def reorder_modelo_bom(modelo_id: str, request: ReorderRequest, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    """Reordena líneas BOM de un modelo."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        ids = [it.id for it in request.items]
        if not ids:
            return {"message": "Sin cambios", "items_updated": 0}

        rows = await conn.fetch(
            "SELECT id FROM prod_modelo_bom_linea WHERE modelo_id=$1 AND id = ANY($2::varchar[])",
            modelo_id,
            ids,
        )
        found = {r['id'] for r in rows}
        missing = [i for i in ids if i not in found]
        if missing:
            raise HTTPException(status_code=400, detail="Hay líneas BOM que no pertenecen a este modelo")

        for item in request.items:
            await conn.execute(
                "UPDATE prod_modelo_bom_linea SET orden=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2",
                int(item.orden),
                item.id,
            )

    return {"message": "Orden actualizado", "items_updated": len(request.items)}


@router.put("/modelos/{modelo_id}/bom/{linea_id}")
async def update_modelo_bom_linea(modelo_id: str, linea_id: str, data: ModeloBomLineaUpdate, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    pool = await get_pool()
    async with pool.acquire() as conn:
        bl = await conn.fetchrow("SELECT * FROM prod_modelo_bom_linea WHERE id=$1 AND modelo_id=$2", linea_id, modelo_id)
        if not bl:
            raise HTTPException(status_code=404, detail="Línea BOM no encontrada")

        inventario_id = data.inventario_id if data.inventario_id is not None else bl.get('inventario_id')
        talla_id = data.talla_id if data.talla_id is not None else bl.get('talla_id')
        cantidad_base = float(data.cantidad_base) if data.cantidad_base is not None else float(bl.get('cantidad_base'))
        activo_val = bool(data.activo) if data.activo is not None else bool(bl.get('activo'))

        if cantidad_base <= 0:
            raise HTTPException(status_code=400, detail="cantidad_base debe ser mayor a 0")

        # Validar inventario existe
        inv = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id=$1", inventario_id)
        if not inv:
            raise HTTPException(status_code=404, detail="Item de inventario no encontrado")

        # Validar talla pertenece al modelo si aplica
        if talla_id:
            exists_talla = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_modelo_tallas WHERE modelo_id=$1 AND talla_id=$2 AND activo=true",
                modelo_id,
                talla_id,
            )
            if not exists_talla or int(exists_talla) == 0:
                raise HTTPException(status_code=400, detail="La talla no pertenece a este modelo (o está inactiva)")

        # Duplicado activo exacto (si activo=true)
        if activo_val:
            exists = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM prod_modelo_bom_linea
                WHERE modelo_id=$1
                  AND inventario_id=$2
                  AND talla_id IS NOT DISTINCT FROM $3
                  AND activo=true
                  AND id<>$4
                """,
                modelo_id,
                inventario_id,
                talla_id,
                linea_id,
            )
            if exists and int(exists) > 0:
                raise HTTPException(status_code=400, detail="Ya existe una línea activa duplicada para este item y talla")

        await conn.execute(
            """
            UPDATE prod_modelo_bom_linea
            SET inventario_id=$1, talla_id=$2, cantidad_base=$3, activo=$4, updated_at=CURRENT_TIMESTAMP
            WHERE id=$5
            """,
            inventario_id,
            talla_id,
            cantidad_base,
            activo_val,
            linea_id,
        )

        row = await conn.fetchrow(
            """
            SELECT bl.*, i.nombre as inventario_nombre, i.codigo as inventario_codigo,
                   tc.nombre as talla_nombre
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON bl.talla_id = tc.id
            WHERE bl.id = $1
            """,
            linea_id,
        )

    return row_to_dict(row)


@router.delete("/modelos/{modelo_id}/bom/{linea_id}")
async def delete_modelo_bom_linea(modelo_id: str, linea_id: str, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    pool = await get_pool()
    async with pool.acquire() as conn:
        bl = await conn.fetchrow("SELECT * FROM prod_modelo_bom_linea WHERE id=$1 AND modelo_id=$2", linea_id, modelo_id)
        if not bl:
            raise HTTPException(status_code=404, detail="Línea BOM no encontrada")
        
        await conn.execute("UPDATE prod_modelo_bom_linea SET activo=false, updated_at=CURRENT_TIMESTAMP WHERE id=$1", linea_id)
    
    return {"message": "Línea desactivada", "action": "deactivated"}


@router.delete("/modelos/{modelo_id}/bom/{linea_id}/hard")
async def hard_delete_modelo_bom_linea(modelo_id: str, linea_id: str, current_user: dict = Depends(require_permission('modelos', 'editar'))):
    """Elimina físicamente la línea BOM solo si no está vinculada en producción.

    Por ahora la única vinculación real existente en el sistema es la propia tabla BOM.
    En fases futuras, cuando exista Registro/OP, aquí se validará contra esas tablas.

    Comportamiento:
    - Si detecta uso/vinculación: desactiva (activo=false)
    - Si no: borra físicamente
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        bl = await conn.fetchrow(
            "SELECT * FROM prod_modelo_bom_linea WHERE id=$1 AND modelo_id=$2",
            linea_id,
            modelo_id,
        )
        if not bl:
            raise HTTPException(status_code=404, detail="Línea BOM no encontrada")

        # Placeholder de validación de vínculo. En esta fase no existe Registro/OP.
        vinculada = False

        if vinculada:
            await conn.execute(
                "UPDATE prod_modelo_bom_linea SET activo=false, updated_at=CURRENT_TIMESTAMP WHERE id=$1",
                linea_id,
            )
            return {"action": "deactivated", "message": "Línea vinculada: se desactivó"}

        await conn.execute("DELETE FROM prod_modelo_bom_linea WHERE id=$1", linea_id)
        return {"action": "deleted", "message": "Línea eliminada"}


@router.post("/modelos")
async def create_modelo(input: ModeloCreate, _u=Depends(get_current_user)):
    modelo = Modelo(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        servicios_json = json.dumps(modelo.servicios_ids)
        pt_item_id = modelo.pt_item_id or None
        base_id = modelo.base_id or None
        hilo_especifico_id = modelo.hilo_especifico_id or None
        muestra_modelo_id = modelo.muestra_modelo_id or None
        muestra_base_id = modelo.muestra_base_id or None
        await conn.execute(
            """INSERT INTO prod_modelos (id, nombre, marca_id, tipo_id, entalle_id, tela_id, hilo_id, 
               ruta_produccion_id, servicios_ids, pt_item_id, linea_negocio_id, base_id, hilo_especifico_id, muestra_modelo_id, muestra_base_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)""",
            modelo.id, modelo.nombre, modelo.marca_id, modelo.tipo_id, modelo.entalle_id, modelo.tela_id,
            modelo.hilo_id, modelo.ruta_produccion_id, servicios_json, pt_item_id, modelo.linea_negocio_id, base_id, hilo_especifico_id, muestra_modelo_id, muestra_base_id, modelo.created_at.replace(tzinfo=None)
        )
    return modelo

@router.put("/modelos/{modelo_id}")
async def update_modelo(modelo_id: str, input: ModeloCreate, _u=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_modelos WHERE id = $1", modelo_id)
        if not result:
            raise HTTPException(status_code=404, detail="Modelo no encontrado")
        servicios_json = json.dumps(input.servicios_ids)
        pt_item_id = input.pt_item_id or None
        base_id = input.base_id or None
        hilo_especifico_id = input.hilo_especifico_id or None
        muestra_modelo_id = input.muestra_modelo_id or None
        muestra_base_id = input.muestra_base_id or None
        await conn.execute(
            """UPDATE prod_modelos SET nombre=$1, marca_id=$2, tipo_id=$3, entalle_id=$4, tela_id=$5, hilo_id=$6,
               ruta_produccion_id=$7, servicios_ids=$8, pt_item_id=$9, linea_negocio_id=$10, base_id=$12, hilo_especifico_id=$13, muestra_modelo_id=$14, muestra_base_id=$15 WHERE id=$11""",
            input.nombre, input.marca_id, input.tipo_id, input.entalle_id, input.tela_id, input.hilo_id,
            input.ruta_produccion_id, servicios_json, pt_item_id, input.linea_negocio_id, modelo_id, base_id, hilo_especifico_id, muestra_modelo_id, muestra_base_id
        )
        return {**row_to_dict(result), **input.model_dump()}

@router.delete("/modelos/{modelo_id}")
async def delete_modelo(modelo_id: str, _u=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_modelos WHERE id = $1", modelo_id)
        return {"message": "Modelo eliminado"}

@router.post("/modelos/{modelo_id}/crear-pt")
async def crear_pt_para_modelo(modelo_id: str, _u=Depends(get_current_user)):
    """Auto-crea un Artículo PT para el modelo y lo vincula"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        modelo = await conn.fetchrow("SELECT * FROM prod_modelos WHERE id = $1", modelo_id)
        if not modelo:
            raise HTTPException(status_code=404, detail="Modelo no encontrado")
        
        if modelo['pt_item_id']:
            existing = await conn.fetchrow("SELECT id, nombre FROM prod_inventario WHERE id = $1", modelo['pt_item_id'])
            if existing:
                return {"message": "El modelo ya tiene un PT vinculado", "pt_item_id": modelo['pt_item_id'], "pt_item_nombre": existing['nombre']}
        
        # Generate unique code PT-XXX
        max_code = await conn.fetchval("SELECT codigo FROM prod_inventario WHERE tipo_item = 'PT' ORDER BY codigo DESC LIMIT 1")
        if max_code and max_code.startswith('PT-'):
            try:
                num = int(max_code.replace('PT-', '')) + 1
            except ValueError:
                num = 1
        else:
            num = 1
        nuevo_codigo = f"PT-{num:03d}"
        
        pt_id = str(uuid.uuid4())
        nombre_pt = modelo['nombre']
        
        await conn.execute("""
            INSERT INTO prod_inventario (id, codigo, nombre, tipo_item, categoria, unidad_medida, empresa_id, stock_actual, activo, linea_negocio_id)
            VALUES ($1, $2, $3, 'PT', 'PT', 'unidad', 7, 0, true, $4)
        """, pt_id, nuevo_codigo, nombre_pt, modelo.get('linea_negocio_id'))
        
        await conn.execute("UPDATE prod_modelos SET pt_item_id = $1 WHERE id = $2", pt_id, modelo_id)
        
        return {"pt_item_id": pt_id, "pt_item_codigo": nuevo_codigo, "pt_item_nombre": nombre_pt}

@router.get("/items-pt")
async def get_items_pt():
    """Lista solo items de tipo PT para selectores"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, codigo, nombre FROM prod_inventario WHERE tipo_item = 'PT' AND activo = true ORDER BY nombre")
        return [row_to_dict(r) for r in rows]


# ==================== ENDPOINTS REGISTROS ====================

