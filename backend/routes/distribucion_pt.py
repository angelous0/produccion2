"""
Distribucion de Producto Terminado (PT) hacia Odoo y Conciliacion.
Tablas: prod_registro_pt_relacion, prod_registro_pt_odoo_vinculo
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from db import get_pool
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["distribucion-pt"])


# ======================== MODELOS ========================

class LineaDistribucion(BaseModel):
    tipo_salida: str
    product_template_id_odoo: int
    cantidad: float = Field(gt=0)

class DistribucionPTInput(BaseModel):
    lineas: List[LineaDistribucion]

class VinculoAjusteInput(BaseModel):
    stock_inventory_odoo_id: int


# ======================== INIT TABLES ========================

async def init_distribucion_pt_tables():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS produccion.prod_registro_pt_relacion (
                id SERIAL PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                tipo_salida VARCHAR NOT NULL CHECK(tipo_salida IN ('normal','arreglo','liquidacion_leve','liquidacion_grave')),
                product_template_id_odoo INTEGER NOT NULL,
                cantidad NUMERIC NOT NULL CHECK(cantidad > 0),
                created_at TIMESTAMP DEFAULT NOW(),
                created_by VARCHAR
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_pt_relacion_registro
            ON produccion.prod_registro_pt_relacion(registro_id)
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS produccion.prod_registro_pt_odoo_vinculo (
                id SERIAL PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                stock_inventory_odoo_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                created_by VARCHAR,
                UNIQUE(registro_id, stock_inventory_odoo_id),
                UNIQUE(stock_inventory_odoo_id)
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_pt_vinculo_registro
            ON produccion.prod_registro_pt_odoo_vinculo(registro_id)
        """)


# ======================== HELPERS ========================

async def _get_total_producido(conn, registro_id: str) -> float:
    """Calcula el total producido de un registro desde prod_registro_tallas."""
    total = await conn.fetchval(
        "SELECT COALESCE(SUM(cantidad_real), 0) FROM prod_registro_tallas WHERE registro_id = $1",
        registro_id
    )
    if total == 0:
        # Fallback: intentar desde tallas JSONB del registro
        row = await conn.fetchrow("SELECT tallas FROM prod_registros WHERE id = $1", registro_id)
        if row and row['tallas']:
            tallas = row['tallas'] if isinstance(row['tallas'], dict) else {}
            if isinstance(tallas, list):
                total = sum(float(t.get('cantidad', 0)) for t in tallas if isinstance(t, dict))
            elif isinstance(tallas, dict):
                total = sum(float(v) for v in tallas.values() if str(v).replace('.','',1).isdigit())
    if total == 0:
        # Fallback: usar cantidad_enviada del primer movimiento
        mov_qty = await conn.fetchval(
            "SELECT cantidad_enviada FROM prod_movimientos_produccion WHERE registro_id = $1 ORDER BY created_at ASC LIMIT 1",
            registro_id
        )
        if mov_qty:
            total = float(mov_qty)
    return float(total)


TIPOS_SALIDA_LABELS = {
    'normal': 'Normal',
    'arreglo': 'Arreglo',
    'liquidacion_leve': 'Liquidacion Leve',
    'liquidacion_grave': 'Liquidacion Grave',
}


# ======================== DISTRIBUCION PT ========================

@router.get("/registros/{registro_id}/distribucion-pt")
async def get_distribucion_pt(registro_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT id FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(404, "Registro no encontrado")

        total_producido = await _get_total_producido(conn, registro_id)

        lineas = await conn.fetch("""
            SELECT r.id, r.tipo_salida, r.product_template_id_odoo, r.cantidad,
                   r.created_at, r.created_by,
                   pt.name as producto_nombre, pt.marca, pt.tipo as producto_tipo
            FROM produccion.prod_registro_pt_relacion r
            LEFT JOIN odoo.product_template pt ON pt.odoo_id = r.product_template_id_odoo
            WHERE r.registro_id = $1
            ORDER BY r.id
        """, registro_id)

        total_distribuido = sum(float(l['cantidad']) for l in lineas)

        return {
            "registro_id": registro_id,
            "total_producido": total_producido,
            "total_distribuido": total_distribuido,
            "cuadra": abs(total_distribuido - total_producido) < 0.01,
            "lineas": [
                {
                    "id": l['id'],
                    "tipo_salida": l['tipo_salida'],
                    "tipo_salida_label": TIPOS_SALIDA_LABELS.get(l['tipo_salida'], l['tipo_salida']),
                    "product_template_id_odoo": l['product_template_id_odoo'],
                    "producto_nombre": l['producto_nombre'],
                    "producto_marca": l['marca'],
                    "producto_tipo": l['producto_tipo'],
                    "cantidad": float(l['cantidad']),
                    "created_at": l['created_at'].isoformat() if l['created_at'] else None,
                    "created_by": l['created_by'],
                }
                for l in lineas
            ]
        }


@router.post("/registros/{registro_id}/distribucion-pt")
async def guardar_distribucion_pt(
    registro_id: str,
    data: DistribucionPTInput,
    current_user: dict = Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT id FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(404, "Registro no encontrado")

        total_producido = await _get_total_producido(conn, registro_id)
        if total_producido <= 0:
            raise HTTPException(400, "El registro no tiene cantidad producida (tallas sin definir)")

        # Validar tipos de salida validos
        tipos_validos = {'normal', 'arreglo', 'liquidacion_leve', 'liquidacion_grave'}
        for linea in data.lineas:
            if linea.tipo_salida not in tipos_validos:
                raise HTTPException(400, f"Tipo de salida invalido: {linea.tipo_salida}")

        # Validar que los product_template_id_odoo existan
        product_ids = list(set(l.product_template_id_odoo for l in data.lineas))
        existing = await conn.fetch(
            "SELECT odoo_id FROM odoo.product_template WHERE odoo_id = ANY($1)",
            product_ids
        )
        existing_ids = {r['odoo_id'] for r in existing}
        missing = [pid for pid in product_ids if pid not in existing_ids]
        if missing:
            raise HTTPException(400, f"Productos Odoo no encontrados: {missing}")

        # Validar suma = total producido
        total_distribuido = sum(l.cantidad for l in data.lineas)
        if abs(total_distribuido - total_producido) > 0.01:
            raise HTTPException(
                400,
                f"El total distribuido ({total_distribuido}) no coincide con el total producido ({total_producido})"
            )

        # Agrupar duplicados (mismo product + mismo tipo_salida)
        agrupado = {}
        for linea in data.lineas:
            key = (linea.tipo_salida, linea.product_template_id_odoo)
            agrupado[key] = agrupado.get(key, 0) + linea.cantidad

        # Guardar atomicamente: DELETE + INSERT
        async with conn.transaction():
            await conn.execute(
                "DELETE FROM produccion.prod_registro_pt_relacion WHERE registro_id = $1",
                registro_id
            )
            for (tipo, prod_id), cantidad in agrupado.items():
                await conn.execute("""
                    INSERT INTO produccion.prod_registro_pt_relacion
                    (registro_id, tipo_salida, product_template_id_odoo, cantidad, created_at, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, registro_id, tipo, prod_id, cantidad,
                   datetime.now(), current_user.get('username'))

        return {"ok": True, "total_distribuido": total_distribuido, "total_producido": total_producido}


@router.delete("/registros/{registro_id}/distribucion-pt")
async def eliminar_distribucion_pt(registro_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM produccion.prod_registro_pt_relacion WHERE registro_id = $1",
            registro_id
        )
        return {"ok": True}


# ======================== VINCULOS ODOO ========================

@router.get("/registros/{registro_id}/vinculos-odoo")
async def get_vinculos_odoo(registro_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        vinculos = await conn.fetch("""
            SELECT v.id, v.stock_inventory_odoo_id, v.created_at, v.created_by,
                   si.name as ajuste_nombre, si.date as ajuste_fecha, si.state as ajuste_estado,
                   (SELECT COALESCE(SUM(sm.product_qty), 0)
                    FROM odoo.stock_move sm
                    WHERE sm.inventory_id = v.stock_inventory_odoo_id
                      AND sm.state = 'done') as total_moves_qty
            FROM produccion.prod_registro_pt_odoo_vinculo v
            LEFT JOIN odoo.stock_inventory si ON si.odoo_id = v.stock_inventory_odoo_id
            WHERE v.registro_id = $1
            ORDER BY v.created_at DESC
        """, registro_id)

        return [
            {
                "id": v['id'],
                "stock_inventory_odoo_id": v['stock_inventory_odoo_id'],
                "ajuste_nombre": v['ajuste_nombre'],
                "ajuste_fecha": v['ajuste_fecha'].isoformat() if v['ajuste_fecha'] else None,
                "ajuste_estado": v['ajuste_estado'],
                "total_moves_qty": float(v['total_moves_qty']),
                "created_at": v['created_at'].isoformat() if v['created_at'] else None,
                "created_by": v['created_by'],
            }
            for v in vinculos
        ]


@router.post("/registros/{registro_id}/vinculos-odoo")
async def vincular_ajuste_odoo(
    registro_id: str,
    data: VinculoAjusteInput,
    current_user: dict = Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT id FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(404, "Registro no encontrado")

        # Verificar que el ajuste exista en ODS
        ajuste = await conn.fetchrow(
            "SELECT odoo_id, name FROM odoo.stock_inventory WHERE odoo_id = $1",
            data.stock_inventory_odoo_id
        )
        if not ajuste:
            raise HTTPException(404, "Ajuste de Odoo no encontrado en el ODS")

        # Verificar que no este ya vinculado a OTRO registro (UNIQUE stock_inventory_odoo_id)
        ya_vinculado = await conn.fetchrow(
            "SELECT registro_id FROM produccion.prod_registro_pt_odoo_vinculo WHERE stock_inventory_odoo_id = $1",
            data.stock_inventory_odoo_id
        )
        if ya_vinculado:
            if ya_vinculado['registro_id'] == registro_id:
                raise HTTPException(400, "Este ajuste ya esta vinculado a este registro")
            raise HTTPException(
                400,
                f"Este ajuste ya esta vinculado al registro {ya_vinculado['registro_id']}"
            )

        await conn.execute("""
            INSERT INTO produccion.prod_registro_pt_odoo_vinculo
            (registro_id, stock_inventory_odoo_id, created_at, created_by)
            VALUES ($1, $2, $3, $4)
        """, registro_id, data.stock_inventory_odoo_id,
           datetime.now(), current_user.get('username'))

        return {"ok": True, "ajuste_nombre": ajuste['name']}


@router.delete("/registros/{registro_id}/vinculos-odoo/{vinculo_id}")
async def desvincular_ajuste_odoo(
    registro_id: str,
    vinculo_id: int,
    current_user: dict = Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        deleted = await conn.execute(
            "DELETE FROM produccion.prod_registro_pt_odoo_vinculo WHERE id = $1 AND registro_id = $2",
            vinculo_id, registro_id
        )
        return {"ok": True}


# ======================== CONCILIACION ========================

@router.get("/registros/{registro_id}/conciliacion-odoo")
async def get_conciliacion_odoo(registro_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT id FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(404, "Registro no encontrado")

        total_producido = await _get_total_producido(conn, registro_id)

        # A) Esperado: distribucion por product_template
        esperado_rows = await conn.fetch("""
            SELECT r.product_template_id_odoo, SUM(r.cantidad) as esperado,
                   pt.name as producto_nombre, pt.marca, pt.tipo as producto_tipo
            FROM produccion.prod_registro_pt_relacion r
            LEFT JOIN odoo.product_template pt ON pt.odoo_id = r.product_template_id_odoo
            WHERE r.registro_id = $1
            GROUP BY r.product_template_id_odoo, pt.name, pt.marca, pt.tipo
        """, registro_id)

        # B) Ingresado: solo de ajustes vinculados a este registro
        ingresado_rows = await conn.fetch("""
            SELECT sm.product_tmpl_id, SUM(sm.product_qty) as ingresado
            FROM odoo.stock_move sm
            JOIN produccion.prod_registro_pt_odoo_vinculo v
              ON v.stock_inventory_odoo_id = sm.inventory_id
              AND v.registro_id = $1
            WHERE sm.state = 'done'
            GROUP BY sm.product_tmpl_id
        """, registro_id)

        ingresado_map = {r['product_tmpl_id']: float(r['ingresado']) for r in ingresado_rows}

        # C) Cruce
        detalle = []
        total_esperado = 0
        total_ingresado = 0
        for row in esperado_rows:
            prod_id = row['product_template_id_odoo']
            esperado = float(row['esperado'])
            ingresado = ingresado_map.get(prod_id, 0)
            pendiente = esperado - ingresado

            if ingresado <= 0:
                estado = "PENDIENTE"
            elif ingresado < esperado:
                estado = "PARCIAL"
            else:
                estado = "COMPLETO"

            total_esperado += esperado
            total_ingresado += ingresado

            detalle.append({
                "product_template_id_odoo": prod_id,
                "producto_nombre": row['producto_nombre'],
                "producto_marca": row['marca'],
                "producto_tipo": row['producto_tipo'],
                "esperado": esperado,
                "ingresado": ingresado,
                "pendiente": pendiente,
                "estado": estado,
            })

        # Estado global
        if total_esperado == 0:
            estado_global = "SIN_DISTRIBUCION"
        elif total_ingresado <= 0:
            estado_global = "PENDIENTE"
        elif total_ingresado < total_esperado:
            estado_global = "PARCIAL"
        else:
            estado_global = "COMPLETO"

        return {
            "registro_id": registro_id,
            "total_producido": total_producido,
            "total_esperado": total_esperado,
            "total_ingresado": total_ingresado,
            "total_pendiente": total_esperado - total_ingresado,
            "estado": estado_global,
            "detalle": detalle,
        }


# ======================== CATALOGOS ODOO ========================

@router.get("/odoo/product-templates")
async def buscar_product_templates(
    search: str = Query("", min_length=0),
    limit: int = Query(30, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if search:
            rows = await conn.fetch("""
                SELECT odoo_id, name, marca, tipo, tela, linea_negocio, linea_negocio_id
                FROM odoo.product_template
                WHERE LOWER(name) LIKE $1 OR CAST(odoo_id AS TEXT) LIKE $1
                ORDER BY name
                LIMIT $2
            """, f"%{search.lower()}%", limit)
        else:
            rows = await conn.fetch("""
                SELECT odoo_id, name, marca, tipo, tela, linea_negocio, linea_negocio_id
                FROM odoo.product_template
                ORDER BY name
                LIMIT $1
            """, limit)

        return [
            {
                "odoo_id": r['odoo_id'],
                "name": r['name'],
                "marca": r['marca'],
                "tipo": r['tipo'],
                "tela": r['tela'],
                "linea_negocio": r['linea_negocio'],
                "linea_negocio_id": r['linea_negocio_id'],
            }
            for r in rows
        ]


@router.get("/odoo/stock-inventories")
async def buscar_stock_inventories(
    search: str = Query("", min_length=0),
    solo_produccion: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user)
):
    """Retorna ajustes de inventario de Odoo disponibles para vincular."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = ["si.state = 'done'"]
        params = []
        param_idx = 1

        if solo_produccion:
            conditions.append("si.x_es_ingreso_produccion = true")

        if search:
            conditions.append(f"(LOWER(si.name) LIKE ${param_idx} OR CAST(si.odoo_id AS TEXT) LIKE ${param_idx})")
            params.append(f"%{search.lower()}%")
            param_idx += 1

        where_clause = " AND ".join(conditions)
        params.append(limit)

        rows = await conn.fetch(f"""
            SELECT si.odoo_id, si.name, si.date, si.state,
                   (SELECT COALESCE(SUM(sm.product_qty), 0)
                    FROM odoo.stock_move sm
                    WHERE sm.inventory_id = si.odoo_id AND sm.state = 'done') as total_qty,
                   (SELECT v.registro_id
                    FROM produccion.prod_registro_pt_odoo_vinculo v
                    WHERE v.stock_inventory_odoo_id = si.odoo_id
                    LIMIT 1) as vinculado_a_registro
            FROM odoo.stock_inventory si
            WHERE {where_clause}
            ORDER BY si.date DESC
            LIMIT ${param_idx}
        """, *params)

        return [
            {
                "odoo_id": r['odoo_id'],
                "name": r['name'],
                "date": r['date'].isoformat() if r['date'] else None,
                "state": r['state'],
                "total_qty": float(r['total_qty']),
                "vinculado_a_registro": r['vinculado_a_registro'],
                "disponible": r['vinculado_a_registro'] is None,
            }
            for r in rows
        ]
