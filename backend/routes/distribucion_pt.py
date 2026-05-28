"""
Distribucion de Producto Terminado (PT) hacia Odoo y Conciliacion.
Tablas: prod_registro_pt_relacion, prod_registro_pt_odoo_vinculo
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from db import get_pool
from auth_utils import get_current_user

router = APIRouter(prefix="/api", tags=["distribucion-pt"])


# ======================== MODELOS ========================

class LineaDistribucion(BaseModel):
    tipo_salida: str  # 'normal' | 'liquidacion_leve' | 'liquidacion_grave'
    product_template_id_odoo: int
    # Permitimos cantidad=0 (vínculo puro: el corte declara el template y el
    # tipo, pero deja la cantidad pendiente de definir — útil cuando la
    # mercadería llega en parciales o cuando todavía no se sabe cuántas
    # entran en LQ vs Normal).
    cantidad: float = Field(ge=0)

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
                tipo_salida VARCHAR NOT NULL CHECK(tipo_salida IN ('normal','liquidacion_leve','liquidacion_grave')),
                product_template_id_odoo INTEGER NOT NULL,
                cantidad NUMERIC NOT NULL CHECK(cantidad >= 0),
                created_at TIMESTAMP DEFAULT NOW(),
                created_by VARCHAR
            )
        """)
        # Si la tabla existía con el CHECK viejo (cantidad > 0), bajamos el
        # constraint y subimos el nuevo (cantidad >= 0). Idempotente.
        await conn.execute("""
            DO $$
            DECLARE
                conname TEXT;
            BEGIN
                SELECT con.conname INTO conname
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE nsp.nspname = 'produccion'
                  AND rel.relname = 'prod_registro_pt_relacion'
                  AND pg_get_constraintdef(con.oid) ILIKE '%cantidad > 0%';
                IF conname IS NOT NULL THEN
                    EXECUTE format(
                        'ALTER TABLE produccion.prod_registro_pt_relacion DROP CONSTRAINT %I',
                        conname
                    );
                END IF;
            END $$;
        """)
        await conn.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'prod_registro_pt_relacion_cantidad_check'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint con
                    JOIN pg_class rel ON rel.oid = con.conrelid
                    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                    WHERE nsp.nspname = 'produccion'
                      AND rel.relname = 'prod_registro_pt_relacion'
                      AND pg_get_constraintdef(con.oid) ILIKE '%cantidad >= 0%'
                ) THEN
                    ALTER TABLE produccion.prod_registro_pt_relacion
                    ADD CONSTRAINT prod_registro_pt_relacion_cantidad_check CHECK (cantidad >= 0);
                END IF;
            END $$;
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
    'liquidacion_leve': 'Liquidación Leve (LQ)',
    'liquidacion_grave': 'Liquidación Grave',
}
TIPOS_SALIDA_VALIDOS = set(TIPOS_SALIDA_LABELS.keys())


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
        reg = await conn.fetchrow(
            "SELECT id, pt_item_id FROM prod_registros WHERE id = $1", registro_id
        )
        if not reg:
            raise HTTPException(404, "Registro no encontrado")

        total_producido = await _get_total_producido(conn, registro_id)
        if total_producido <= 0:
            raise HTTPException(400, "El registro no tiene cantidad producida (tallas sin definir)")

        # Validar tipos de salida validos
        for linea in data.lineas:
            if linea.tipo_salida not in TIPOS_SALIDA_VALIDOS:
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

        # Validar cantidades: permitimos parciales (suma <= total_producido) y
        # cantidad = 0 (vínculo puro al template sin declarar cuántas piezas
        # van a ese tipo de salida todavía). Lo único que NO permitimos es
        # excederse del producido o cantidades negativas.
        for linea in data.lineas:
            if linea.cantidad is None or linea.cantidad < 0:
                raise HTTPException(400, "La cantidad no puede ser negativa")

        total_distribuido = sum(l.cantidad for l in data.lineas)
        if total_distribuido > total_producido + 0.01:
            raise HTTPException(
                400,
                f"El total distribuido ({total_distribuido}) excede el total producido ({total_producido})"
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
                   datetime.now(timezone.utc).replace(tzinfo=None), current_user.get('username'))

        # Hook 1: auto-vincular PT ↔ templates Odoo si el corte tiene
        # pt_item_id. Cada par (template_id, tipo_salida) declarado para este
        # corte se registra en prod_pt_odoo_templates con auto_vinculado=TRUE.
        # Si ya existía el par, no se duplica. Permite calcular stock vivo
        # del PT consultando Odoo (lo que vive en stock_quant + ventas POS).
        pt_links_creados = 0
        if reg.get("pt_item_id"):
            try:
                for (tipo, prod_id), _cant in agrupado.items():
                    res = await conn.execute(
                        """INSERT INTO produccion.prod_pt_odoo_templates
                           (pt_item_id, odoo_template_id, tipo_salida, auto_vinculado, created_by)
                           VALUES ($1, $2, $3, TRUE, $4)
                           ON CONFLICT (pt_item_id, odoo_template_id) DO NOTHING""",
                        reg["pt_item_id"], prod_id, tipo, current_user.get('username'),
                    )
                    if res and res.startswith('INSERT') and not res.endswith(' 0'):
                        pt_links_creados += 1
            except Exception as e:
                # No bloqueamos el guardado por un fallo del hook.
                print(f"[distribucion_pt] aviso: link PT↔templates falló para {registro_id}: {e}")

        # Hook 2: tras guardar la distribución, intentar detectar el
        # primer movimiento done a una tienda comercial usando los templates
        # con tipo_salida='normal'. Si lo encuentra, marca estado='Tienda' y
        # setea fecha_envio_tienda (respeta la edición manual del usuario —
        # la lógica vive en odoo_tienda._sync_estados_tienda).
        sync_cambios = []
        try:
            from routes.odoo_tienda import _sync_estados_tienda
            sync_cambios = await _sync_estados_tienda(conn, registro_ids=[registro_id])
        except Exception as e:
            # No bloqueamos el guardado de la distribución por un fallo de sync.
            print(f"[distribucion_pt] aviso: sync post-guardado falló para {registro_id}: {e}")

        return {
            "ok": True,
            "total_distribuido": total_distribuido,
            "total_producido": total_producido,
            "sync_tienda": sync_cambios,  # [] si no detectó nada o sólo respeto manual
            "pt_links_creados": pt_links_creados,  # cuántos vínculos PT↔template nuevos
        }


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
        # Templates declarados en la distribución del corte (para calcular match)
        tpl_rows = await conn.fetch(
            """SELECT DISTINCT product_template_id_odoo
               FROM produccion.prod_registro_pt_relacion
               WHERE registro_id = $1""",
            registro_id,
        )
        template_ids_corte = [int(r['product_template_id_odoo']) for r in tpl_rows]

        # Locations marcadas como ingreso de producción (para calcular qty
        # NETO: lo que entra menos lo que sale de AP, así las
        # re-clasificaciones de variante suman 0).
        loc_rows = await conn.fetch(
            "SELECT odoo_location_id FROM produccion.prod_locations_ingreso_produccion WHERE activo = TRUE"
        )
        loc_ingreso_ids = [int(r['odoo_location_id']) for r in loc_rows] or [-1]

        vinculos = await conn.fetch("""
            SELECT v.id, v.stock_inventory_odoo_id, v.created_at, v.created_by,
                   si.name as ajuste_nombre, si.date as ajuste_fecha, si.state as ajuste_estado,
                   (SELECT COALESCE(
                      SUM(CASE WHEN sm.location_dest_id = ANY($2::int[]) THEN sm.product_qty ELSE 0 END)
                      - SUM(CASE WHEN sm.location_id      = ANY($2::int[]) THEN sm.product_qty ELSE 0 END),
                      0)
                    FROM odoo.stock_move sm
                    WHERE sm.inventory_id = v.stock_inventory_odoo_id
                      AND sm.state = 'done') as total_moves_qty
            FROM produccion.prod_registro_pt_odoo_vinculo v
            LEFT JOIN odoo.stock_inventory si ON si.odoo_id = v.stock_inventory_odoo_id
            WHERE v.registro_id = $1
            ORDER BY v.created_at DESC
        """, registro_id, loc_ingreso_ids)

        result = []
        for v in vinculos:
            templates_detalle = []
            if template_ids_corte:
                # Incluimos templates con qty=0 (re-clasificaciones) para
                # que el ajuste se cuente como match aunque no agregue stock.
                detalle_rows = await conn.fetch(
                    """SELECT sm.product_tmpl_id,
                              SUM(CASE WHEN sm.location_dest_id = ANY($3::int[]) THEN sm.product_qty ELSE 0 END)
                              - SUM(CASE WHEN sm.location_id      = ANY($3::int[]) THEN sm.product_qty ELSE 0 END)
                              AS qty,
                              pt.name as nombre
                       FROM odoo.stock_move sm
                       LEFT JOIN odoo.product_template pt ON pt.odoo_id = sm.product_tmpl_id
                       WHERE sm.inventory_id = $1 AND sm.state = 'done'
                         AND sm.product_tmpl_id = ANY($2::int[])
                       GROUP BY sm.product_tmpl_id, pt.name
                       ORDER BY qty DESC""",
                    v['stock_inventory_odoo_id'], template_ids_corte, loc_ingreso_ids,
                )
                templates_detalle = [
                    {"template_id": d['product_tmpl_id'], "nombre": d['nombre'], "qty": float(d['qty'])}
                    for d in detalle_rows
                ]
            result.append({
                "id": v['id'],
                "stock_inventory_odoo_id": v['stock_inventory_odoo_id'],
                "ajuste_nombre": v['ajuste_nombre'],
                "ajuste_fecha": v['ajuste_fecha'].isoformat() if v['ajuste_fecha'] else None,
                "ajuste_estado": v['ajuste_estado'],
                "total_moves_qty": float(v['total_moves_qty']),
                "created_at": v['created_at'].isoformat() if v['created_at'] else None,
                "created_by": v['created_by'],
                "templates_detalle": templates_detalle,
                "templates_match": len(templates_detalle),
                "templates_total": len(template_ids_corte),
            })
        return result


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
           datetime.now(timezone.utc).replace(tzinfo=None), current_user.get('username'))

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

        # B) Ingresado NETO: solo de ajustes vinculados a este registro,
        # contando lo que ENTRA a una location de ingreso (AP) menos lo
        # que SALE. Los ajustes de re-clasificación de variante (que
        # mueven 1 ud Negro→Virtual y 1 ud Carbon←Virtual) suman 0 neto.
        loc_rows = await conn.fetch(
            "SELECT odoo_location_id FROM produccion.prod_locations_ingreso_produccion WHERE activo = TRUE"
        )
        loc_ingreso_ids = [int(r['odoo_location_id']) for r in loc_rows]
        if not loc_ingreso_ids:
            loc_ingreso_ids = [-1]  # fallback: ninguna location → ingresado = 0
        ingresado_rows = await conn.fetch("""
            SELECT sm.product_tmpl_id,
                   SUM(CASE WHEN sm.location_dest_id = ANY($2::int[]) THEN sm.product_qty ELSE 0 END)
                   - SUM(CASE WHEN sm.location_id      = ANY($2::int[]) THEN sm.product_qty ELSE 0 END)
                   AS ingresado
            FROM odoo.stock_move sm
            JOIN produccion.prod_registro_pt_odoo_vinculo v
              ON v.stock_inventory_odoo_id = sm.inventory_id
              AND v.registro_id = $1
            WHERE sm.state = 'done'
            GROUP BY sm.product_tmpl_id
        """, registro_id, loc_ingreso_ids)

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

        # ===== Balance de diagnóstico =====
        # Descompone el pendiente en sus causas reales: fallados sin enviar a
        # arreglo, en proceso de arreglo, recuperadas sin ingresar a Odoo,
        # a merma/tela, e inexplicable. Misma fórmula que el endpoint
        # /reportes-produccion/conciliacion-pendiente.
        balance = None
        balance_raw = await conn.fetchrow("""
            SELECT
                COALESCE(fall.detectados, 0)                                AS fallados_detectados,
                COALESCE(arr.enviadas, 0)                                   AS arreglos_enviadas,
                COALESCE(arr.en_proceso, 0)                                 AS arreglos_en_proceso,
                COALESCE(arr.recuperadas, 0)                                AS arreglos_recuperadas,
                COALESCE(arr.a_liquidacion, 0)                              AS arreglos_a_liquidacion,
                COALESCE(arr.a_merma, 0)                                    AS arreglos_a_merma,
                COALESCE(arr.a_tela, 0)                                     AS arreglos_a_tela,
                COALESCE(mer.total, 0)                                      AS mermas_directas,
                r.fecha_creacion                                            AS fecha_creacion
            FROM produccion.prod_registros r
            LEFT JOIN LATERAL (
                SELECT SUM(cantidad_detectada) AS detectados
                FROM produccion.prod_fallados WHERE registro_id = r.id
            ) fall ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    SUM(cantidad)                                                                  AS enviadas,
                    SUM(CASE WHEN estado <> 'COMPLETADO' THEN cantidad ELSE 0 END)                 AS en_proceso,
                    SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_recuperada,0) END) AS recuperadas,
                    SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_liquidacion,0) END)AS a_liquidacion,
                    SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_merma,0) END)      AS a_merma,
                    SUM(CASE WHEN estado  = 'COMPLETADO' THEN COALESCE(cantidad_pasa_a_tela,0) END)AS a_tela
                FROM produccion.prod_registro_arreglos WHERE registro_id = r.id
            ) arr ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(cantidad) AS total
                FROM produccion.prod_mermas WHERE registro_id = r.id
            ) mer ON TRUE
            WHERE r.id = $1
        """, registro_id)

        if balance_raw:
            pendiente_total = max(0, int(total_esperado) - int(total_ingresado))
            fall_det = int(balance_raw["fallados_detectados"] or 0)
            arr_env  = int(balance_raw["arreglos_enviadas"] or 0)
            arr_proc = int(balance_raw["arreglos_en_proceso"] or 0)
            arr_mer  = int(balance_raw["arreglos_a_merma"] or 0)
            arr_tel  = int(balance_raw["arreglos_a_tela"] or 0)

            fallados_sin_enviar       = max(0, fall_det - arr_env)
            en_arreglo_proceso        = arr_proc
            a_merma_o_tela            = arr_mer + arr_tel
            explicado_calidad         = fallados_sin_enviar + en_arreglo_proceso
            recuperadas_sin_ingresar  = max(0, pendiente_total - explicado_calidad)
            inexplicable              = max(0, pendiente_total - explicado_calidad - recuperadas_sin_ingresar)

            from datetime import datetime, timezone
            dias = None
            if balance_raw["fecha_creacion"]:
                dias = (datetime.now(timezone.utc).date() - balance_raw["fecha_creacion"].date()).days

            balance = {
                "pendiente_total":         pendiente_total,
                "producido":               int(total_producido),
                "fallados_detectados":     fall_det,
                "arreglos_enviadas":       arr_env,
                "arreglos_recuperadas":    int(balance_raw["arreglos_recuperadas"] or 0),
                "arreglos_a_liquidacion":  int(balance_raw["arreglos_a_liquidacion"] or 0),
                "mermas_directas":         int(balance_raw["mermas_directas"] or 0),
                "dias_en_estado":          dias,
                # Desglose accionable del pendiente
                "fallados_sin_enviar":      fallados_sin_enviar,
                "en_arreglo_proceso":       en_arreglo_proceso,
                "recuperadas_sin_ingresar": recuperadas_sin_ingresar,
                "a_merma_o_tela":           a_merma_o_tela,
                "inexplicable":             inexplicable,
            }

        return {
            "registro_id": registro_id,
            "total_producido": total_producido,
            "total_esperado": total_esperado,
            "total_ingresado": total_ingresado,
            "total_pendiente": total_esperado - total_ingresado,
            "estado": estado_global,
            "detalle": detalle,
            "balance": balance,
        }


# ======================== CATALOGOS ODOO ========================

@router.get("/odoo/product-templates")
async def buscar_product_templates(
    search: str = Query("", min_length=0),
    limit: int = Query(30, ge=1, le=100),
    incluir_no_vendibles: bool = Query(False, description="Si False (default): solo sale_ok=TRUE AND purchase_ok=FALSE (productos terminados propios). Si True: trae todos los activos."),
    current_user: dict = Depends(get_current_user)
):
    """Busca templates Odoo para asignar como producto final de un corte.
    Por defecto filtra solo los productos vendibles que NO son de compra
    (es decir, productos terminados propios, no insumos).
    """
    # WHERE base: active=true + filtros sale_ok/purchase_ok
    where = ["active = TRUE"]
    if not incluir_no_vendibles:
        where.append("sale_ok = TRUE")
        where.append("COALESCE(purchase_ok, FALSE) = FALSE")

    params = []
    if search:
        params.append(f"%{search.lower()}%")
        where.append(f"(LOWER(name) LIKE ${len(params)} OR CAST(odoo_id AS TEXT) LIKE ${len(params)})")

    params.append(limit)
    sql = f"""
        SELECT odoo_id, name, marca, tipo, tela, entalle, linea_negocio, linea_negocio_id,
               sale_ok, purchase_ok
        FROM odoo.product_template
        WHERE {' AND '.join(where)}
        ORDER BY name
        LIMIT ${len(params)}
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)

    return [
        {
            "odoo_id": r['odoo_id'],
            "name": r['name'],
            "marca": r['marca'],
            "tipo": r['tipo'],
            "tela": r['tela'],
            "entalle": r['entalle'],
            "linea_negocio": r['linea_negocio'],
            "linea_negocio_id": r['linea_negocio_id'],
            "sale_ok": r['sale_ok'],
            "purchase_ok": r['purchase_ok'],
        }
        for r in rows
    ]


@router.get("/odoo/stock-inventories")
async def buscar_stock_inventories(
    search: str = Query("", min_length=0),
    registro_id: Optional[str] = Query(None, description="Si se pasa, filtra solo ajustes que muevan algún template declarado en la distribución del corte"),
    dias_ventana: int = Query(180, ge=1, le=730, description="Solo ajustes con fecha en los últimos N días (default 180 = 6 meses)"),
    incluir_legacy_flag: bool = Query(False, description="Si True, también incluye ajustes con x_es_ingreso_produccion=true aunque no estén en una location de ingreso configurada (compat hacia atrás)"),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user)
):
    """Lista ajustes de inventario de Odoo candidatos para vincular con un corte.

    Reglas nuevas (post-016_locations_ingreso_produccion):
      - Solo ajustes `state='done'` en una de las locations marcadas
        como "ingreso de producción" (tabla prod_locations_ingreso_produccion).
      - Solo ajustes dentro de los últimos `dias_ventana` días (default 180 = 6 meses).
      - Si se pasa `registro_id`: solo aparecen los que mueven al menos un
        product_template_id_odoo declarado en la distribución del corte
        (cualquier tipo_salida).
      - `incluir_legacy_flag=true` añade los que tienen el flag manual
        `x_es_ingreso_produccion=true` (compat con setup viejo).

    Devuelve por cada ajuste:
      - total_qty: cantidad total movida (todos los productos)
      - qty_para_corte: cantidad movida SOLO de los templates del corte
      - templates_detalle: lista de [{template_id, nombre, qty}] de las
        líneas que coinciden con templates declarados del corte
      - templates_match / templates_total: para chip "2/3 match"
      - vinculado_a_registro / disponible: si ya está tomado por otro corte
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1) Templates declarados en la distribución del corte (cualquier tipo)
        template_ids_corte: List[int] = []
        if registro_id:
            rows_tpl = await conn.fetch(
                """SELECT DISTINCT product_template_id_odoo
                   FROM produccion.prod_registro_pt_relacion
                   WHERE registro_id = $1""",
                registro_id,
            )
            template_ids_corte = [int(r['product_template_id_odoo']) for r in rows_tpl]
            # Modo estricto: si pidió por corte pero el corte no tiene
            # distribución todavía, devolvemos lista vacía (no tiene sentido
            # mostrar ajustes random hasta que declare templates).
            if not template_ids_corte:
                return []

        # 2) Locations configuradas como ingreso de producción
        loc_rows = await conn.fetch(
            """SELECT odoo_location_id FROM produccion.prod_locations_ingreso_produccion
               WHERE activo = TRUE"""
        )
        location_ids = [int(r['odoo_location_id']) for r in loc_rows]

        # Si no hay locations configuradas y tampoco fallback al flag legacy,
        # no hay forma de filtrar — devolvemos vacío con un hint en el log.
        if not location_ids and not incluir_legacy_flag:
            return []

        # 3) Armar WHERE
        conditions = ["si.state = 'done'"]
        params: list = []
        idx = 1

        # Ventana temporal (default 120 días)
        params.append(dias_ventana)
        conditions.append(f"si.date >= NOW() - (${idx} * INTERVAL '1 day')")
        idx += 1

        # Origen: location configurada (siempre) ó flag legacy (opcional)
        origen_clauses = []
        if location_ids:
            params.append(location_ids)
            origen_clauses.append(f"si.location_id = ANY(${idx}::int[])")
            idx += 1
        if incluir_legacy_flag:
            origen_clauses.append("si.x_es_ingreso_produccion = true")
        conditions.append("(" + " OR ".join(origen_clauses) + ")")

        # Filtro estricto por templates del corte
        if template_ids_corte:
            params.append(template_ids_corte)
            conditions.append(
                f"EXISTS (SELECT 1 FROM odoo.stock_move sm "
                f"        WHERE sm.inventory_id = si.odoo_id AND sm.state = 'done' "
                f"          AND sm.product_tmpl_id = ANY(${idx}::int[]))"
            )
            idx += 1

        # Búsqueda por texto (nombre o id)
        if search:
            params.append(f"%{search.lower()}%")
            conditions.append(f"(LOWER(si.name) LIKE ${idx} OR CAST(si.odoo_id AS TEXT) LIKE ${idx})")
            idx += 1

        where_clause = " AND ".join(conditions)
        params.append(limit)
        limit_idx = idx

        # total_qty NETO: solo cuenta lo que ENTRA a una location de
        # ingreso menos lo que SALE. Re-clasificaciones (Negro→Carbon)
        # suman 0 en lugar del valor engañoso 2.
        loc_ids_for_qty = location_ids if location_ids else [-1]
        rows = await conn.fetch(f"""
            SELECT si.odoo_id, si.name, si.date, si.state, si.location_id,
                   (SELECT COALESCE(
                     SUM(CASE WHEN sm.location_dest_id = ANY(${limit_idx + 1}::int[]) THEN sm.product_qty ELSE 0 END)
                     - SUM(CASE WHEN sm.location_id      = ANY(${limit_idx + 1}::int[]) THEN sm.product_qty ELSE 0 END),
                     0)
                    FROM odoo.stock_move sm
                    WHERE sm.inventory_id = si.odoo_id AND sm.state = 'done') as total_qty,
                   (SELECT v.registro_id
                    FROM produccion.prod_registro_pt_odoo_vinculo v
                    WHERE v.stock_inventory_odoo_id = si.odoo_id
                    LIMIT 1) as vinculado_a_registro
            FROM odoo.stock_inventory si
            WHERE {where_clause}
            ORDER BY si.date DESC
            LIMIT ${limit_idx}
        """, *params, loc_ids_for_qty)

        # 4) Si filtramos por corte, obtener detalle por template para cada ajuste
        result = []
        for r in rows:
            base = {
                "odoo_id": r['odoo_id'],
                "name": r['name'],
                "date": r['date'].isoformat() if r['date'] else None,
                "state": r['state'],
                "location_id": r['location_id'],
                "total_qty": float(r['total_qty']),
                "vinculado_a_registro": r['vinculado_a_registro'],
                "disponible": r['vinculado_a_registro'] is None,
                "qty_para_corte": 0.0,
                "templates_detalle": [],
                "templates_match": 0,
                "templates_total": len(template_ids_corte),
            }
            if template_ids_corte:
                # qty NETO por template (entra a AP menos sale de AP).
                # IMPORTANTE: incluimos también filas con qty=0 (típico de
                # re-clasificaciones de variante) para que `templates_match`
                # cuente el ajuste y el auto-vinculador lo tome.
                detalle_rows = await conn.fetch(
                    """SELECT sm.product_tmpl_id,
                              SUM(CASE WHEN sm.location_dest_id = ANY($3::int[]) THEN sm.product_qty ELSE 0 END)
                              - SUM(CASE WHEN sm.location_id      = ANY($3::int[]) THEN sm.product_qty ELSE 0 END)
                              AS qty,
                              pt.name as nombre
                       FROM odoo.stock_move sm
                       LEFT JOIN odoo.product_template pt ON pt.odoo_id = sm.product_tmpl_id
                       WHERE sm.inventory_id = $1 AND sm.state = 'done'
                         AND sm.product_tmpl_id = ANY($2::int[])
                       GROUP BY sm.product_tmpl_id, pt.name
                       ORDER BY qty DESC""",
                    r['odoo_id'], template_ids_corte, loc_ids_for_qty,
                )
                base["templates_detalle"] = [
                    {
                        "template_id": d['product_tmpl_id'],
                        "nombre": d['nombre'],
                        "qty": float(d['qty']),
                    } for d in detalle_rows
                ]
                base["qty_para_corte"] = sum(d['qty'] for d in base["templates_detalle"])
                base["templates_match"] = len(detalle_rows)
            result.append(base)
        return result


# ======================== LOCATIONS DE INGRESO DE PRODUCCIÓN ========================
# CRUD para la tabla prod_locations_ingreso_produccion. Sirve para que un
# admin marque qué locations de Odoo cuentan como "ingreso de producción"
# (el lugar físico donde aterrizan las prendas que vienen de planta).

class LocationIngresoInput(BaseModel):
    odoo_location_id: int = Field(gt=0)
    nombre: str = Field(min_length=1, max_length=40)
    alias_grupo: Optional[str] = Field(default=None, max_length=40)
    activo: bool = True
    notas: Optional[str] = None


class LocationIngresoUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, max_length=40)
    alias_grupo: Optional[str] = Field(default=None, max_length=40)
    activo: Optional[bool] = None
    notas: Optional[str] = None


@router.get("/locations-ingreso-produccion")
async def listar_locations_ingreso(current_user: dict = Depends(get_current_user)):
    """Lista las locations marcadas como ingreso de producción.
    Devuelve también el nombre/x_nombre real desde odoo.stock_location para
    facilitar identificarlas en la UI.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT lp.id, lp.odoo_location_id, lp.nombre, lp.alias_grupo,
                      lp.activo, lp.notas, lp.created_at,
                      sl.complete_name AS location_complete_name,
                      COALESCE(NULLIF(sl.x_nombre, ''), sl.name) AS location_label,
                      sl.usage AS location_usage
               FROM produccion.prod_locations_ingreso_produccion lp
               LEFT JOIN odoo.stock_location sl ON sl.odoo_id = lp.odoo_location_id
               ORDER BY lp.activo DESC, lp.nombre"""
        )
        return [
            {
                **dict(r),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


@router.post("/locations-ingreso-produccion")
async def crear_location_ingreso(
    data: LocationIngresoInput,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar que la location exista en Odoo
        exists = await conn.fetchval(
            "SELECT 1 FROM odoo.stock_location WHERE odoo_id = $1", data.odoo_location_id
        )
        if not exists:
            raise HTTPException(404, f"La location odoo_id={data.odoo_location_id} no existe en odoo.stock_location")
        # Duplicado
        ya = await conn.fetchval(
            "SELECT id FROM produccion.prod_locations_ingreso_produccion WHERE odoo_location_id = $1",
            data.odoo_location_id,
        )
        if ya:
            raise HTTPException(400, "Esta location ya está registrada")
        row = await conn.fetchrow(
            """INSERT INTO produccion.prod_locations_ingreso_produccion
               (odoo_location_id, nombre, alias_grupo, activo, notas)
               VALUES ($1, $2, $3, $4, $5) RETURNING id""",
            data.odoo_location_id, data.nombre, data.alias_grupo, data.activo, data.notas,
        )
        return {"ok": True, "id": row["id"]}


@router.patch("/locations-ingreso-produccion/{loc_id}")
async def actualizar_location_ingreso(
    loc_id: int,
    data: LocationIngresoUpdate,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM produccion.prod_locations_ingreso_produccion WHERE id = $1", loc_id
        )
        if not existing:
            raise HTTPException(404, "Location no encontrada")

        sets, params = [], []
        for field, val in [
            ("nombre", data.nombre),
            ("alias_grupo", data.alias_grupo),
            ("activo", data.activo),
            ("notas", data.notas),
        ]:
            if val is not None:
                params.append(val)
                sets.append(f"{field} = ${len(params)}")
        if not sets:
            return {"ok": True, "noop": True}
        params.append(loc_id)
        await conn.execute(
            f"UPDATE produccion.prod_locations_ingreso_produccion SET {', '.join(sets)} WHERE id = ${len(params)}",
            *params,
        )
        return {"ok": True}


@router.delete("/locations-ingreso-produccion/{loc_id}")
async def eliminar_location_ingreso(
    loc_id: int,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM produccion.prod_locations_ingreso_produccion WHERE id = $1", loc_id
        )
        return {"ok": True}


@router.get("/odoo/stock-locations/buscar")
async def buscar_stock_locations(
    search: str = Query("", min_length=0),
    limit: int = Query(30, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Helper para la pantalla admin: busca locations de Odoo por nombre/x_nombre/id
    para poder agregarlas a la tabla `prod_locations_ingreso_produccion`.
    Excluye las que ya están registradas.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        params: list = []
        conditions = ["sl.active = TRUE", "sl.usage IN ('internal', 'view')"]
        if search:
            params.append(f"%{search.lower()}%")
            conditions.append(
                f"(LOWER(COALESCE(sl.name,'')) LIKE ${len(params)} "
                f"OR LOWER(COALESCE(sl.x_nombre,'')) LIKE ${len(params)} "
                f"OR CAST(sl.odoo_id AS TEXT) LIKE ${len(params)})"
            )
        params.append(limit)
        rows = await conn.fetch(
            f"""SELECT sl.odoo_id, sl.name, sl.x_nombre, sl.complete_name, sl.usage,
                       (SELECT id FROM produccion.prod_locations_ingreso_produccion
                        WHERE odoo_location_id = sl.odoo_id LIMIT 1) AS ya_registrada_id
                FROM odoo.stock_location sl
                WHERE {' AND '.join(conditions)}
                ORDER BY sl.odoo_id
                LIMIT ${len(params)}""",
            *params,
        )
        return [dict(r) for r in rows]
