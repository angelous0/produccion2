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
from models import OdooProductoClasificarInput

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


async def _match_entalle(conn, nombre: str, empresa_id: int, entalles_cache: list) -> Optional[str]:
    if not nombre:
        return None
    upper = nombre.upper()
    # entalles_cache ya ordenado por LENGTH DESC para preferir matches más largos
    for ent in entalles_cache:
        if ent['nombre'].upper() in upper:
            return ent['id']
    return None


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
                pt.active,
                COALESCE(SUM(s.available_qty), 0) AS stock
            FROM odoo.product_template pt
            LEFT JOIN odoo.product_product pp ON pp.product_tmpl_id = pt.odoo_id
            LEFT JOIN odoo.v_stock_by_product s ON s.product_id = pp.odoo_id
            WHERE pt.active = TRUE
            GROUP BY pt.odoo_id, pt.name, pt.marca, pt.tipo, pt.active
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
            entalle_id = await _match_entalle(conn, nombre, empresa_id, entalles_cache)

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
                            odoo_active = $4,
                            odoo_stock_actual = $5,
                            last_sync = NOW(),
                            updated_at = NOW()
                        WHERE id = $6
                    """, nombre, marca_texto, tipo_texto, active, stock, existente['id'])
                else:
                    # Actualizar todo (FKs auto-matched + snapshot)
                    await conn.execute("""
                        UPDATE prod_odoo_productos_enriq SET
                            odoo_nombre = $1,
                            odoo_marca_texto = $2,
                            odoo_tipo_texto = $3,
                            odoo_active = $4,
                            odoo_stock_actual = $5,
                            marca_id = $6,
                            tipo_id = $7,
                            tela_general_id = $8,
                            entalle_id = $9,
                            estado = $10,
                            excluido_motivo = $11,
                            campos_pendientes = $12::jsonb,
                            last_sync = NOW(),
                            updated_at = NOW()
                        WHERE id = $13
                    """, nombre, marca_texto, tipo_texto, active, stock,
                         marca_id, tipo_id, tela_general_id, entalle_id,
                         estado, excluido_motivo, json.dumps(campos_pendientes),
                         existente['id'])
                actualizados += 1
            else:
                new_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_odoo_productos_enriq (
                        id, odoo_template_id, empresa_id,
                        odoo_nombre, odoo_marca_texto, odoo_tipo_texto,
                        odoo_active, odoo_stock_actual,
                        marca_id, tipo_id, tela_general_id, entalle_id,
                        estado, excluido_motivo, campos_pendientes, last_sync
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, NOW())
                """, new_id, template_id, empresa_id,
                     nombre, marca_texto, tipo_texto,
                     active, stock,
                     marca_id, tipo_id, tela_general_id, entalle_id,
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
                categoria_color_id = $10,
                notas = $11,
                estado = $12,
                excluido_motivo = NULL,
                campos_pendientes = $13::jsonb,
                classified_by = $14,
                classified_at = NOW(),
                updated_at = NOW()
            WHERE id = $15
        """, body.marca_id, body.tipo_id, body.tela_general_id, body.tela_id,
             body.entalle_id, body.genero_id, body.cuello_id, body.detalle_id,
             body.lavado_id, body.categoria_color_id, body.notas,
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
