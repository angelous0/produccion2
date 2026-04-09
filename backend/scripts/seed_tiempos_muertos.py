"""
Seed data for Tiempos Muertos report — creates multi-service chains with realistic gaps.
"""
import asyncio
import asyncpg
import uuid
from datetime import date, timedelta, datetime

# Service IDs
SVC = {
    'Corte':       'a42eb55f-cdd9-499a-9ff8-e6cfcd153cec',
    'Costura':     '38b1c7d3-52c3-49f6-9140-c60a556762b9',
    'Lavanderia':  'fda6b832-4106-4bac-816f-ee3ec3aeac3a',
    'Atraque':     '5939b474-547e-49e8-b4c8-c2bcdb194249',
    'Acabado':     '6b0ea7b9-bcac-49ac-bf48-7b50211775a2',
    'Limpieza':    '8f3d4a49-4abe-4043-a52f-6f5fdba8dd9f',
    'Bordado':     'b94b615d-cda3-45da-9109-b5333ed2249c',
    'Estampado':   '0fbe0687-3c5e-4ba3-abb4-65ea920c0d4c',
}

# Persona IDs
PERSONAS = {
    'Maria':    '40f085e8-e360-453c-a4b0-e919a83cc616',
    'Carlos':   '1a36f9c2-23d2-430c-98bf-191abcf4dc36',
    'Ana':      '8408c00d-97bf-4fad-8122-8f436f6d8490',
    'Roger':    '7809e6db-4dd8-43dd-9fc7-cc3277b661b7',
    'Pepe':     'f68a517c-8276-483a-b8a1-a12d0710edc3',
    'Procesos': 'f210e0a8-ff2b-4c2b-bf59-7d04fec6cdc8',
    'Acabado':  'de030a41-1c22-49d2-966c-92297409ee67',
    'Antartida':'e233fcc4-5b92-4083-bc4c-673ca648ef89',
}

HOY = date.today()

async def main():
    conn = await asyncpg.connect('postgres://admin:admin@72.60.241.216:9090/datos?sslmode=disable')
    print("Conectado")

    # Get modelo IDs
    modelos = await conn.fetch("SELECT id, nombre FROM produccion.prod_modelos LIMIT 7")
    modelo_ids = [str(r['id']) for r in modelos]
    print(f"Modelos: {len(modelo_ids)}")

    # ====== NUEVOS REGISTROS con cadenas multi-servicio ======
    registros = [
        # (n_corte, modelo_idx, urgente, estado, movimientos)
        # Cada movimiento: (servicio, persona, f_inicio, f_fin, cantidad, avance)
        # None en f_inicio = aún no empieza (EN ESPERA)

        # 201: Cadena completa terminada — Corte→Costura→Lavanderia→Acabado (brechas de 1-2 días, OK)
        ("201", 0, False, "Acabado", [
            ('Corte',      'Carlos', HOY-timedelta(30), HOY-timedelta(28), 400, 100),
            ('Costura',    'Maria',  HOY-timedelta(27), HOY-timedelta(18), 400, 100),
            ('Lavanderia', 'Roger',  HOY-timedelta(17), HOY-timedelta(12), 400, 100),
            ('Acabado',    'Acabado',HOY-timedelta(11), HOY-timedelta(8),  400, 100),
        ]),

        # 202: Costura terminada hace 10 DÍAS, lavandería NO EMPEZÓ → CRITICO en espera
        ("202", 1, True, "Costura", [
            ('Corte',      'Carlos', HOY-timedelta(25), HOY-timedelta(23), 600, 100),
            ('Costura',    'Ana',    HOY-timedelta(22), HOY-timedelta(10), 600, 100),
            ('Lavanderia', 'Roger',  None,              None,              0,   0),
        ]),

        # 203: Costura terminada hace 5 DÍAS, lavandería NO EMPEZÓ → ATENCION en espera
        ("203", 2, False, "Costura", [
            ('Corte',      'Maria',  HOY-timedelta(20), HOY-timedelta(18), 350, 100),
            ('Costura',    'Pepe',   HOY-timedelta(17), HOY-timedelta(5),  350, 100),
            ('Lavanderia', 'Antartida', None,           None,              0,   0),
        ]),

        # 204: Lavandería terminada hace 8 DÍAS, acabado NO EMPEZÓ → CRITICO en espera
        ("204", 3, False, "Lavanderia", [
            ('Corte',      'Ana',    HOY-timedelta(35), HOY-timedelta(33), 500, 100),
            ('Costura',    'Maria',  HOY-timedelta(32), HOY-timedelta(22), 500, 100),
            ('Lavanderia', 'Roger',  HOY-timedelta(20), HOY-timedelta(8),  500, 100),
            ('Acabado',    'Acabado',None,              None,              0,   0),
        ]),

        # 205: Costura terminada hace 2 DÍAS, atraque NO EMPEZÓ → Recién en espera
        ("205", 4, False, "Costura", [
            ('Corte',      'Carlos', HOY-timedelta(15), HOY-timedelta(13), 280, 100),
            ('Costura',    'Ana',    HOY-timedelta(12), HOY-timedelta(2),  280, 100),
            ('Atraque',    'Procesos', None,            None,              0,   0),
        ]),

        # 206: Cadena con brechas LARGAS históricas (corte→costura 5d, costura→lavanderia 8d, lavanderia→acabado 3d)
        ("206", 5, False, "Acabado", [
            ('Corte',      'Maria',  HOY-timedelta(40), HOY-timedelta(38), 450, 100),
            ('Costura',    'Carlos', HOY-timedelta(33), HOY-timedelta(20), 450, 100),
            ('Lavanderia', 'Antartida', HOY-timedelta(12), HOY-timedelta(7), 450, 100),
            ('Acabado',    'Acabado',HOY-timedelta(4),  None,              450, 60),
        ]),

        # 207: URG — Atraque terminado hace 12 DÍAS, limpieza NO EMPEZÓ → MUY CRITICO
        ("207", 6, True, "Atraque", [
            ('Corte',      'Ana',    HOY-timedelta(40), HOY-timedelta(38), 800, 100),
            ('Costura',    'Pepe',   HOY-timedelta(37), HOY-timedelta(28), 800, 100),
            ('Atraque',    'Procesos',HOY-timedelta(26),HOY-timedelta(12), 800, 100),
            ('Limpieza',   'Roger',  None,              None,              0,   0),
        ]),

        # 208: Bordado terminado hace 4 DÍAS, costura NO EMPEZÓ → ATENCION
        ("208", 0, False, "Bordado", [
            ('Corte',      'Carlos', HOY-timedelta(22), HOY-timedelta(20), 200, 100),
            ('Bordado',    'Antartida',HOY-timedelta(18),HOY-timedelta(4), 200, 100),
            ('Costura',    'Maria',  None,              None,              0,   0),
        ]),

        # 209: Estampado → Costura con brecha de 6 días (histórico) y costura en espera hace 3 días
        ("209", 1, False, "Costura", [
            ('Corte',      'Maria',  HOY-timedelta(30), HOY-timedelta(28), 300, 100),
            ('Estampado',  'Procesos',HOY-timedelta(25),HOY-timedelta(15), 300, 100),
            ('Costura',    'Pepe',   HOY-timedelta(9),  HOY-timedelta(3),  300, 100),
            ('Lavanderia', 'Roger',  None,              None,              0,   0),
        ]),

        # 210: Todo fluido, sin brechas significativas
        ("210", 2, False, "Limpieza", [
            ('Corte',      'Ana',    HOY-timedelta(18), HOY-timedelta(17), 150, 100),
            ('Costura',    'Carlos', HOY-timedelta(17), HOY-timedelta(10), 150, 100),
            ('Lavanderia', 'Roger',  HOY-timedelta(10), HOY-timedelta(6),  150, 100),
            ('Limpieza',   'Procesos',HOY-timedelta(6), HOY-timedelta(3),  150, 100),
        ]),

        # 211: Costura terminada hace 15 DÍAS, nada más → MUY CRITICO
        ("211", 3, True, "Costura", [
            ('Corte',      'Maria',  HOY-timedelta(30), HOY-timedelta(28), 700, 100),
            ('Costura',    'Ana',    HOY-timedelta(27), HOY-timedelta(15), 700, 100),
            ('Atraque',    'Procesos',None,             None,              0,   0),
        ]),

        # 212: Lavandería terminada hace 1 DÍA, acabado no empezó → recién
        ("212", 4, False, "Lavanderia", [
            ('Corte',      'Carlos', HOY-timedelta(20), HOY-timedelta(19), 250, 100),
            ('Costura',    'Pepe',   HOY-timedelta(18), HOY-timedelta(10), 250, 100),
            ('Lavanderia', 'Antartida',HOY-timedelta(9),HOY-timedelta(1),  250, 100),
            ('Acabado',    'Acabado',None,              None,              0,   0),
        ]),
    ]

    for (n_corte, midx, urgente, estado, movimientos) in registros:
        rid = str(uuid.uuid4())
        modelo_id = modelo_ids[midx % len(modelo_ids)]
        fc = datetime.combine(movimientos[0][2], datetime.min.time())

        await conn.execute("""
            INSERT INTO produccion.prod_registros (id, n_corte, modelo_id, estado, urgente, fecha_creacion, empresa_id)
            VALUES ($1, $2, $3, $4, $5, $6, 8)
        """, rid, n_corte, modelo_id, estado, urgente, fc)

        for (svc_name, persona_key, f_inicio, f_fin, cantidad, avance) in movimientos:
            mov_id = str(uuid.uuid4())
            svc_id = SVC[svc_name]
            persona_id = PERSONAS[persona_key]
            updated = datetime.now() if avance > 0 else None

            await conn.execute("""
                INSERT INTO produccion.prod_movimientos_produccion
                (id, registro_id, servicio_id, persona_id, cantidad_enviada, cantidad_recibida,
                 fecha_inicio, fecha_fin, avance_porcentaje, avance_updated_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """, mov_id, rid, svc_id, persona_id,
                 cantidad if cantidad > 0 else 0,
                 cantidad if f_fin else 0,
                 f_inicio, f_fin, avance, updated,
                 datetime.combine(f_inicio, datetime.min.time()) if f_inicio else datetime.now())

        print(f"  Corte {n_corte} ({estado}) — {len(movimientos)} servicios")

    await conn.close()
    print(f"\n=== COMPLETADO: {len(registros)} registros con cadenas multi-servicio ===")
    print("Escenarios creados:")
    print("  - 202, 203, 205, 209, 212: Costura/Lavandería terminada → siguiente EN ESPERA")
    print("  - 204, 207, 211: Brechas CRÍTICAS (8, 12, 15 días)")
    print("  - 208: Bordado→Costura en espera 4d")
    print("  - 206: Cadena con brechas históricas largas")
    print("  - 201, 210: Cadenas fluidas sin problemas")

asyncio.run(main())
