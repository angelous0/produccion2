"""
Script para poblar datos de simulación para el Reporte Operativo de Costura.
Crea: personas (costureros), modelos, registros, movimientos de costura e incidencias.
"""
import asyncio
import asyncpg
import uuid
import os
from datetime import date, timedelta, datetime, timezone

COSTURA_SERVICE_ID = "38b1c7d3-52c3-49f6-9140-c60a556762b9"
CORTE_SERVICE_ID = "a42eb55f-cdd9-499a-9ff8-e6cfcd153cec"
MARCA_ELEMENT = "6a7332a5-87b5-4827-8f6e-8025117fc71a"
MARCA_QEPO = "c70dac45-edde-444f-acb6-720715c38ddf"
TIPO_PANTALON = "d4ad8861-435f-4418-8002-3a7e95a57736"
ENTALLE_SEMI = "daae9245-799c-4e41-a1ff-6ad8800ceead"
ENTALLE_BAGGY = "f4901223-c56f-45a1-94d0-fd0d33271769"
TELA_RIGIDO = "361f5b2a-d93e-485b-ae58-d2707a0c5298"
RUTA_ID = "c7036e89-f636-4a8e-a353-cdd5f5f8010d"

# Motivos de incidencia
MOTIVO_CALIDAD = "8705cbf4-56b4-47d3-b447-ef61b2e89bd9"
MOTIVO_FALTA_MATERIAL = "775f7034-02d9-4189-83f0-c56e8ad16cab"
MOTIVO_RETRASO = "62a8c663-648c-4bfb-9691-c5887a09e91b"
MOTIVO_SIN_CAP = "9dc8af46-0406-4bd9-929b-f611c3e88c92"
MOTIVO_FALTA_AVIOS = "c87f2d34-a8cc-4761-a179-5e3c8ae09d94"

HOY = date.today()

async def main():
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        env_path = "/app/backend/.env"
        with open(env_path) as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    db_url = line.strip().split("=", 1)[1].strip('"')
    
    conn = await asyncpg.connect(db_url)
    print("Conectado a la BD")

    # ========== 1. Crear tipos adicionales ==========
    tipo_polo_id = str(uuid.uuid4())
    tipo_casaca_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO produccion.prod_tipos (id, nombre) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
    """, tipo_polo_id, "Polo Box")
    await conn.execute("""
        INSERT INTO produccion.prod_tipos (id, nombre) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
    """, tipo_casaca_id, "Casaca")
    # Re-fetch IDs in case they existed
    row = await conn.fetchrow("SELECT id FROM produccion.prod_tipos WHERE nombre = 'Polo Box'")
    tipo_polo_id = str(row['id'])
    row = await conn.fetchrow("SELECT id FROM produccion.prod_tipos WHERE nombre = 'Casaca'")
    tipo_casaca_id = str(row['id'])
    print(f"Tipos: Polo Box={tipo_polo_id}, Casaca={tipo_casaca_id}")

    # ========== 2. Crear entalle adicional ==========
    entalle_slim_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO produccion.prod_entalles (id, nombre) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
    """, entalle_slim_id, "Slim Fit")
    row = await conn.fetchrow("SELECT id FROM produccion.prod_entalles WHERE nombre = 'Slim Fit'")
    entalle_slim_id = str(row['id'])

    # ========== 3. Crear tela adicional ==========
    tela_stretch_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO produccion.prod_telas (id, nombre) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
    """, tela_stretch_id, "Stretch")
    row = await conn.fetchrow("SELECT id FROM produccion.prod_telas WHERE nombre = 'Stretch'")
    tela_stretch_id = str(row['id'])

    # ========== 4. Crear 6 personas (costureros) ==========
    personas = [
        {"nombre": "Maria Rodriguez", "tipo_persona": "INTERNO"},
        {"nombre": "Carlos Gutierrez", "tipo_persona": "EXTERNO"},
        {"nombre": "Ana Torres", "tipo_persona": "INTERNO"},
        {"nombre": "Luis Mendoza", "tipo_persona": "EXTERNO"},
        {"nombre": "Rosa Huaman", "tipo_persona": "INTERNO"},
        {"nombre": "Jorge Diaz", "tipo_persona": "EXTERNO"},
    ]
    persona_ids = []
    for p in personas:
        pid = str(uuid.uuid4())
        servicios = f'[{{"servicio_id": "{COSTURA_SERVICE_ID}", "tarifa": 0.35}}]'
        await conn.execute("""
            INSERT INTO produccion.prod_personas_produccion (id, nombre, tipo, telefono, email, direccion, servicios, activo, tipo_persona, created_at)
            VALUES ($1, $2, 'externo', '', '', '', $3::jsonb, true, $4, NOW())
            ON CONFLICT DO NOTHING
        """, pid, p["nombre"], servicios, p["tipo_persona"])
        # Re-fetch
        row = await conn.fetchrow("SELECT id FROM produccion.prod_personas_produccion WHERE nombre = $1", p["nombre"])
        if row:
            persona_ids.append(str(row['id']))
            print(f"  Persona: {p['nombre']} -> {row['id']}")
        else:
            persona_ids.append(pid)
    
    print(f"Total personas creadas/encontradas: {len(persona_ids)}")

    # ========== 5. Crear modelos adicionales ==========
    modelos = [
        {"nombre": "Classic 501", "marca_id": MARCA_ELEMENT, "tipo_id": TIPO_PANTALON, "entalle_id": ENTALLE_SEMI, "tela_id": TELA_RIGIDO},
        {"nombre": "Trendy X", "marca_id": MARCA_QEPO, "tipo_id": TIPO_PANTALON, "entalle_id": ENTALLE_BAGGY, "tela_id": tela_stretch_id},
        {"nombre": "Urban Pro", "marca_id": MARCA_ELEMENT, "tipo_id": tipo_casaca_id, "entalle_id": entalle_slim_id, "tela_id": TELA_RIGIDO},
        {"nombre": "Street 90", "marca_id": MARCA_QEPO, "tipo_id": TIPO_PANTALON, "entalle_id": ENTALLE_SEMI, "tela_id": tela_stretch_id},
        {"nombre": "Polo Essential", "marca_id": MARCA_ELEMENT, "tipo_id": tipo_polo_id, "entalle_id": ENTALLE_BAGGY, "tela_id": tela_stretch_id},
        {"nombre": "Denim Raw", "marca_id": MARCA_QEPO, "tipo_id": TIPO_PANTALON, "entalle_id": entalle_slim_id, "tela_id": TELA_RIGIDO},
        {"nombre": "Cargo Max", "marca_id": MARCA_ELEMENT, "tipo_id": TIPO_PANTALON, "entalle_id": ENTALLE_BAGGY, "tela_id": TELA_RIGIDO},
    ]
    modelo_ids = []
    for m in modelos:
        mid = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO produccion.prod_modelos (id, nombre, marca_id, tipo_id, entalle_id, tela_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT DO NOTHING
        """, mid, m["nombre"], m["marca_id"], m["tipo_id"], m["entalle_id"], m["tela_id"])
        row = await conn.fetchrow("SELECT id FROM produccion.prod_modelos WHERE nombre = $1", m["nombre"])
        modelo_ids.append(str(row['id']))
        print(f"  Modelo: {m['nombre']} -> {row['id']}")
    
    # ========== 6. Crear registros y movimientos de costura ==========
    # Scenarios para cada registro:
    registros_data = [
        # persona_idx, modelo_idx, n_corte, cantidad, estado, fecha_inicio, fecha_esperada, fecha_fin, avance, urgente, dias_avance_atras
        # Maria Rodriguez - 3 lotes
        (0, 0, "102", 350, "Costura", HOY - timedelta(days=10), HOY + timedelta(days=5), None, 75, False, 1),      # Normal, buen avance
        (0, 1, "103", 200, "Costura", HOY - timedelta(days=5), HOY + timedelta(days=2), None, 30, True, 0),         # Urgente, bajo avance -> critico
        (0, 4, "110", 150, "Acabado", HOY - timedelta(days=20), HOY - timedelta(days=3), HOY - timedelta(days=5), 100, False, 5),  # Terminado
        
        # Carlos Gutierrez - 3 lotes
        (1, 2, "104", 600, "Costura", HOY - timedelta(days=15), HOY - timedelta(days=2), None, 85, False, 0),       # Vencido
        (1, 3, "105", 400, "Costura", HOY - timedelta(days=8), HOY + timedelta(days=10), None, 45, False, 4),       # Atencion por dias sin actualizar
        (1, 6, "115", 250, "Lavandería", HOY - timedelta(days=25), HOY - timedelta(days=10), HOY - timedelta(days=12), 100, False, 12), # Terminado
        
        # Ana Torres - 4 lotes
        (2, 5, "106", 300, "Costura", HOY - timedelta(days=3), HOY + timedelta(days=12), None, 15, False, 0),       # Normal, recien empezado
        (2, 0, "107", 500, "Costura", HOY - timedelta(days=12), HOY + timedelta(days=1), None, 60, True, 2),        # Urgente, atencion
        (2, 1, "108", 180, "Costura", HOY - timedelta(days=7), HOY - timedelta(days=1), None, 70, False, 6),        # Vencido, sin actualizar
        (2, 4, "116", 220, "Almacén PT", HOY - timedelta(days=30), HOY - timedelta(days=15), HOY - timedelta(days=18), 100, False, 18), # Terminado
        
        # Luis Mendoza - 2 lotes
        (3, 6, "109", 450, "Costura", HOY - timedelta(days=6), HOY + timedelta(days=8), None, 40, False, 0),        # Normal
        (3, 2, "111", 800, "Costura", HOY - timedelta(days=20), HOY - timedelta(days=5), None, 55, True, 7),        # Vencido + urgente + sin actualizar -> critico
        
        # Rosa Huaman - 3 lotes  
        (4, 3, "112", 350, "Costura", HOY - timedelta(days=4), HOY + timedelta(days=14), None, 20, False, 0),       # Normal, recien arrancado
        (4, 5, "113", 280, "Costura", HOY - timedelta(days=9), HOY + timedelta(days=3), None, 50, False, 3),        # Atencion
        (4, 0, "117", 400, "Atraque", HOY - timedelta(days=18), HOY - timedelta(days=7), HOY - timedelta(days=8), 100, False, 8), # Terminado
        
        # Jorge Diaz - 2 lotes
        (5, 1, "114", 550, "Costura", HOY - timedelta(days=2), HOY + timedelta(days=20), None, 5, False, 0),        # Normal, apenas inicia
        (5, 6, "118", 320, "Costura", HOY - timedelta(days=14), HOY - timedelta(days=3), None, 90, False, 1),       # Vencido pero casi termina
    ]
    
    registro_ids = []
    movimiento_ids = []
    
    for (pidx, midx, n_corte, cantidad, estado, f_inicio, f_esperada, f_fin, avance, urgente, dias_avance) in registros_data:
        rid = str(uuid.uuid4())
        mov_id = str(uuid.uuid4())
        persona_id = persona_ids[pidx]
        modelo_id = modelo_ids[midx]
        
        # Calcular avance_updated_at
        if dias_avance == 0:
            avance_updated = datetime.now()
        else:
            avance_updated = datetime.now() - timedelta(days=dias_avance)
        
        # Crear registro
        fecha_creacion_dt = datetime.combine(f_inicio - timedelta(days=2), datetime.min.time())
        await conn.execute("""
            INSERT INTO produccion.prod_registros (id, n_corte, modelo_id, estado, urgente, fecha_creacion, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6, 8)
        """, rid, n_corte, modelo_id, estado, urgente, fecha_creacion_dt)
        
        # Crear movimiento de corte primero (para que la ruta tenga sentido)
        corte_mov_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO produccion.prod_movimientos_produccion 
            (id, registro_id, servicio_id, persona_id, cantidad_enviada, cantidad_recibida, 
             fecha_inicio, fecha_fin, fecha_esperada_movimiento, avance_porcentaje, avance_updated_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $7, 100, $8, $9)
        """, corte_mov_id, rid, CORTE_SERVICE_ID, persona_id, cantidad,
             f_inicio - timedelta(days=2), f_inicio - timedelta(days=1),
             avance_updated, f_inicio - timedelta(days=2))
        
        # Crear movimiento de costura
        await conn.execute("""
            INSERT INTO produccion.prod_movimientos_produccion 
            (id, registro_id, servicio_id, persona_id, cantidad_enviada, cantidad_recibida, 
             fecha_inicio, fecha_fin, fecha_esperada_movimiento, avance_porcentaje, avance_updated_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        """, mov_id, rid, COSTURA_SERVICE_ID, persona_id, cantidad,
             cantidad if f_fin else 0,
             f_inicio, f_fin, f_esperada, avance,
             avance_updated, f_inicio)
        
        registro_ids.append(rid)
        movimiento_ids.append(mov_id)
        print(f"  Registro {n_corte} (persona {pidx}, modelo {midx}, avance {avance}%, {'TERMINADO' if f_fin else 'EN CURSO'})")
    
    # ========== 7. Crear incidencias en algunos registros ==========
    incidencias_data = [
        # (registro_idx, motivo_id, comentario, paraliza, estado)
        (1, MOTIVO_CALIDAD, "Costura irregular en bolsillo trasero, necesita reproceso", True, "ABIERTA"),
        (1, MOTIVO_FALTA_MATERIAL, "Faltan botones especiales para este modelo", False, "ABIERTA"),
        (3, MOTIVO_RETRASO, "Taller reporta demora por sobrecarga de trabajo", False, "ABIERTA"),
        (4, MOTIVO_SIN_CAP, "Costurero no tiene experiencia en este tipo de costura", False, "ABIERTA"),
        (7, MOTIVO_CALIDAD, "Puntada suelta en entrepierna, lote parcialmente afectado (120 prendas)", True, "ABIERTA"),
        (7, MOTIVO_FALTA_AVIOS, "Cierres llegaron defectuosos, esperando reposicion", False, "ABIERTA"),
        (8, MOTIVO_RETRASO, "Maquina de costura en mantenimiento 3 dias", False, "ABIERTA"),
        (10, MOTIVO_FALTA_MATERIAL, "Hilo especial agotado, pedido en transito", False, "ABIERTA"),
        (11, MOTIVO_CALIDAD, "Costuras desalineadas en pretina, reclamo del cliente", True, "ABIERTA"),
        (11, MOTIVO_SIN_CAP, "Se requiere costurero adicional para cumplir plazo", False, "ABIERTA"),
        (13, MOTIVO_FALTA_AVIOS, "Etiquetas de marca no han llegado", False, "ABIERTA"),
        # Algunas resueltas para contraste
        (0, MOTIVO_CALIDAD, "Problema con largo de pierna en talla 32", False, "RESUELTA"),
        (6, MOTIVO_FALTA_MATERIAL, "Tela insuficiente para completar lote", False, "RESUELTA"),
    ]
    
    for (ridx, motivo_id, comentario, paraliza, estado) in incidencias_data:
        inc_id = str(uuid.uuid4())
        registro_id = registro_ids[ridx]
        now_lima = datetime.now()
        resolucion = "Se ajusto patron y se reprocesaron las prendas afectadas" if estado == "RESUELTA" else None
        
        await conn.execute("""
            INSERT INTO produccion.prod_incidencia 
            (id, registro_id, tipo, comentario, estado, paraliza, fecha_hora, comentario_resolucion, created_at, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7, 8)
        """, inc_id, registro_id, motivo_id, comentario, estado, paraliza, now_lima - timedelta(hours=ridx), resolucion)
        
        # Si paraliza y esta abierta, crear paralizacion
        if paraliza and estado == "ABIERTA":
            par_id = str(uuid.uuid4())
            motivo_corto = comentario[:30]
            await conn.execute("""
                INSERT INTO produccion.prod_paralizacion 
                (id, registro_id, motivo, fecha_inicio, activa, created_at, empresa_id)
                VALUES ($1, $2, $3, $4, true, $4, 8)
            """, par_id, registro_id, motivo_corto, now_lima - timedelta(hours=ridx))
        
        print(f"  Incidencia en registro {ridx} ({estado}): {comentario[:50]}...")
    
    # ========== 8. Crear historial de avance para algunos movimientos ==========
    avance_historial = [
        # (mov_idx, avances como lista de (porcentaje, dias_atras))
        (0, [(20, 8), (40, 5), (60, 3), (75, 1)]),       # Maria - 102: progreso constante
        (1, [(10, 4), (20, 2), (30, 0)]),                  # Maria - 103: avance lento
        (3, [(30, 12), (50, 8), (70, 5), (85, 0)]),       # Carlos - 104: buen avance pero vencido
        (6, [(5, 2), (15, 0)]),                             # Ana - 106: recien empieza
        (7, [(15, 10), (30, 7), (45, 4), (60, 2)]),       # Ana - 107: avance constante
        (10, [(10, 5), (25, 3), (40, 0)]),                 # Luis - 109: avance ok
        (15, [(5, 0)]),                                     # Jorge - 114: apenas arranca
        (16, [(40, 10), (60, 7), (75, 4), (90, 1)]),      # Jorge - 118: buen ritmo
    ]
    
    for (midx, avances) in avance_historial:
        mov_id = movimiento_ids[midx]
        for (pct, dias) in avances:
            ts = datetime.now() - timedelta(days=dias)
            await conn.execute("""
                INSERT INTO produccion.prod_avance_historial (id, movimiento_id, avance_porcentaje, usuario, created_at)
                VALUES ($1, $2, $3, 'eduard', $4)
            """, str(uuid.uuid4()), mov_id, pct, ts)
    
    print("\nHistorial de avance creado")
    
    await conn.close()
    print("\n=== SIMULACION COMPLETADA ===")
    print(f"  Personas: {len(persona_ids)}")
    print(f"  Modelos: {len(modelo_ids)}")
    print(f"  Registros: {len(registro_ids)} ({sum(1 for r in registros_data if r[7] is None)} en curso, {sum(1 for r in registros_data if r[7] is not None)} terminados)")
    print(f"  Incidencias: {len(incidencias_data)} ({sum(1 for i in incidencias_data if i[4]=='ABIERTA')} abiertas, {sum(1 for i in incidencias_data if i[4]=='RESUELTA')} resueltas)")
    print(f"  Paralizaciones: {sum(1 for i in incidencias_data if i[3] and i[4]=='ABIERTA')}")

asyncio.run(main())
