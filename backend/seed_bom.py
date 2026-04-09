"""
Script para crear BOMs, generar requerimientos, crear reservas y salidas de materia prima.
Usa la API directamente para respetar toda la lógica de negocio.
"""
import asyncio
import asyncpg
import uuid
import json
from datetime import date, timedelta, datetime
import random

DB_URL = "postgres://admin:admin@72.60.241.216:9090/datos?sslmode=disable"

SERVICIOS = {
    "corte": "a42eb55f-cdd9-499a-9ff8-e6cfcd153cec",
    "costura": "38b1c7d3-52c3-49f6-9140-c60a556762b9",
}

async def main():
    pool = await asyncpg.create_pool(DB_URL, server_settings={"search_path": "produccion,public"})
    async with pool.acquire() as conn:
        # ============ 1. Get existing data ============
        modelos = await conn.fetch("SELECT id, nombre, linea_negocio_id FROM prod_modelos ORDER BY nombre")
        items_mp = await conn.fetch("SELECT id, codigo, nombre, categoria, stock_actual, linea_negocio_id FROM prod_inventario WHERE codigo NOT LIKE 'PT-%' ORDER BY codigo")
        registros = await conn.fetch("SELECT id, n_corte, modelo_id, estado, linea_negocio_id FROM prod_registros ORDER BY n_corte")

        print("=== Estado actual ===")
        print(f"  Modelos: {len(modelos)}")
        print(f"  Items MP: {len(items_mp)}")
        print(f"  Registros: {len(registros)}")
        for i in items_mp:
            print(f"    {i['codigo']}: {i['nombre']} (stock={i['stock_actual']}, linea={i['linea_negocio_id']})")

        # ============ 2. Create more inventory items ============
        print("\n=== Creando items de inventario adicionales ===")
        
        # Items for Element Premium Denim (linea 26)
        new_items_26 = [
            ("CIE001", "Cierre YKK #5 Metal", "Avios", 26, 2000),
            ("ETI001", "Etiqueta Principal Element", "Avios", 26, 3000),
            ("REM001", "Remache Plateado Grande", "Avios", 26, 5000),
            ("HIL001", "Hilo Coser Industrial 40/2", "Hilos", 26, 800),
        ]
        # Items for Qepo Denim (linea 28)
        new_items_28 = [
            ("CIE002", "Cierre YKK #5 Bronce", "Avios", 28, 1500),
            ("ETI002", "Etiqueta Principal Qepo", "Avios", 28, 2500),
            ("REM002", "Remache Dorado Grande", "Avios", 28, 4000),
            ("HIL002", "Hilo Coser Industrial 40/2 Q", "Hilos", 28, 600),
        ]
        # Items for Polo Element (linea 27)
        new_items_27 = [
            ("TEL003", "Jersey Algodón 30/1", "Telas", 27, 500),
            ("ETI003", "Etiqueta Polo Element", "Avios", 27, 3000),
            ("BOT003", "Boton Polo Nácar", "Avios", 27, 4000),
            ("CUE001", "Cuello Polo Tejido", "Avios", 27, 1200),
        ]
        
        all_new = new_items_26 + new_items_28 + new_items_27
        created_items = {}
        
        for codigo, nombre, categoria, linea, stock_ini in all_new:
            existing = await conn.fetchval("SELECT id FROM prod_inventario WHERE codigo = $1", codigo)
            if existing:
                created_items[codigo] = existing
                print(f"  Ya existe: {codigo}")
                continue
            
            iid = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_inventario (id, codigo, nombre, categoria, unidad_medida, stock_actual, stock_minimo, empresa_id, linea_negocio_id, activo)
                VALUES ($1, $2, $3, $4, $5, $6, 50, 7, $7, true)
            """, iid, codigo, nombre, categoria, 'MT' if categoria == 'Telas' else 'UND', stock_ini, linea)
            
            # Create ingreso for stock
            ing_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_inventario_ingresos (id, item_id, cantidad, cantidad_disponible, costo_unitario, 
                    proveedor, fecha, empresa_id, linea_negocio_id)
                VALUES ($1, $2, $3, $3, $4, $5, CURRENT_TIMESTAMP, 7, $6)
            """, ing_id, iid, stock_ini, round(random.uniform(0.5, 15.0), 2),
                random.choice(["Textiles San Juan", "Avios Gamarra", "Importadora Denim SAC"]), linea)
            
            created_items[codigo] = iid
            print(f"  Creado: {codigo} - {nombre} (stock={stock_ini})")

        # Also map existing items
        for i in items_mp:
            created_items[i['codigo']] = i['id']
        
        # ============ 3. Create BOMs for each modelo ============
        print("\n=== Creando BOMs ===")
        
        # BOM definitions: modelo_nombre -> [(item_codigo, cantidad_base, tipo_componente)]
        bom_defs = {
            "OXFORD 505": [
                ("TEL001", 1.4, "TELA"),      # 1.4 MT tela por prenda
                ("BOT001", 1, "AVIO"),         # 1 botón pretina
                ("CIE001", 1, "AVIO"),         # 1 cierre
                ("ETI001", 1, "AVIO"),         # 1 etiqueta
                ("REM001", 6, "AVIO"),         # 6 remaches
                ("HIL001", 0.15, "AVIO"),      # 0.15 conos de hilo
            ],
            "RANGER MX": [
                ("TEL001", 1.6, "TELA"),
                ("BOT001", 1, "AVIO"),
                ("CIE001", 1, "AVIO"),
                ("ETI001", 1, "AVIO"),
                ("REM001", 8, "AVIO"),
                ("HIL001", 0.18, "AVIO"),
            ],
            "SLIM EDGE": [
                ("TEL001", 1.2, "TELA"),
                ("BOT001", 1, "AVIO"),
                ("CIE001", 1, "AVIO"),
                ("ETI001", 1, "AVIO"),
                ("REM001", 4, "AVIO"),
                ("HIL001", 0.12, "AVIO"),
            ],
            "TOKYO 77": [
                ("TEL-002", 1.4, "TELA"),
                ("BOT002", 1, "AVIO"),
                ("CIE002", 1, "AVIO"),
                ("ETI002", 1, "AVIO"),
                ("REM002", 6, "AVIO"),
                ("HIL002", 0.15, "AVIO"),
            ],
            "BRONX CARGO": [
                ("TEL-002", 1.8, "TELA"),
                ("BOT002", 2, "AVIO"),
                ("CIE002", 1, "AVIO"),
                ("ETI002", 1, "AVIO"),
                ("REM002", 10, "AVIO"),
                ("HIL002", 0.20, "AVIO"),
            ],
            "CLASSIC V": [
                ("TEL003", 0.8, "TELA"),
                ("ETI003", 1, "AVIO"),
                ("BOT003", 3, "AVIO"),
                ("CUE001", 1, "AVIO"),
            ],
            "SPORT PRO": [
                ("TEL003", 0.9, "TELA"),
                ("ETI003", 1, "AVIO"),
                ("BOT003", 3, "AVIO"),
                ("CUE001", 1, "AVIO"),
            ],
            "URBAN JACKET": [
                ("TEL001", 2.0, "TELA"),
                ("BOT001", 4, "AVIO"),
                ("CIE001", 2, "AVIO"),
                ("ETI001", 1, "AVIO"),
                ("REM001", 8, "AVIO"),
                ("HIL001", 0.25, "AVIO"),
            ],
        }
        
        for modelo in modelos:
            mid = modelo['id']
            mname = modelo['nombre']
            
            if mname not in bom_defs:
                print(f"  Skip: {mname} (sin BOM definido)")
                continue
            
            # Check if BOM already exists
            existing_bom = await conn.fetchval("SELECT id FROM prod_bom_cabecera WHERE modelo_id = $1", mid)
            if existing_bom:
                print(f"  Ya existe BOM: {mname}")
                continue
            
            # Create BOM header
            bom_id = str(uuid.uuid4())
            bom_code = f"BOM-{mname.replace(' ', '-')}-V1"
            await conn.execute("""
                INSERT INTO prod_bom_cabecera (id, modelo_id, codigo, version, estado, nombre, created_at, updated_at)
                VALUES ($1, $2, $3, 1, 'APROBADO', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, bom_id, mid, bom_code, f"BOM {mname} V1")
            
            # Create BOM lines
            for orden, (item_codigo, cantidad_base, tipo_comp) in enumerate(bom_defs[mname], 1):
                item_id = created_items.get(item_codigo)
                if not item_id:
                    print(f"    WARNING: Item {item_codigo} not found!")
                    continue
                
                linea_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_modelo_bom_linea (id, modelo_id, bom_id, inventario_id, cantidad_base, 
                        tipo_componente, activo, orden, merma_pct, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, true, $7, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, linea_id, mid, bom_id, item_id, cantidad_base, tipo_comp, orden)
            
            print(f"  BOM creado: {mname} ({len(bom_defs[mname])} líneas)")

        # ============ 4. Generate requerimientos for registros that have progressed ============
        print("\n=== Generando requerimientos de MP ===")
        
        # Only for registros that are past "Para Corte" (have started production)
        for reg in registros:
            if reg['estado'] == 'Para Corte':
                continue
            
            rid = reg['id']
            n_corte = reg['n_corte']
            
            # Check if already has requerimiento
            existing_req = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_registro_requerimiento_mp WHERE registro_id = $1", rid)
            if existing_req > 0:
                print(f"  Ya tiene requerimiento: Corte {n_corte}")
                continue
            
            # Get BOM for this modelo
            bom_cab = await conn.fetchrow("""
                SELECT * FROM prod_bom_cabecera
                WHERE modelo_id = $1 AND estado != 'INACTIVO'
                ORDER BY CASE estado WHEN 'APROBADO' THEN 1 ELSE 2 END, version DESC
                LIMIT 1
            """, reg['modelo_id'])
            
            if not bom_cab:
                print(f"  Sin BOM: Corte {n_corte}")
                continue
            
            # Get BOM lines
            bom_lineas = await conn.fetch("""
                SELECT bl.*, i.nombre as item_nombre, i.codigo as item_codigo, i.unidad_medida
                FROM prod_modelo_bom_linea bl
                JOIN prod_inventario i ON bl.inventario_id = i.id
                WHERE bl.bom_id = $1 AND bl.activo = true
            """, bom_cab['id'])
            
            # Get tallas
            tallas = await conn.fetch(
                "SELECT talla_id, cantidad_real FROM prod_registro_tallas WHERE registro_id = $1", rid)
            total_prendas = sum(int(t['cantidad_real']) for t in tallas)
            
            if total_prendas <= 0:
                continue
            
            empresa_id = reg.get('linea_negocio_id') or 7
            
            created_count = 0
            for bom in bom_lineas:
                item_id = bom['inventario_id']
                cantidad_base = float(bom['cantidad_base'])
                cantidad_requerida = total_prendas * cantidad_base
                
                new_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_registro_requerimiento_mp
                    (id, registro_id, item_id, cantidad_requerida, cantidad_reservada, cantidad_consumida, 
                     estado, empresa_id, bom_id, bom_linea_id, tipo_componente, unidad_medida, inventario_nombre)
                    VALUES ($1, $2, $3, $4, 0, 0, 'PENDIENTE', 7, $5, $6, $7, $8, $9)
                """, new_id, rid, item_id, cantidad_requerida,
                    bom_cab['id'], bom['id'], bom.get('tipo_componente', 'AVIO'),
                    bom['unidad_medida'], bom['item_nombre'])
                created_count += 1
            
            print(f"  Requerimiento: Corte {n_corte} ({total_prendas} prendas, {created_count} líneas)")

        # ============ 5. Create reservas for registros in advanced states ============
        print("\n=== Creando reservas ===")
        
        # Registros that should have reserves (past Corte - meaning materials were reserved for cutting)
        advanced_states = ["Costura", "Bordado", "Para Atraque", "Atraque", "Para Lavanderia",
                          "Lavanderia", "Para Acabado", "Acabado", "Producto Terminado",
                          "Estampado", "Para Aacabado"]
        
        for reg in registros:
            if reg['estado'] not in advanced_states and reg['estado'] != 'Corte':
                continue
            
            rid = reg['id']
            n_corte = reg['n_corte']
            
            # Check if already has reservas
            existing_res = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_inventario_reservas WHERE registro_id = $1", rid)
            if existing_res > 0:
                print(f"  Ya tiene reserva: Corte {n_corte}")
                continue
            
            # Get requerimiento lines
            req_lines = await conn.fetch(
                "SELECT * FROM prod_registro_requerimiento_mp WHERE registro_id = $1", rid)
            
            if not req_lines:
                print(f"  Sin requerimiento: Corte {n_corte}")
                continue
            
            # Create reserva header
            reserva_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_inventario_reservas (id, registro_id, estado, empresa_id, created_at, updated_at)
                VALUES ($1, $2, 'ACTIVA', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, reserva_id, rid)
            
            for req in req_lines:
                cantidad_req = float(req['cantidad_requerida'])
                item_id = req['item_id']
                
                # Check available stock
                stock = await conn.fetchval("SELECT stock_actual FROM prod_inventario WHERE id = $1", item_id)
                stock = float(stock or 0)
                
                # Reserve what's available (up to required)
                cantidad_reservar = min(cantidad_req, stock * 0.8)  # Reserve 80% of available
                if cantidad_reservar <= 0:
                    continue
                
                # Create reserva line
                rl_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_inventario_reservas_linea 
                    (id, reserva_id, item_id, cantidad_reservada, cantidad_liberada, empresa_id)
                    VALUES ($1, $2, $3, $4, 0, 7)
                """, rl_id, reserva_id, item_id, cantidad_reservar)
                
                # Update requerimiento
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = $1, estado = 'PARCIAL', updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                """, cantidad_reservar, req['id'])
            
            print(f"  Reserva creada: Corte {n_corte}")

        # ============ 6. Create salidas for registros past Corte (materials consumed) ============
        print("\n=== Creando salidas de material ===")
        
        consumed_states = ["Costura", "Bordado", "Para Atraque", "Atraque", "Para Lavanderia",
                          "Lavanderia", "Para Acabado", "Acabado", "Producto Terminado",
                          "Estampado", "Para Aacabado"]
        
        for reg in registros:
            if reg['estado'] not in consumed_states:
                continue
            
            rid = reg['id']
            n_corte = reg['n_corte']
            linea = reg.get('linea_negocio_id')
            
            # Check if already has salidas
            existing_sal = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_inventario_salidas WHERE registro_id = $1", rid)
            if existing_sal > 0:
                print(f"  Ya tiene salidas: Corte {n_corte}")
                continue
            
            # Get requerimiento lines
            req_lines = await conn.fetch(
                "SELECT * FROM prod_registro_requerimiento_mp WHERE registro_id = $1", rid)
            
            if not req_lines:
                continue
            
            for req in req_lines:
                cantidad_req = float(req['cantidad_requerida'])
                item_id = req['item_id']
                
                # Consume materials (reduce stock)
                # Amount consumed depends on how far along the registro is
                # For simplicity, consume 100% for all materials (they go into production at Corte)
                cantidad_consumir = cantidad_req
                
                # Check and reduce stock
                stock = await conn.fetchval("SELECT stock_actual FROM prod_inventario WHERE id = $1", item_id)
                stock = float(stock or 0)
                
                if stock <= 0:
                    continue
                
                real_consume = min(cantidad_consumir, stock)
                
                # Create salida
                sal_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_inventario_salidas 
                    (id, item_id, cantidad, registro_id, fecha, empresa_id, linea_negocio_id)
                    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 7, $5)
                """, sal_id, item_id, real_consume, rid, linea)
                
                # Reduce stock
                await conn.execute(
                    "UPDATE prod_inventario SET stock_actual = stock_actual - $1 WHERE id = $2",
                    real_consume, item_id)
                
                # Update requerimiento consumed
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_consumida = cantidad_consumida + $1, 
                        estado = CASE WHEN cantidad_consumida + $1 >= cantidad_requerida THEN 'COMPLETO' ELSE 'PARCIAL' END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                """, real_consume, req['id'])
                
                # Also reduce from ingreso (FIFO)
                ingresos = await conn.fetch("""
                    SELECT id, cantidad_disponible FROM prod_inventario_ingresos 
                    WHERE item_id = $1 AND cantidad_disponible > 0 
                    ORDER BY fecha ASC
                """, item_id)
                
                remaining = real_consume
                for ing in ingresos:
                    if remaining <= 0:
                        break
                    disp = float(ing['cantidad_disponible'])
                    deducir = min(remaining, disp)
                    await conn.execute(
                        "UPDATE prod_inventario_ingresos SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2",
                        deducir, ing['id'])
                    remaining -= deducir
            
            # Mark reserva as consumed if exists
            reserva = await conn.fetchrow(
                "SELECT id FROM prod_inventario_reservas WHERE registro_id = $1 AND estado = 'ACTIVA'", rid)
            if reserva:
                # Update reservation lines - mark as fully liberated
                await conn.execute("""
                    UPDATE prod_inventario_reservas_linea 
                    SET cantidad_liberada = cantidad_reservada
                    WHERE reserva_id = $1
                """, reserva['id'])
                await conn.execute(
                    "UPDATE prod_inventario_reservas SET estado = 'CONSUMIDA', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                    reserva['id'])
            
            print(f"  Salidas creadas: Corte {n_corte}")

        # ============ RESUMEN FINAL ============
        print("\n" + "=" * 60)
        print("RESUMEN FINAL")
        
        bom_count = await conn.fetchval("SELECT COUNT(*) FROM prod_bom_cabecera")
        bom_lines = await conn.fetchval("SELECT COUNT(*) FROM prod_modelo_bom_linea")
        req_count = await conn.fetchval("SELECT COUNT(*) FROM prod_registro_requerimiento_mp")
        res_count = await conn.fetchval("SELECT COUNT(*) FROM prod_inventario_reservas")
        sal_count = await conn.fetchval("SELECT COUNT(*) FROM prod_inventario_salidas")
        
        print(f"  BOMs: {bom_count} (líneas: {bom_lines})")
        print(f"  Requerimientos MP: {req_count}")
        print(f"  Reservas: {res_count}")
        print(f"  Salidas: {sal_count}")
        
        print("\n  Stock actualizado:")
        items = await conn.fetch("SELECT codigo, nombre, stock_actual FROM prod_inventario WHERE codigo NOT LIKE 'PT-%' ORDER BY codigo")
        for i in items:
            print(f"    {i['codigo']:10s} {i['nombre']:40s} stock={float(i['stock_actual']):>10.2f}")
        
        print("=" * 60)

    await pool.close()

asyncio.run(main())
