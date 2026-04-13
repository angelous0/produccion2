"""
Script para crear salidas de materiales para los registros de producción
que ya tienen avance (estado posterior a 'Para Corte').
"""
import asyncio
import asyncpg
import uuid
import json
from datetime import datetime, timedelta

DB_URL = 'postgres://admin:admin@72.60.241.216:9595/datos?sslmode=disable&options=-csearch_path%3Dproduccion'


def get_material_type(item_name):
    name_lower = item_name.lower()
    if 'jersey' in name_lower or 'french terry' in name_lower or 'tela' in name_lower:
        return 'tela'
    if 'hilo' in name_lower:
        return 'hilo'
    return 'avio'


def should_consume(material_type, plan_level):
    if plan_level == 'all':
        return True
    if plan_level == 'tela' and material_type == 'tela':
        return True
    if plan_level in ('tela+hilo', 'tela+hilo+avios') and material_type in ('tela', 'hilo'):
        return True
    if plan_level == 'tela+hilo+avios' and material_type == 'avio':
        return True
    return False


async def main():
    conn = await asyncpg.connect(DB_URL)

    # ======== LOAD DATA ========
    # Registros
    regs = {}
    rows = await conn.fetch(
        'SELECT id, n_corte, modelo_id, estado FROM prod_registros ORDER BY n_corte')
    for r in rows:
        regs[r['n_corte']] = {
            'id': r['id'], 'modelo_id': r['modelo_id'], 'estado': r['estado']
        }

    # Tallas per registro -> total prendas
    reg_totals = {}
    rows = await conn.fetch(
        'SELECT registro_id, SUM(cantidad_real) as total FROM prod_registro_tallas GROUP BY registro_id')
    for r in rows:
        reg_totals[r['registro_id']] = float(r['total'])

    # BOM per modelo
    bom = {}
    rows = await conn.fetch("""
        SELECT bl.modelo_id, bl.inventario_id, bl.cantidad_base, bl.talla_id,
               i.control_por_rollos, i.nombre
        FROM prod_modelo_bom_linea bl
        JOIN prod_inventario i ON i.id = bl.inventario_id
        WHERE bl.activo = true
          AND bl.modelo_id IN (SELECT DISTINCT modelo_id FROM prod_registros)
    """)
    for b in rows:
        bom.setdefault(b['modelo_id'], []).append({
            'item_id': b['inventario_id'],
            'qty_per_unit': float(b['cantidad_base']),
            'is_rollo': b['control_por_rollos'],
            'nombre': b['nombre']
        })

    # Rollos available (FIFO by created_at)
    rollos_by_item = {}
    rows = await conn.fetch("""
        SELECT id, item_id, metraje_disponible, costo_unitario_metro, ingreso_id
        FROM prod_inventario_rollos
        WHERE metraje_disponible > 0
        ORDER BY item_id, created_at
    """)
    for r in rows:
        rollos_by_item.setdefault(r['item_id'], []).append({
            'id': r['id'], 'disp': float(r['metraje_disponible']),
            'costo': float(r['costo_unitario_metro']), 'ingreso_id': r['ingreso_id']
        })

    # Ingresos FIFO (non-rollo)
    ingresos_by_item = {}
    rows = await conn.fetch("""
        SELECT ing.id, ing.item_id, ing.cantidad_disponible, ing.costo_unitario
        FROM prod_inventario_ingresos ing
        JOIN prod_inventario i ON i.id = ing.item_id
        WHERE ing.cantidad_disponible > 0 AND i.control_por_rollos = false
        ORDER BY ing.item_id, ing.fecha
    """)
    for r in rows:
        ingresos_by_item.setdefault(r['item_id'], []).append({
            'id': r['id'], 'disp': float(r['cantidad_disponible']),
            'costo': float(r['costo_unitario'])
        })

    # ======== PLAN: which registros get which materials consumed ========
    salidas_plan = {
        # CORTE-001: Para Corte -> NO salidas
        'CORTE-002': 'tela',                # Corte -> tela consumed
        'CORTE-003': 'tela+hilo',            # Costura -> tela + hilo
        'CORTE-004': 'all',                  # Acabado -> all materials
        'CORTE-005': 'tela+hilo',            # Bordado -> tela + hilo
        'CORTE-006': 'tela+hilo+avios',      # Lavandería -> tela + hilo + avíos
        'CORTE-007': 'tela',                 # Estampado -> tela consumed
        'CORTE-008': 'tela+hilo',            # Costura -> tela + hilo
        'CORTE-009': 'tela',                 # Para Costura -> tela consumed (corte done)
        'CORTE-009-D1': 'tela',              # Para Costura -> tela consumed (division)
        'CORTE-010': 'all',                  # Producto Terminado -> ALL consumed
    }

    # ======== CREATE SALIDAS ========
    salida_count = 0
    req_count = 0
    base_date = datetime(2026, 3, 20)

    for n_corte, plan_level in salidas_plan.items():
        reg = regs[n_corte]
        reg_id = reg['id']
        modelo_id = reg['modelo_id']
        total_prendas = reg_totals.get(reg_id, 0)
        modelo_bom = bom.get(modelo_id, [])

        if not modelo_bom:
            print(f'  WARN: {n_corte} no BOM found, skipping')
            continue

        fecha = base_date + timedelta(days=salida_count % 10)
        print(f'\n--- {n_corte} ({reg["estado"]}) - {total_prendas:.0f} prendas ---')

        for bom_line in modelo_bom:
            item_id = bom_line['item_id']
            mat_type = get_material_type(bom_line['nombre'])

            if not should_consume(mat_type, plan_level):
                continue

            qty_needed = bom_line['qty_per_unit'] * total_prendas

            if bom_line['is_rollo']:
                # ---- ROLLO consumption (one salida per rollo consumed) ----
                remaining = qty_needed
                item_rollos = rollos_by_item.get(item_id, [])

                for rollo in item_rollos:
                    if remaining <= 0:
                        break
                    consume = min(remaining, rollo['disp'])
                    costo_total = round(consume * rollo['costo'], 2)

                    salida_id = str(uuid.uuid4())
                    detalle = json.dumps([{
                        'rollo_id': rollo['id'],
                        'cantidad': float(consume),
                        'costo_unitario': float(rollo['costo'])
                    }])

                    await conn.execute("""
                        INSERT INTO prod_inventario_salidas
                        (id, item_id, cantidad, registro_id, observaciones, rollo_id,
                         costo_total, detalle_fifo, fecha, empresa_id, tipo)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9, 7, 'PRODUCCION')
                    """, salida_id, item_id, consume, reg_id,
                        f'Consumo {bom_line["nombre"]} para {n_corte}',
                        rollo['id'], costo_total, detalle, fecha)

                    # Update rollo
                    await conn.execute(
                        "UPDATE prod_inventario_rollos SET metraje_disponible = metraje_disponible - $1 WHERE id = $2",
                        consume, rollo['id'])
                    rollo['disp'] -= consume

                    # Update ingreso
                    await conn.execute(
                        "UPDATE prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2",
                        consume, rollo['ingreso_id'])

                    remaining -= consume
                    salida_count += 1
                    print(f'  Salida: {bom_line["nombre"]} rollo {consume:.1f}m (S/{costo_total:.2f})')

                # Update item stock
                consumed = qty_needed - max(remaining, 0)
                if consumed > 0:
                    await conn.execute(
                        "UPDATE prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                        consumed, item_id)

            else:
                # ---- NON-ROLLO consumption (one salida total, FIFO layers) ----
                remaining = qty_needed
                item_ings = ingresos_by_item.get(item_id, [])
                detalle_layers = []
                costo_total = 0

                for ing in item_ings:
                    if remaining <= 0:
                        break
                    consume = min(remaining, ing['disp'])
                    layer_cost = round(consume * ing['costo'], 2)
                    costo_total += layer_cost
                    detalle_layers.append({
                        'ingreso_id': ing['id'],
                        'cantidad': float(consume),
                        'costo_unitario': float(ing['costo'])
                    })

                    await conn.execute(
                        "UPDATE prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2",
                        consume, ing['id'])
                    ing['disp'] -= consume
                    remaining -= consume

                consumed = qty_needed - max(remaining, 0)
                if consumed > 0:
                    salida_id = str(uuid.uuid4())
                    await conn.execute("""
                        INSERT INTO prod_inventario_salidas
                        (id, item_id, cantidad, registro_id, observaciones,
                         costo_total, detalle_fifo, fecha, empresa_id, tipo)
                        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8, 7, 'PRODUCCION')
                    """, salida_id, item_id, consumed, reg_id,
                        f'Consumo {bom_line["nombre"]} para {n_corte}',
                        costo_total, json.dumps(detalle_layers), fecha)

                    await conn.execute(
                        "UPDATE prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                        consumed, item_id)

                    salida_count += 1
                    print(f'  Salida: {bom_line["nombre"]} {consumed:.2f} (S/{costo_total:.2f})')

        # ---- Create/update requerimiento_mp ----
        existing_req = await conn.fetch(
            'SELECT item_id FROM prod_registro_requerimiento_mp WHERE registro_id = $1', reg_id)
        existing_items = {r['item_id'] for r in existing_req}

        for bom_line in modelo_bom:
            item_id = bom_line['item_id']
            qty_required = bom_line['qty_per_unit'] * total_prendas
            mat_type = get_material_type(bom_line['nombre'])
            qty_consumed = qty_required if should_consume(mat_type, plan_level) else 0

            if qty_consumed >= qty_required:
                estado = 'COMPLETO'
            elif qty_consumed > 0:
                estado = 'PARCIAL'
            else:
                estado = 'PENDIENTE'

            if item_id in existing_items:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_consumida = $1, estado = $2, cantidad_requerida = $3
                    WHERE registro_id = $4 AND item_id = $5
                """, qty_consumed, estado, qty_required, reg_id, item_id)
            else:
                req_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_registro_requerimiento_mp
                    (id, registro_id, item_id, cantidad_requerida, cantidad_reservada,
                     cantidad_consumida, estado, empresa_id)
                    VALUES ($1,$2,$3,$4,0,$5,$6, 7)
                """, req_id, reg_id, item_id, qty_required, qty_consumed, estado)
                req_count += 1

    # ======== VERIFY ========
    total_salidas = await conn.fetchval('SELECT COUNT(*) FROM prod_inventario_salidas')
    print(f'\n\n{"="*50}')
    print(f'  RESUMEN')
    print(f'{"="*50}')
    print(f'  Salidas creadas: {total_salidas}')
    print(f'  Requerimientos MP nuevos: {req_count}')

    rows = await conn.fetch('SELECT nombre, stock_actual FROM prod_inventario ORDER BY nombre')
    print(f'\n  STOCK ACTUALIZADO:')
    for r in rows:
        print(f'    {r["nombre"]}: {r["stock_actual"]}')

    rows = await conn.fetch("""
        SELECT r.n_corte, i.nombre, rm.cantidad_requerida, rm.cantidad_consumida, rm.estado
        FROM prod_registro_requerimiento_mp rm
        JOIN prod_inventario i ON i.id = rm.item_id
        JOIN prod_registros r ON r.id = rm.registro_id
        ORDER BY r.n_corte, i.nombre
    """)
    print(f'\n  REQUERIMIENTO MP:')
    for r in rows:
        print(f'    {r["n_corte"]} | {r["nombre"]} | req={r["cantidad_requerida"]} | cons={r["cantidad_consumida"]} | {r["estado"]}')

    await conn.close()
    print(f'\n✅ Salidas de materiales creadas exitosamente!')


if __name__ == '__main__':
    asyncio.run(main())
