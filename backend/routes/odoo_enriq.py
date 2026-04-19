"""
Integración Odoo — Enriquecimiento de productos.

Trae productos del schema `odoo` (solo SELECT) y los clasifica con los
catálogos del schema `produccion`. La tabla puente `prod_odoo_productos_enriq`
guarda los FKs a catálogos + snapshot mínimo del producto Odoo.

Reglas:
  - Sync trae solo templates activos con stock > 0 (acota la primera fase)
  - Auto-matching por marca (exact case-insensitive), tipo (primera palabra),
    tela general (keyword en tipo_texto), entalle (keyword en nombre)
  - Auto-exclusión: tipo vacío/"Otros" (tipo_invalido) o sin marca (sin_marca)
  - Clasificación manual se respeta: re-sync NO pisa FKs si classified_at ≠ NULL
"""
import json
import time
import uuid
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from db import get_pool
from helpers import row_to_dict
from auth_utils import get_current_user
from models import (
    OdooProductoClasificarInput, OdooProductoCostoInput,
    ColorMappingInput, ColorMappingDeleteInput, ColorCrearRapidoInput,
)

router = APIRouter(prefix="/api/odoo-enriq")


# ─── Utilidades de matching ──────────────────────────────────────────

TIPO_MAP = {
    'pantalon': 'Pantalon', 'pantalones': 'Pantalon',
    'polo': 'Polo', 'polos': 'Polo',
    'short': 'Short', 'shorts': 'Short',
    'casaca': 'Casaca', 'casacas': 'Casaca',
}

TIPOS_INVALIDOS = {'', 'otros', 'otro'}


def _primera_palabra(txt: str) -> str:
    if not txt:
        return ''
    return txt.strip().lower().split()[0] if txt.strip() else ''


async def _match_marca(conn, marca_texto: str, empresa_id: int) -> Optional[str]:
    if not marca_texto:
        return None
    return await conn.fetchval(
        """SELECT id FROM prod_marcas
           WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
           LIMIT 1""",
        marca_texto.strip(),
    )


async def _match_tipo(conn, tipo_texto: str, empresa_id: int) -> Optional[str]:
    if not tipo_texto:
        return None
    primera = _primera_palabra(tipo_texto)
    nombre_canonico = TIPO_MAP.get(primera)
    if not nombre_canonico:
        return None
    return await conn.fetchval(
        "SELECT id FROM prod_tipos WHERE nombre = $1 LIMIT 1",
        nombre_canonico,
    )


async def _match_tela_general(conn, tipo_texto: str, empresa_id: int) -> Optional[str]:
    if not tipo_texto:
        return None
    low = tipo_texto.lower()
    for keyword in ('denim', 'drill', 'jersey'):
        if keyword in low:
            return await conn.fetchval(
                "SELECT id FROM prod_telas_general WHERE LOWER(nombre) = $1 LIMIT 1",
                keyword,
            )
    return None


async def _match_entalle(conn, nombre: str, empresa_id: int, entalles_cache: list,
                          entalle_texto: Optional[str] = None) -> Optional[str]:
    """Match de entalle: primero exacto contra el campo 'entalle' de Odoo,
    luego fallback a keyword dentro del nombre del producto."""
    # 1. Match exacto contra campo entalle de Odoo (más confiable)
    if entalle_texto:
        target = entalle_texto.strip().lower()
        for ent in entalles_cache:
            if ent['nombre'].strip().lower() == target:
                return ent['id']
    # 2. Fallback: buscar nombre de entalle dentro del nombre del producto
    if nombre:
        upper = nombre.upper()
        for ent in entalles_cache:
            if ent['nombre'].upper() in upper:
                return ent['id']
    return None


async def _match_tela(conn, tela_texto: str, entalle_id: Optional[str], empresa_id: int) -> Optional[str]:
    """Match exacto case-insensitive contra prod_telas.nombre, filtrando por entalle si existe."""
    if not tela_texto:
        return None
    target = tela_texto.strip().lower()
    # Intentar match directo (ignorando filtro de entalle)
    return await conn.fetchval(
        """SELECT id FROM prod_telas
           WHERE LOWER(TRIM(nombre)) = $1 LIMIT 1""",
        target,
    )


async def _match_hilo(conn, hilo_texto: str, empresa_id: int) -> Optional[str]:
    """Match exacto case-insensitive contra prod_hilos.nombre (hilo general)."""
    if not hilo_texto:
        return None
    return await conn.fetchval(
        """SELECT id FROM prod_hilos
           WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1""",
        hilo_texto.strip(),
    )


def _build_order_by(sort_by: str, sort_dir: str) -> str:
    """Genera ORDER BY seguro (whitelist) — valores ya validados por regex del endpoint."""
    direction = 'DESC' if sort_dir == 'desc' else 'ASC'
    if sort_by == 'stock':
        return f"p.odoo_stock_actual {direction} NULLS LAST, p.odoo_nombre ASC"
    if sort_by == 'nombre':
        return f"p.odoo_nombre {direction}"
    if sort_by == 'estado':
        return f"p.estado {direction}, p.odoo_nombre ASC"
    # default
    return "p.estado ASC, p.odoo_nombre ASC"


def _recalcular_estado(vals: dict, tipo_nombre: Optional[str]) -> tuple:
    """Devuelve (estado, campos_pendientes) según los FKs actuales.

    Reglas de requeridos:
      - Siempre: marca_id, tipo_id, genero_id
      - Solo si tipo == 'Polo': cuello_id
      - Solo si tipo in ('Pantalon', 'Short'): lavado_id
    """
    required = ['marca_id', 'tipo_id', 'genero_id']
    if tipo_nombre == 'Polo':
        required.append('cuello_id')
    if tipo_nombre in ('Pantalon', 'Short'):
        required.append('lavado_id')
    pendientes = [k for k in required if not vals.get(k)]
    if not pendientes:
        return ('completo', [])
    if any(vals.get(k) for k in ('marca_id', 'tipo_id', 'tela_general_id', 'entalle_id')):
        return ('parcial', pendientes)
    return ('pendiente', pendientes)


# ─── Sync ─────────────────────────────────────────────────────────────

@router.post("/sync")
async def sync_odoo_productos(current_user: dict = Depends(get_current_user)):
    """
    Sync con auto-matching. Idempotente.
    Trae templates activos con stock > 0 desde schema odoo.
    """
    t0 = time.time()
    empresa_id = current_user.get("empresa_id") or 7
    pool = await get_pool()

    async with pool.acquire() as conn:
        # 1. Traer productos desde Odoo (agrupando stock de variantes)
        productos_odoo = await conn.fetch("""
            SELECT
                pt.odoo_id AS template_id,
                pt.name    AS nombre,
                pt.marca   AS marca_texto,
                pt.tipo    AS tipo_texto,
                pt.entalle AS entalle_texto,
                pt.tela    AS tela_texto,
                pt.hilo    AS hilo_texto,
                pt.active,
                COALESCE(SUM(s.available_qty), 0) AS stock
            FROM odoo.product_template pt
            LEFT JOIN odoo.product_product pp ON pp.product_tmpl_id = pt.odoo_id
            LEFT JOIN odoo.v_stock_by_product s ON s.product_id = pp.odoo_id
            WHERE pt.active = TRUE
            GROUP BY pt.odoo_id, pt.name, pt.marca, pt.tipo, pt.entalle, pt.tela, pt.hilo, pt.active
            HAVING COALESCE(SUM(s.available_qty), 0) > 0
        """)

        # 2. Cache de entalles ordenados por largo desc
        entalles_cache = await conn.fetch(
            "SELECT id, nombre FROM prod_entalles ORDER BY LENGTH(nombre) DESC"
        )

        nuevos = 0
        actualizados = 0
        excluidos_por_motivo = {'tipo_invalido': 0, 'sin_marca': 0}

        for p in productos_odoo:
            template_id = p['template_id']
            nombre = p['nombre']
            marca_texto = p['marca_texto']
            tipo_texto = p['tipo_texto']
            entalle_texto = p['entalle_texto']
            tela_texto = p['tela_texto']
            hilo_texto = p['hilo_texto']
            active = p['active']
            stock = float(p['stock'] or 0)

            # Revisar si existe y si fue clasificado manualmente
            existente = await conn.fetchrow(
                """SELECT id, classified_at FROM prod_odoo_productos_enriq
                   WHERE odoo_template_id = $1 AND empresa_id = $2""",
                template_id, empresa_id,
            )
            clasificado_manual = existente and existente['classified_at'] is not None

            # Auto-matching
            marca_id = await _match_marca(conn, marca_texto, empresa_id)
            tipo_id = await _match_tipo(conn, tipo_texto, empresa_id)
            tela_general_id = await _match_tela_general(conn, tipo_texto, empresa_id)
            entalle_id = await _match_entalle(conn, nombre, empresa_id, entalles_cache, entalle_texto)
            tela_id = await _match_tela(conn, tela_texto, entalle_id, empresa_id)
            hilo_id = await _match_hilo(conn, hilo_texto, empresa_id)

            # Determinar estado y exclusión
            tipo_norm = (tipo_texto or '').strip().lower()
            estado = 'pendiente'
            excluido_motivo = None
            campos_pendientes: List[str] = []

            if not tipo_id and tipo_norm in TIPOS_INVALIDOS:
                estado = 'excluido'
                excluido_motivo = 'tipo_invalido'
                excluidos_por_motivo['tipo_invalido'] += 1
            elif not marca_id and not (marca_texto or '').strip():
                estado = 'excluido'
                excluido_motivo = 'sin_marca'
                excluidos_por_motivo['sin_marca'] += 1
            else:
                # tipo_nombre para la regla de Polo
                tipo_nombre = None
                if tipo_id:
                    tipo_nombre = await conn.fetchval(
                        "SELECT nombre FROM prod_tipos WHERE id = $1", tipo_id
                    )
                vals = {
                    'marca_id': marca_id, 'tipo_id': tipo_id,
                    'tela_general_id': tela_general_id, 'entalle_id': entalle_id,
                    'genero_id': None, 'cuello_id': None,
                }
                estado, campos_pendientes = _recalcular_estado(vals, tipo_nombre)

            if existente:
                if clasificado_manual:
                    # Solo actualizar snapshot + last_sync; no tocar FKs ni estado
                    await conn.execute("""
                        UPDATE prod_odoo_productos_enriq SET
                            odoo_nombre = $1,
                            odoo_marca_texto = $2,
                            odoo_tipo_texto = $3,
                            odoo_entalle_texto = $4,
                            odoo_tela_texto = $5,
                            odoo_hilo_texto = $6,
                            odoo_active = $7,
                            odoo_stock_actual = $8,
                            last_sync = NOW(),
                            updated_at = NOW()
                        WHERE id = $9
                    """, nombre, marca_texto, tipo_texto,
                         entalle_texto, tela_texto, hilo_texto,
                         active, stock, existente['id'])
                else:
                    # Actualizar todo (FKs auto-matched + snapshot)
                    await conn.execute("""
                        UPDATE prod_odoo_productos_enriq SET
                            odoo_nombre = $1,
                            odoo_marca_texto = $2,
                            odoo_tipo_texto = $3,
                            odoo_entalle_texto = $4,
                            odoo_tela_texto = $5,
                            odoo_hilo_texto = $6,
                            odoo_active = $7,
                            odoo_stock_actual = $8,
                            marca_id = $9,
                            tipo_id = $10,
                            tela_general_id = $11,
                            tela_id = $12,
                            entalle_id = $13,
                            hilo_id = $14,
                            estado = $15,
                            excluido_motivo = $16,
                            campos_pendientes = $17::jsonb,
                            last_sync = NOW(),
                            updated_at = NOW()
                        WHERE id = $18
                    """, nombre, marca_texto, tipo_texto,
                         entalle_texto, tela_texto, hilo_texto,
                         active, stock,
                         marca_id, tipo_id, tela_general_id, tela_id, entalle_id, hilo_id,
                         estado, excluido_motivo, json.dumps(campos_pendientes),
                         existente['id'])
                actualizados += 1
            else:
                new_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_odoo_productos_enriq (
                        id, odoo_template_id, empresa_id,
                        odoo_nombre, odoo_marca_texto, odoo_tipo_texto,
                        odoo_entalle_texto, odoo_tela_texto, odoo_hilo_texto,
                        odoo_active, odoo_stock_actual,
                        marca_id, tipo_id, tela_general_id, tela_id, entalle_id, hilo_id,
                        estado, excluido_motivo, campos_pendientes, last_sync
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, NOW())
                """, new_id, template_id, empresa_id,
                     nombre, marca_texto, tipo_texto,
                     entalle_texto, tela_texto, hilo_texto,
                     active, stock,
                     marca_id, tipo_id, tela_general_id, tela_id, entalle_id, hilo_id,
                     estado, excluido_motivo, json.dumps(campos_pendientes))
                nuevos += 1

        # Estados actuales tras sync
        estados_actuales_rows = await conn.fetch(
            """SELECT estado, COUNT(*) as cnt
               FROM prod_odoo_productos_enriq
               WHERE empresa_id = $1
               GROUP BY estado""",
            empresa_id,
        )
        estados_actuales = {r['estado']: r['cnt'] for r in estados_actuales_rows}

        duracion = round(time.time() - t0, 2)

        return {
            "total_odoo": len(productos_odoo),
            "nuevos": nuevos,
            "actualizados": actualizados,
            "excluidos": excluidos_por_motivo,
            "estados_actuales": estados_actuales,
            "duracion_segundos": duracion,
        }


# ─── Stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    empresa_id = current_user.get("empresa_id") or 7
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT estado, COUNT(*) as cnt
               FROM prod_odoo_productos_enriq
               WHERE empresa_id = $1
               GROUP BY estado""",
            empresa_id,
        )
        by_estado = {r['estado']: r['cnt'] for r in rows}
        total = sum(by_estado.values())
        last_sync = await conn.fetchval(
            """SELECT MAX(last_sync) FROM prod_odoo_productos_enriq
               WHERE empresa_id = $1""",
            empresa_id,
        )
        return {
            "total": total,
            "pendiente": by_estado.get('pendiente', 0),
            "parcial": by_estado.get('parcial', 0),
            "completo": by_estado.get('completo', 0),
            "excluido": by_estado.get('excluido', 0),
            "last_sync": last_sync.isoformat() if last_sync else None,
        }


# ─── List + search ───────────────────────────────────────────────────

@router.get("")
async def list_productos(
    estado: Optional[str] = None,
    marca_id: Optional[str] = None,
    tipo_id: Optional[str] = None,
    tela_general_id: Optional[str] = None,
    q: Optional[str] = None,
    sort_by: Optional[str] = Query('default', pattern='^(default|stock|nombre|estado)$'),
    sort_dir: Optional[str] = Query('asc', pattern='^(asc|desc)$'),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    empresa_id = current_user.get("empresa_id") or 7
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["p.empresa_id = $1"]
        params: list = [empresa_id]
        idx = 2
        if estado and estado != 'todos':
            conditions.append(f"p.estado = ${idx}"); params.append(estado); idx += 1
        if marca_id:
            conditions.append(f"p.marca_id = ${idx}"); params.append(marca_id); idx += 1
        if tipo_id:
            conditions.append(f"p.tipo_id = ${idx}"); params.append(tipo_id); idx += 1
        if tela_general_id:
            conditions.append(f"p.tela_general_id = ${idx}"); params.append(tela_general_id); idx += 1
        if q and q.strip():
            conditions.append(
                f"(LOWER(p.odoo_nombre) LIKE ${idx} OR LOWER(p.odoo_default_code) LIKE ${idx}"
                f" OR LOWER(p.odoo_marca_texto) LIKE ${idx} OR LOWER(p.odoo_tipo_texto) LIKE ${idx})"
            )
            params.append(f"%{q.strip().lower()}%")
            idx += 1
        where = " AND ".join(conditions)

        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM prod_odoo_productos_enriq p WHERE {where}",
            *params,
        )
        offset = (page - 1) * limit
        rows = await conn.fetch(f"""
            SELECT p.*,
                   ma.nombre AS marca_nombre,
                   t.nombre  AS tipo_nombre,
                   tg.nombre AS tela_general_nombre,
                   te.nombre AS tela_nombre,
                   e.nombre  AS entalle_nombre,
                   g.nombre  AS genero_nombre,
                   c.nombre  AS cuello_nombre,
                   d.nombre  AS detalle_nombre,
                   l.nombre  AS lavado_nombre,
                   h.nombre  AS hilo_nombre,
                   cc.nombre AS categoria_color_nombre
            FROM prod_odoo_productos_enriq p
            LEFT JOIN prod_marcas ma ON p.marca_id = ma.id
            LEFT JOIN prod_tipos t   ON p.tipo_id = t.id
            LEFT JOIN prod_telas_general tg ON p.tela_general_id = tg.id
            LEFT JOIN prod_telas te  ON p.tela_id = te.id
            LEFT JOIN prod_entalles e ON p.entalle_id = e.id
            LEFT JOIN prod_generos g  ON p.genero_id = g.id
            LEFT JOIN prod_cuellos c  ON p.cuello_id = c.id
            LEFT JOIN prod_detalles d ON p.detalle_id = d.id
            LEFT JOIN prod_lavados l  ON p.lavado_id = l.id
            LEFT JOIN prod_hilos h    ON p.hilo_id = h.id
            LEFT JOIN prod_colores_generales cc ON p.categoria_color_id = cc.id
            WHERE {where}
            ORDER BY {_build_order_by(sort_by, sort_dir)}
            LIMIT {limit} OFFSET {offset}
        """, *params)
        items = [row_to_dict(r) for r in rows]
        return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/{enriq_id}")
async def get_producto(enriq_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT p.*,
                   ma.nombre AS marca_nombre,
                   t.nombre  AS tipo_nombre,
                   tg.nombre AS tela_general_nombre,
                   te.nombre AS tela_nombre,
                   e.nombre  AS entalle_nombre,
                   g.nombre  AS genero_nombre,
                   c.nombre  AS cuello_nombre,
                   d.nombre  AS detalle_nombre,
                   l.nombre  AS lavado_nombre,
                   h.nombre  AS hilo_nombre,
                   cc.nombre AS categoria_color_nombre
            FROM prod_odoo_productos_enriq p
            LEFT JOIN prod_marcas ma ON p.marca_id = ma.id
            LEFT JOIN prod_tipos t   ON p.tipo_id = t.id
            LEFT JOIN prod_telas_general tg ON p.tela_general_id = tg.id
            LEFT JOIN prod_telas te  ON p.tela_id = te.id
            LEFT JOIN prod_entalles e ON p.entalle_id = e.id
            LEFT JOIN prod_generos g  ON p.genero_id = g.id
            LEFT JOIN prod_cuellos c  ON p.cuello_id = c.id
            LEFT JOIN prod_detalles d ON p.detalle_id = d.id
            LEFT JOIN prod_lavados l  ON p.lavado_id = l.id
            LEFT JOIN prod_hilos h    ON p.hilo_id = h.id
            LEFT JOIN prod_colores_generales cc ON p.categoria_color_id = cc.id
            WHERE p.id = $1
        """, enriq_id)
        if not row:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return row_to_dict(row)


# ─── Clasificar ──────────────────────────────────────────────────────

@router.patch("/{enriq_id}/clasificar")
async def clasificar_producto(
    enriq_id: str,
    body: OdooProductoClasificarInput,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        actual = await conn.fetchrow(
            "SELECT * FROM prod_odoo_productos_enriq WHERE id = $1", enriq_id
        )
        if not actual:
            raise HTTPException(status_code=404, detail="Producto no encontrado")

        if body.excluir:
            await conn.execute("""
                UPDATE prod_odoo_productos_enriq SET
                    estado = 'excluido',
                    excluido_motivo = 'manual',
                    notas = COALESCE($1, notas),
                    classified_by = $2,
                    classified_at = NOW(),
                    updated_at = NOW()
                WHERE id = $3
            """, body.notas, current_user.get('username'), enriq_id)
            return {"message": "Producto excluido", "estado": "excluido"}

        # Recalcular estado con los nuevos valores
        tipo_nombre = None
        if body.tipo_id:
            tipo_nombre = await conn.fetchval(
                "SELECT nombre FROM prod_tipos WHERE id = $1", body.tipo_id
            )
        vals = {
            'marca_id': body.marca_id,
            'tipo_id': body.tipo_id,
            'tela_general_id': body.tela_general_id,
            'tela_id': body.tela_id,
            'entalle_id': body.entalle_id,
            'genero_id': body.genero_id,
            'cuello_id': body.cuello_id,
        }
        nuevo_estado, pendientes = _recalcular_estado(vals, tipo_nombre)

        await conn.execute("""
            UPDATE prod_odoo_productos_enriq SET
                marca_id = $1,
                tipo_id = $2,
                tela_general_id = $3,
                tela_id = $4,
                entalle_id = $5,
                genero_id = $6,
                cuello_id = $7,
                detalle_id = $8,
                lavado_id = $9,
                hilo_id = $10,
                categoria_color_id = $11,
                notas = $12,
                estado = $13,
                excluido_motivo = NULL,
                campos_pendientes = $14::jsonb,
                classified_by = $15,
                classified_at = NOW(),
                updated_at = NOW()
            WHERE id = $16
        """, body.marca_id, body.tipo_id, body.tela_general_id, body.tela_id,
             body.entalle_id, body.genero_id, body.cuello_id, body.detalle_id,
             body.lavado_id, body.hilo_id, body.categoria_color_id, body.notas,
             nuevo_estado, json.dumps(pendientes),
             current_user.get('username'), enriq_id)
        return {"message": "Producto clasificado", "estado": nuevo_estado, "campos_pendientes": pendientes}


@router.post("/{enriq_id}/excluir")
async def excluir_producto(enriq_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id FROM prod_odoo_productos_enriq WHERE id = $1", enriq_id)
        if not row:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        await conn.execute("""
            UPDATE prod_odoo_productos_enriq SET
                estado = 'excluido',
                excluido_motivo = 'manual',
                classified_by = $1,
                classified_at = NOW(),
                updated_at = NOW()
            WHERE id = $2
        """, current_user.get('username'), enriq_id)
        return {"message": "Producto excluido", "estado": "excluido"}


@router.post("/{enriq_id}/incluir")
async def incluir_producto(enriq_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM prod_odoo_productos_enriq WHERE id = $1", enriq_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        # Recalcular estado a partir de los FKs actuales
        tipo_nombre = None
        if row['tipo_id']:
            tipo_nombre = await conn.fetchval(
                "SELECT nombre FROM prod_tipos WHERE id = $1", row['tipo_id']
            )
        vals = {
            'marca_id': row['marca_id'], 'tipo_id': row['tipo_id'],
            'tela_general_id': row['tela_general_id'], 'tela_id': row['tela_id'],
            'entalle_id': row['entalle_id'], 'genero_id': row['genero_id'],
            'cuello_id': row['cuello_id'],
        }
        nuevo_estado, pendientes = _recalcular_estado(vals, tipo_nombre)
        await conn.execute("""
            UPDATE prod_odoo_productos_enriq SET
                estado = $1,
                excluido_motivo = NULL,
                campos_pendientes = $2::jsonb,
                updated_at = NOW()
            WHERE id = $3
        """, nuevo_estado, json.dumps(pendientes), enriq_id)
        return {"message": "Producto incluido", "estado": nuevo_estado, "campos_pendientes": pendientes}


# ─── Costo manual ────────────────────────────────────────────────────

@router.patch("/{enriq_id}/costo")
async def actualizar_costo(
    enriq_id: str,
    body: OdooProductoCostoInput,
    current_user: dict = Depends(get_current_user),
):
    """Actualiza el costo manual de un producto Odoo.

    Usado para productos antiguos que no tienen costo en Odoo.
    Los productos creados desde el módulo Producción traen costo automático.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        existe = await conn.fetchval(
            "SELECT id FROM prod_odoo_productos_enriq WHERE id = $1", enriq_id
        )
        if not existe:
            raise HTTPException(status_code=404, detail="Producto no encontrado")

        costo = body.costo_manual
        if costo is not None and costo < 0:
            raise HTTPException(status_code=400, detail="El costo no puede ser negativo")

        await conn.execute("""
            UPDATE prod_odoo_productos_enriq SET
                costo_manual = $1,
                costo_updated_at = NOW(),
                costo_updated_by = $2,
                updated_at = NOW()
            WHERE id = $3
        """, costo, current_user.get('username'), enriq_id)

        return {"ok": True, "costo_manual": costo}


# ─── Mapeo de colores por variante (product_id) ──────────────────────

@router.get("/{template_id}/variantes")
async def get_variantes(template_id: int, current_user: dict = Depends(get_current_user)):
    """Devuelve las variantes de un template agrupadas por color Odoo,
    con stock / ventas / tallas / estado de mapeo."""
    empresa_id = current_user.get("empresa_id") or 7
    pool = await get_pool()
    async with pool.acquire() as conn:
        variantes = await conn.fetch("""
            SELECT product_product_id AS product_id, talla, color
            FROM odoo.v_product_variant_flat
            WHERE product_tmpl_id = $1
        """, template_id)

        if not variantes:
            return {"template_id": template_id, "total_variantes": 0, "total_colores_odoo": 0,
                    "colores_mapeados": 0, "stock_total": 0, "colores": []}

        product_ids = [v['product_id'] for v in variantes]

        stock_rows = await conn.fetch("""
            SELECT product_id, COALESCE(SUM(qty - COALESCE(reserved_qty, 0)), 0) AS stock
            FROM odoo.stock_quant
            WHERE product_id = ANY($1::int[])
            GROUP BY product_id
        """, product_ids)
        stock_map = {int(r['product_id']): float(r['stock']) for r in stock_rows}

        ventas_rows = await conn.fetch("""
            SELECT product_id, COALESCE(SUM(qty), 0) AS unidades,
                   COUNT(DISTINCT order_id) AS tickets
            FROM odoo.v_pos_line_full
            WHERE product_id = ANY($1::int[])
              AND COALESCE(is_cancelled, false) = false
            GROUP BY product_id
        """, product_ids)
        ventas_map = {int(r['product_id']): (float(r['unidades']), int(r['tickets'])) for r in ventas_rows}

        mapeos_rows = await conn.fetch("""
            SELECT m.odoo_product_id, m.color_id,
                   c.nombre AS color_nombre,
                   cg.id    AS color_general_id,
                   cg.nombre AS color_general_nombre
            FROM prod_odoo_color_mapping m
            LEFT JOIN prod_colores_catalogo c ON c.id = m.color_id
            LEFT JOIN prod_colores_generales cg ON cg.id = c.color_general_id
            WHERE m.empresa_id = $1 AND m.odoo_product_id = ANY($2::int[])
        """, empresa_id, product_ids)
        mapeos_map = {
            int(r['odoo_product_id']): {
                'color_id': r['color_id'], 'color_nombre': r['color_nombre'],
                'color_general_id': r['color_general_id'],
                'color_general_nombre': r['color_general_nombre'],
            }
            for r in mapeos_rows
        }

        grupos = {}
        for v in variantes:
            color_odoo = (v['color'] or '— sin color —')
            pid = int(v['product_id'])
            talla = v['talla']
            st = stock_map.get(pid, 0)
            vu, vt = ventas_map.get(pid, (0, 0))
            mapeo = mapeos_map.get(pid)

            g = grupos.setdefault(color_odoo, {
                'color_odoo': color_odoo,
                'stock_total': 0, 'unidades_vendidas': 0, 'tickets_total': 0,
                'product_ids': [], '_mset': set(),
            })
            g['stock_total'] += st
            g['unidades_vendidas'] += vu
            g['tickets_total'] += vt
            g['product_ids'].append({
                'product_id': pid, 'talla': talla, 'stock': st,
                'unidades_vendidas': vu, 'tickets': vt, 'mapeo': mapeo,
            })
            g['_mset'].add(mapeo['color_id'] if mapeo else None)

        colores_out = []
        mapeados_count = 0
        for color_odoo, g in grupos.items():
            mset = g.pop('_mset')
            if None in mset and len(mset) > 1:
                estado = 'parcial'
            elif None in mset:
                estado = 'pendiente'
            elif len(mset) == 1:
                estado = 'mapeado'
                mapeados_count += 1
            else:
                estado = 'parcial'

            color_rep = None
            if estado == 'mapeado':
                color_rep = next((p['mapeo'] for p in g['product_ids'] if p['mapeo']), None)
            g['mapeo_estado'] = estado
            g['color_id_mapeado'] = color_rep['color_id'] if color_rep else None
            g['color_nombre_mapeado'] = color_rep['color_nombre'] if color_rep else None
            g['color_general_nombre'] = color_rep['color_general_nombre'] if color_rep else None
            g['product_ids'].sort(key=lambda p: (p['talla'] or 'zz'))
            colores_out.append(g)

        estado_order = {'pendiente': 0, 'parcial': 1, 'mapeado': 2}
        colores_out.sort(key=lambda c: (estado_order.get(c['mapeo_estado'], 99), -c['stock_total']))

        return {
            'template_id': template_id,
            'total_variantes': len(variantes),
            'total_colores_odoo': len(grupos),
            'colores_mapeados': mapeados_count,
            'stock_total': sum(g['stock_total'] for g in colores_out),
            'colores': colores_out,
        }


@router.post("/color-mapping")
async def crear_color_mapping(body: ColorMappingInput, current_user: dict = Depends(get_current_user)):
    """Mapea N product_id al mismo color_id (UPSERT por (empresa_id, odoo_product_id))."""
    empresa_id = current_user.get("empresa_id") or 7
    if not body.product_ids:
        raise HTTPException(status_code=400, detail="product_ids vacío")
    pool = await get_pool()
    async with pool.acquire() as conn:
        color_nombre = await conn.fetchval(
            "SELECT nombre FROM prod_colores_catalogo WHERE id = $1", body.color_id
        )
        if not color_nombre:
            raise HTTPException(status_code=404, detail="Color no encontrado en prod_colores_catalogo")

        tallas_rows = await conn.fetch("""
            SELECT product_product_id AS product_id, talla
            FROM odoo.v_product_variant_flat
            WHERE product_product_id = ANY($1::int[])
        """, body.product_ids)
        talla_map = {int(r['product_id']): r['talla'] for r in tallas_rows}

        usuario = current_user.get('username')
        n = 0
        for pid in body.product_ids:
            await conn.execute("""
                INSERT INTO prod_odoo_color_mapping
                    (id, empresa_id, odoo_product_id, odoo_template_id,
                     color_odoo_original, talla_odoo, color_id, mapped_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (empresa_id, odoo_product_id) DO UPDATE SET
                    color_id = EXCLUDED.color_id,
                    color_odoo_original = EXCLUDED.color_odoo_original,
                    talla_odoo = EXCLUDED.talla_odoo,
                    odoo_template_id = EXCLUDED.odoo_template_id,
                    mapped_by = EXCLUDED.mapped_by,
                    updated_at = NOW()
            """,
                str(uuid.uuid4()), empresa_id, pid, body.template_id,
                body.color_odoo_original, talla_map.get(int(pid)),
                body.color_id, usuario)
            n += 1
        return {"ok": True, "mapeados": n, "color_nombre": color_nombre}


@router.delete("/color-mapping")
async def eliminar_color_mapping(body: ColorMappingDeleteInput, current_user: dict = Depends(get_current_user)):
    """Elimina todos los mapeos de los product_id indicados."""
    empresa_id = current_user.get("empresa_id") or 7
    if not body.product_ids:
        raise HTTPException(status_code=400, detail="product_ids vacío")
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("""
            DELETE FROM prod_odoo_color_mapping
            WHERE empresa_id = $1 AND odoo_template_id = $2
              AND odoo_product_id = ANY($3::int[])
        """, empresa_id, body.template_id, body.product_ids)
        n = int(result.split()[-1]) if result else 0
        return {"ok": True, "eliminados": n}


@router.post("/colores/crear")
async def crear_color_rapido(body: ColorCrearRapidoInput, current_user: dict = Depends(get_current_user)):
    """Crea un color en prod_colores_catalogo y devuelve el registro
    (o el existente si hay duplicado por nombre). Idempotente."""
    nombre = (body.nombre or '').strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Nombre requerido")
    pool = await get_pool()
    async with pool.acquire() as conn:
        dup = await conn.fetchval(
            "SELECT id FROM prod_colores_catalogo WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1",
            nombre,
        )
        if dup:
            row = await conn.fetchrow("""
                SELECT c.id, c.nombre, c.color_general_id, cg.nombre AS color_general_nombre
                FROM prod_colores_catalogo c
                LEFT JOIN prod_colores_generales cg ON cg.id = c.color_general_id
                WHERE c.id = $1
            """, dup)
            return {'id': row['id'], 'nombre': row['nombre'],
                    'color_general_id': row['color_general_id'],
                    'color_general_nombre': row['color_general_nombre'],
                    'existing': True}

        new_id = "col_" + uuid.uuid4().hex[:12]
        await conn.execute("""
            INSERT INTO prod_colores_catalogo (id, nombre, color_general_id)
            VALUES ($1, $2, $3)
        """, new_id, nombre, body.color_general_id)

        cg_nombre = None
        if body.color_general_id:
            cg_nombre = await conn.fetchval(
                "SELECT nombre FROM prod_colores_generales WHERE id = $1", body.color_general_id
            )
        return {'id': new_id, 'nombre': nombre,
                'color_general_id': body.color_general_id,
                'color_general_nombre': cg_nombre,
                'existing': False}
