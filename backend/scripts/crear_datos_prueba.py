"""
Script de pruebas: Crea datos de ejemplo y testea flujos completos
"""
import asyncio
import asyncpg
import uuid
import json
from datetime import date, timedelta

DATABASE_URL = "postgres://admin:admin@72.60.241.216:9090/datos?sslmode=disable"
EMPRESA_ID = 6

async def main():
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        print("=" * 60)
        print("PASO 1: Asignar costos unitarios a ingresos existentes")
        print("=" * 60)
        
        # Get existing ingresos without costo_unitario
        ingresos = await conn.fetch("""
            SELECT i.id, i.item_id, inv.codigo, inv.nombre, i.cantidad, i.costo_unitario
            FROM produccion.prod_inventario_ingresos i
            JOIN produccion.prod_inventario inv ON i.item_id = inv.id
            ORDER BY inv.codigo
        """)
        
        # Precios realistas por item
        precios = {
            'EBT-001': 0.15,   # Botón dorado: S/ 0.15 c/u
            'ECR-001': 2.50,   # Cierre N12: S/ 2.50 c/u
            'ENL-001': 0.80,   # Nylon 28: S/ 0.80 c/u
            'ENL-002': 0.80,   # Nylon 30: S/ 0.80
            'ENL-003': 0.80,   # Nylon 32: S/ 0.80
            'ENL-004': 0.80,   # Nylon 34: S/ 0.80
            'TEL-01': 16.00,   # Tela DR1100: S/ 16.00 por metro
        }
        
        for ing in ingresos:
            codigo = ing['codigo']
            precio = precios.get(codigo, 1.0)
            if ing['costo_unitario'] is None or float(ing['costo_unitario']) == 0:
                await conn.execute("""
                    UPDATE produccion.prod_inventario_ingresos 
                    SET costo_unitario = $1 WHERE id = $2
                """, precio, ing['id'])
                print(f"  {codigo} ({ing['nombre']}): costo_unit = S/ {precio}")
            else:
                print(f"  {codigo}: ya tiene costo S/ {float(ing['costo_unitario']):.2f}")
        
        print("\n" + "=" * 60)
        print("PASO 2: Crear items de Producto Terminado (PT)")
        print("=" * 60)
        
        pt_items = [
            ('PT-001', 'Pantalón Denim Eduard', 'PT', 'unidad'),
            ('PT-002', 'Jean Slim Fit Premium', 'PT', 'unidad'),
            ('PT-003', 'Pantalón Cargo Comfort', 'PT', 'unidad'),
        ]
        
        pt_ids = {}
        for codigo, nombre, tipo, unidad in pt_items:
            existing = await conn.fetchrow(
                "SELECT id FROM produccion.prod_inventario WHERE codigo = $1", codigo
            )
            if existing:
                pt_ids[codigo] = existing['id']
                print(f"  {codigo} ya existe (id: {existing['id'][:8]}...)")
            else:
                item_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO produccion.prod_inventario 
                    (id, codigo, nombre, tipo_articulo, unidad_medida, stock_actual, empresa_id, control_por_rollos)
                    VALUES ($1, $2, $3, $4, $5, 0, $6, false)
                """, item_id, codigo, nombre, tipo, unidad, EMPRESA_ID)
                pt_ids[codigo] = item_id
                print(f"  CREADO {codigo} - {nombre} (id: {item_id[:8]}...)")
        
        print("\n" + "=" * 60)
        print("PASO 3: Asignar PT-001 al Registro #01 y agregar costos")
        print("=" * 60)
        
        # Get registro 01
        reg01 = await conn.fetchrow(
            "SELECT id, n_corte, estado FROM produccion.prod_registros WHERE n_corte = '01'"
        )
        if not reg01:
            print("  ERROR: Registro 01 no encontrado!")
            return
        
        reg01_id = reg01['id']
        print(f"  Registro #01 id: {reg01_id[:8]}... estado: {reg01['estado']}")
        
        # Assign PT
        await conn.execute(
            "UPDATE produccion.prod_registros SET pt_item_id = $1 WHERE id = $2",
            pt_ids['PT-001'], reg01_id
        )
        print(f"  Asignado PT-001 al registro #01")
        
        # Add service costs
        costos = [
            ('Servicio de Corte', 'Taller San Martín', 450.00),
            ('Servicio de Costura', 'Confecciones Lima SAC', 1200.00),
            ('Servicio de Lavandería', 'Lavandería Industrial Perú', 350.00),
            ('Servicio de Acabado', 'Acabados Premium EIRL', 280.00),
        ]
        
        # Clean existing costos first
        await conn.execute(
            "DELETE FROM produccion.prod_registro_costos_servicio WHERE registro_id = $1",
            reg01_id
        )
        
        for desc, prov, monto in costos:
            costo_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO produccion.prod_registro_costos_servicio 
                (id, empresa_id, registro_id, fecha, descripcion, proveedor_texto, monto)
                VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)
            """, costo_id, EMPRESA_ID, reg01_id, desc, prov, monto)
            print(f"  Costo: {desc} - {prov}: S/ {monto:.2f}")
        
        total_costos = sum(c[2] for c in costos)
        print(f"  TOTAL COSTOS SERVICIO: S/ {total_costos:.2f}")
        
        print("\n" + "=" * 60)
        print("PASO 4: Registrar salidas de MP (consumos valorizados FIFO)")
        print("=" * 60)
        
        # Get requerimiento lines
        req_lines = await conn.fetch("""
            SELECT rm.id, rm.item_id, rm.talla_id, rm.cantidad_requerida, 
                   inv.codigo, inv.nombre, inv.control_por_rollos
            FROM produccion.prod_registro_requerimiento_mp rm
            JOIN produccion.prod_inventario inv ON rm.item_id = inv.id
            WHERE rm.registro_id = $1
            ORDER BY inv.codigo
        """, reg01_id)
        
        total_costo_mp = 0
        for line in req_lines:
            cantidad = float(line['cantidad_requerida'])
            
            if line['control_por_rollos']:
                # For rolls, consume from rollos
                rollos = await conn.fetch("""
                    SELECT id, numero_rollo, metraje_disponible 
                    FROM produccion.prod_inventario_rollos
                    WHERE item_id = $1 AND activo = true AND metraje_disponible > 0
                    ORDER BY created_at ASC
                """, line['item_id'])
                
                remaining = cantidad
                for rollo in rollos:
                    if remaining <= 0:
                        break
                    consume = min(remaining, float(rollo['metraje_disponible']))
                    
                    ingreso = await conn.fetchrow("""
                        SELECT id, costo_unitario, cantidad_disponible
                        FROM produccion.prod_inventario_ingresos
                        WHERE item_id = $1 AND cantidad_disponible > 0
                        ORDER BY fecha ASC
                        LIMIT 1
                    """, line['item_id'])
                    
                    costo_unit = float(ingreso['costo_unitario']) if ingreso else 0
                    costo_total = consume * costo_unit
                    total_costo_mp += costo_total
                    
                    sal_id = str(uuid.uuid4())
                    await conn.execute("""
                        INSERT INTO produccion.prod_inventario_salidas
                        (id, item_id, cantidad, registro_id, costo_total, fecha, rollo_id, empresa_id, detalle_fifo)
                        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8)
                    """, sal_id, line['item_id'], consume, reg01_id, costo_total,
                        rollo['id'], EMPRESA_ID,
                        json.dumps([{"ingreso_id": ingreso['id'], "cantidad": consume, "costo_unitario": costo_unit}]))
                    
                    await conn.execute(
                        "UPDATE produccion.prod_inventario_rollos SET metraje_disponible = metraje_disponible - $1 WHERE id = $2",
                        consume, rollo['id'])
                    await conn.execute(
                        "UPDATE produccion.prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2",
                        consume, ingreso['id'])
                    await conn.execute(
                        "UPDATE produccion.prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                        consume, line['item_id'])
                    
                    print(f"  {line['codigo']}: Rollo #{rollo['numero_rollo']} - {consume:.2f}m x S/{costo_unit:.2f} = S/ {costo_total:.2f}")
                    remaining -= consume
            else:
                # FIFO from ingresos
                remaining_qty = cantidad
                fifo_details = []
                costo_total_linea = 0
                
                ingresos_fifo = await conn.fetch("""
                    SELECT id, costo_unitario, cantidad_disponible
                    FROM produccion.prod_inventario_ingresos
                    WHERE item_id = $1 AND cantidad_disponible > 0
                    ORDER BY fecha ASC
                """, line['item_id'])
                
                for ing in ingresos_fifo:
                    if remaining_qty <= 0:
                        break
                    take = min(remaining_qty, float(ing['cantidad_disponible']))
                    cu = float(ing['costo_unitario']) if ing['costo_unitario'] else 0
                    costo = take * cu
                    costo_total_linea += costo
                    fifo_details.append({"ingreso_id": ing['id'], "cantidad": take, "costo_unitario": cu})
                    await conn.execute(
                        "UPDATE produccion.prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2",
                        take, ing['id'])
                    remaining_qty -= take
                
                total_costo_mp += costo_total_linea
                
                sal_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO produccion.prod_inventario_salidas
                    (id, item_id, cantidad, registro_id, costo_total, fecha, empresa_id, detalle_fifo)
                    VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7)
                """, sal_id, line['item_id'], cantidad, reg01_id, costo_total_linea,
                    EMPRESA_ID, json.dumps(fifo_details))
                
                await conn.execute(
                    "UPDATE produccion.prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                    cantidad, line['item_id'])
                
                print(f"  {line['codigo']}: {cantidad:.0f} uds FIFO = S/ {costo_total_linea:.2f}")
        
        print(f"\n  TOTAL COSTO MP (FIFO): S/ {total_costo_mp:.2f}")
        print(f"  TOTAL COSTOS SERVICIO: S/ {total_costos:.2f}")
        print(f"  COSTO TOTAL REGISTRO:  S/ {total_costo_mp + total_costos:.2f}")
        print(f"  COSTO UNIT PT (350 prendas): S/ {(total_costo_mp + total_costos) / 350:.4f}")
        
        print("\n" + "=" * 60)
        print("PASO 5: Crear Registro #02 con datos diferentes")
        print("=" * 60)
        
        modelo_id = 'f5d3b229-7a6b-4d62-888d-80f60c3b1f73'
        reg02_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO produccion.prod_registros 
            (id, n_corte, modelo_id, curva, estado, urgente, fecha_creacion, empresa_id, pt_item_id, tallas, distribucion_colores)
            VALUES ($1, '02', $2, '3-4-4-3', 'Costura', false, $3, $4, $5, '[]', '[]')
        """, reg02_id, modelo_id, date.today() - timedelta(days=5), EMPRESA_ID, pt_ids['PT-002'])
        
        # Add tallas for reg 02
        tallas_cat = await conn.fetch("SELECT id, nombre FROM produccion.prod_tallas_catalogo ORDER BY orden LIMIT 4")
        cantidades_02 = [90, 120, 120, 90]
        for i, talla in enumerate(tallas_cat):
            talla_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO produccion.prod_registro_tallas 
                (id, registro_id, talla_id, cantidad_real, empresa_id)
                VALUES ($1, $2, $3, $4, $5)
            """, talla_id, reg02_id, talla['id'], cantidades_02[i], EMPRESA_ID)
        
        total_02 = sum(cantidades_02)
        print(f"  Registro #02: {total_02} prendas, estado: Costura, PT: PT-002")
        
        # Add service costs for reg 02
        costos_02 = [
            ('Corte', 'Taller San Martín', 520.00),
            ('Costura en proceso', 'Confecciones Lima SAC', 800.00),
        ]
        for desc, prov, monto in costos_02:
            cid = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO produccion.prod_registro_costos_servicio 
                (id, empresa_id, registro_id, fecha, descripcion, proveedor_texto, monto)
                VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)
            """, cid, EMPRESA_ID, reg02_id, desc, prov, monto)
        print(f"  Costos servicio: S/ {sum(c[2] for c in costos_02):.2f}")
        
        # Add some salidas for reg 02 (partial consumption)
        items_mp = await conn.fetch("""
            SELECT id, codigo, nombre FROM produccion.prod_inventario 
            WHERE tipo_articulo != 'PT' AND empresa_id = $1
            LIMIT 3
        """, EMPRESA_ID)
        
        for item in items_mp[:2]:
            ing = await conn.fetchrow("""
                SELECT id, costo_unitario, cantidad_disponible
                FROM produccion.prod_inventario_ingresos
                WHERE item_id = $1 AND cantidad_disponible > 0
                ORDER BY fecha ASC LIMIT 1
            """, item['id'])
            if ing:
                qty = 50.0
                cu = float(ing['costo_unitario'] or 0)
                sal_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO produccion.prod_inventario_salidas
                    (id, item_id, cantidad, registro_id, costo_total, fecha, empresa_id, detalle_fifo)
                    VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7)
                """, sal_id, item['id'], qty, reg02_id, qty * cu, EMPRESA_ID,
                    json.dumps([{"ingreso_id": ing['id'], "cantidad": qty, "costo_unitario": cu}]))
                await conn.execute(
                    "UPDATE produccion.prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                    qty, item['id'])
                await conn.execute(
                    "UPDATE produccion.prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2",
                    qty, ing['id'])
                print(f"  Salida: {item['codigo']} x {qty:.0f} = S/ {qty*cu:.2f}")
        
        print("\n" + "=" * 60)
        print("PASO 6: Crear Registro #03 (ya cerrado, con cierre completo)")
        print("=" * 60)
        
        reg03_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO produccion.prod_registros 
            (id, n_corte, modelo_id, curva, estado, urgente, fecha_creacion, empresa_id, pt_item_id, tallas, distribucion_colores)
            VALUES ($1, '03', $2, '2-3-3-2', 'CERRADA', false, $3, $4, $5, '[]', '[]')
        """, reg03_id, modelo_id, date.today() - timedelta(days=15), EMPRESA_ID, pt_ids['PT-003'])
        
        # Add tallas for reg 03
        cantidades_03 = [60, 90, 90, 60]
        for i, talla in enumerate(tallas_cat):
            tid = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO produccion.prod_registro_tallas 
                (id, registro_id, talla_id, cantidad_real, empresa_id)
                VALUES ($1, $2, $3, $4, $5)
            """, tid, reg03_id, talla['id'], cantidades_03[i], EMPRESA_ID)
        
        total_03 = sum(cantidades_03)
        
        # Costos servicio reg 03
        costos_03 = [
            ('Corte completo', 'Taller San Martín', 380.00),
            ('Costura completa', 'Confecciones Lima SAC', 950.00),
            ('Lavandería', 'Lavandería Industrial Perú', 280.00),
            ('Acabado', 'Acabados Premium EIRL', 200.00),
        ]
        total_serv_03 = 0
        for desc, prov, monto in costos_03:
            cid = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO produccion.prod_registro_costos_servicio 
                (id, empresa_id, registro_id, fecha, descripcion, proveedor_texto, monto)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            """, cid, EMPRESA_ID, reg03_id, date.today() - timedelta(days=3), desc, prov, monto)
            total_serv_03 += monto
        
        # Simular salidas FIFO para reg 03
        costo_mp_03 = 0
        sim_items = [
            ('EBT-001', 300.0),
            ('ECR-001', 300.0),
            ('ENL-001', 60.0),
            ('ENL-002', 90.0),
            ('ENL-003', 90.0),
            ('ENL-004', 60.0),
        ]
        for codigo, qty in sim_items:
            item = await conn.fetchrow(
                "SELECT id FROM produccion.prod_inventario WHERE codigo = $1", codigo)
            if item:
                ing = await conn.fetchrow("""
                    SELECT id, costo_unitario, cantidad_disponible
                    FROM produccion.prod_inventario_ingresos
                    WHERE item_id = $1 AND cantidad_disponible > 0
                    ORDER BY fecha ASC LIMIT 1
                """, item['id'])
                if ing:
                    cu = float(ing['costo_unitario'] or 0)
                    ct = qty * cu
                    costo_mp_03 += ct
                    sid = str(uuid.uuid4())
                    await conn.execute("""
                        INSERT INTO produccion.prod_inventario_salidas
                        (id, item_id, cantidad, registro_id, costo_total, fecha, empresa_id, detalle_fifo)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """, sid, item['id'], qty, reg03_id, ct,
                        date.today() - timedelta(days=5), EMPRESA_ID,
                        json.dumps([{"ingreso_id": ing['id'], "cantidad": qty, "costo_unitario": cu}]))
                    await conn.execute(
                        "UPDATE produccion.prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                        qty, item['id'])
                    await conn.execute(
                        "UPDATE produccion.prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2",
                        qty, ing['id'])
        
        costo_total_03 = costo_mp_03 + total_serv_03
        costo_unit_03 = costo_total_03 / total_03
        
        print(f"  Registro #03: {total_03} prendas, estado: CERRADA, PT: PT-003")
        print(f"  Costo MP: S/ {costo_mp_03:.2f}")
        print(f"  Costo Serv: S/ {total_serv_03:.2f}")
        print(f"  Costo Total: S/ {costo_total_03:.2f}")
        print(f"  Costo Unit: S/ {costo_unit_03:.4f}")
        
        # Create cierre record
        cierre_id = str(uuid.uuid4())
        ingreso_pt_id = str(uuid.uuid4())
        
        # Create PT ingreso
        await conn.execute("""
            INSERT INTO produccion.prod_inventario_ingresos 
            (id, item_id, cantidad, cantidad_disponible, costo_unitario, 
             proveedor, numero_documento, observaciones, fecha, empresa_id,
             fin_origen_tipo, fin_origen_id, fin_numero_doc)
            VALUES ($1, $2, $3, $3, $4, 'PRODUCCIÓN', $5, $6, $7, $8, 'PROD_CIERRE', $9, $10)
        """, ingreso_pt_id, pt_ids['PT-003'], float(total_03), costo_unit_03,
            f'CIERRE-03', f'Cierre OP #03', date.today() - timedelta(days=2),
            EMPRESA_ID, reg03_id, 'OP-03')
        
        # Update PT stock
        await conn.execute("""
            UPDATE produccion.prod_inventario SET stock_actual = stock_actual + $1 WHERE id = $2
        """, float(total_03), pt_ids['PT-003'])
        
        # Create cierre
        await conn.execute("""
            INSERT INTO produccion.prod_registro_cierre 
            (id, empresa_id, registro_id, fecha, qty_terminada, costo_mp, 
             costo_servicios, costo_total, costo_unit_pt, pt_ingreso_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        """, cierre_id, EMPRESA_ID, reg03_id, date.today() - timedelta(days=2),
            float(total_03), costo_mp_03, total_serv_03, costo_total_03,
            costo_unit_03, ingreso_pt_id)
        
        print(f"  CIERRE creado: {total_03} prendas PT-003 ingresadas a stock")
        
        print("\n" + "=" * 60)
        print("RESUMEN FINAL")
        print("=" * 60)
        
        # Verify reports data
        mp_valor = await conn.fetchval("""
            SELECT COALESCE(SUM(ing.cantidad_disponible * ing.costo_unitario), 0)
            FROM produccion.prod_inventario_ingresos ing
            JOIN produccion.prod_inventario i ON ing.item_id = i.id
            WHERE i.tipo_articulo != 'PT' AND ing.cantidad_disponible > 0
        """)
        
        wip_count = await conn.fetchval("""
            SELECT COUNT(*) FROM produccion.prod_registros 
            WHERE empresa_id = $1 AND estado NOT IN ('CERRADA', 'ANULADA')
        """, EMPRESA_ID)
        
        pt_stock = await conn.fetch("""
            SELECT i.codigo, i.nombre, i.stock_actual 
            FROM produccion.prod_inventario i 
            WHERE i.tipo_articulo = 'PT'
        """)
        
        print(f"\n  Valor MP en inventario: S/ {float(mp_valor):.2f}")
        print(f"  Registros en WIP: {wip_count}")
        print(f"  PT en stock:")
        for pt in pt_stock:
            print(f"    {pt['codigo']} - {pt['nombre']}: {float(pt['stock_actual']):.0f} unidades")
        
        print("\n  REGISTROS:")
        regs = await conn.fetch("""
            SELECT r.n_corte, r.estado, r.pt_item_id, pt.codigo as pt_codigo,
                   (SELECT COUNT(*) FROM produccion.prod_registro_costos_servicio WHERE registro_id = r.id) as n_costos,
                   (SELECT COALESCE(SUM(monto),0) FROM produccion.prod_registro_costos_servicio WHERE registro_id = r.id) as total_serv,
                   (SELECT COALESCE(SUM(costo_total),0) FROM produccion.prod_inventario_salidas WHERE registro_id = r.id) as total_mp
            FROM produccion.prod_registros r
            LEFT JOIN produccion.prod_inventario pt ON r.pt_item_id = pt.id
            WHERE r.empresa_id = $1
            ORDER BY r.n_corte
        """, EMPRESA_ID)
        
        for r in regs:
            mp = float(r['total_mp'])
            serv = float(r['total_serv'])
            total = mp + serv
            print(f"    #{r['n_corte']} | {r['estado']:12s} | PT: {r['pt_codigo'] or 'Sin PT':10s} | MP: S/ {mp:>10.2f} | Serv: S/ {serv:>8.2f} | Total: S/ {total:>10.2f}")
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
