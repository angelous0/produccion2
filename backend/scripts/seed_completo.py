#!/usr/bin/env python3
"""
seed_completo.py — Datos completos de ejemplo para testing integral.
Elimina TODOS los datos de producción y crea ejemplos desde cero.

Ejecutar: cd backend && python scripts/seed_completo.py
"""
import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")


def uid():
    return str(uuid.uuid4())


# ════════════════════════════════════════════════════════════
#  IDs PREDEFINIDOS (para referencias cruzadas)
# ════════════════════════════════════════════════════════════

# Marcas
MARCA_ELEMENT = uid()
MARCA_URBAN = uid()

# Tipos
TIPO_POLO = uid()
TIPO_CASACA = uid()
TIPO_JOGGER = uid()
TIPO_HOODIE = uid()

# Entalles
ENTALLE_REGULAR = uid()
ENTALLE_SLIM = uid()
ENTALLE_OVERSIZE = uid()

# Telas
TELA_JERSEY = uid()
TELA_FRENCH = uid()
TELA_RIB = uid()

# Hilos
HILO_NEGRO = uid()
HILO_BLANCO = uid()

# Tallas
TALLA_XS = uid()
TALLA_S = uid()
TALLA_M = uid()
TALLA_L = uid()
TALLA_XL = uid()

# Colores generales
COLGEN_NEUTROS = uid()
COLGEN_OSCUROS = uid()
COLGEN_CLAROS = uid()

# Colores catálogo
COLOR_NEGRO = uid()
COLOR_BLANCO = uid()
COLOR_GRIS = uid()
COLOR_AZUL_MARINO = uid()
COLOR_BEIGE = uid()

# Hilos específicos
HE_NEGRO_MATE = uid()
HE_BLANCO_CRUDO = uid()
HE_AZUL_PETROLEO = uid()

# Servicios
SRV_CORTE = uid()
SRV_COSTURA = uid()
SRV_ESTAMPADO = uid()
SRV_BORDADO = uid()
SRV_LAVANDERIA = uid()
SRV_ACABADO = uid()

# Personas
PER_JUAN = uid()
PER_MARIA = uid()
PER_TALLER = uid()
PER_CARLOS = uid()
PER_ARTE = uid()
PER_LAVANDERIA = uid()

# Rutas
RUTA_BASICA = uid()
RUTA_ESTAMPADO = uid()
RUTA_BORDADO = uid()

# Inventario (materia prima)
INV_JERSEY_NEGRO = uid()
INV_JERSEY_BLANCO = uid()
INV_FRENCH_GRIS = uid()
INV_FRENCH_NEGRO = uid()
INV_HILO_COSER_NEGRO = uid()
INV_HILO_COSER_BLANCO = uid()
INV_BOTON_SNAP = uid()
INV_CIERRE_YKK = uid()
INV_ETIQUETA = uid()
INV_HANGTAG = uid()

# Modelos base
BASE_POLO = uid()
BASE_CASACA = uid()
BASE_HOODIE = uid()

# Variantes
VAR_POLO_NEGRO = uid()
VAR_POLO_BLANCO = uid()
VAR_CASACA_AZUL = uid()
VAR_HOODIE_NEGRO = uid()

# Registros
REG_001 = uid()
REG_002 = uid()
REG_003 = uid()
REG_004 = uid()
REG_005 = uid()
REG_005B = uid()
REG_006 = uid()

# Fechas relativas a hoy
NOW = datetime.now()
D = lambda days: NOW - timedelta(days=days)  # noqa
F = lambda days: NOW + timedelta(days=days)  # noqa


# ════════════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════════════

async def main():
    import asyncpg

    dsn = os.environ["DATABASE_URL"]
    # Normalizar DSN para asyncpg
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
    pool = await asyncpg.create_pool(dsn)

    async with pool.acquire() as conn:
        print("🗑️  Limpiando todas las tablas de producción...")
        await clear_tables(conn)

        print("📦 1/6 — Catálogos (marcas → tipos → entalles → telas, hilos, tallas, colores)...")
        await seed_catalogos(conn)

        print("⚙️  2/6 — Servicios, personas, rutas de producción...")
        await seed_produccion(conn)

        print("📋 3/6 — Materia prima + ingresos al inventario...")
        await seed_inventario(conn)

        print("🏭 4/6 — Modelos base + tallas + BOM...")
        await seed_modelos_base(conn)

        print("🎨 5/6 — Variantes (modelos con hilo específico)...")
        await seed_variantes(conn)

        print("📝 6/6 — Registros de producción + movimientos...")
        await seed_registros(conn)

        print("\n✅ ¡Seed completo! Datos listos para testing.\n")
        await print_resumen(conn)

    await pool.close()


# ════════════════════════════════════════════════════════════
#  LIMPIAR TABLAS
# ════════════════════════════════════════════════════════════

async def clear_tables(conn):
    tables = [
        "prod_conversacion", "prod_incidencia", "prod_registro_cierre",
        "prod_movimientos_produccion",
        "prod_inventario_reservas_linea", "prod_inventario_reservas",
        "prod_registro_requerimiento_mp",
        "prod_inventario_salidas", "prod_inventario_ajustes",
        "prod_inventario_rollos", "prod_inventario_ingresos",
        "prod_registro_tallas", "prod_registros",
        "prod_modelo_bom_linea", "prod_bom_cabecera", "prod_modelo_tallas",
        "prod_modelos",
        "prod_rutas_produccion", "prod_personas_produccion", "prod_servicios_produccion",
        "prod_hilos_especificos",
        "prod_colores_catalogo", "prod_colores_generales", "prod_tallas_catalogo",
        "prod_hilos", "prod_telas", "prod_entalles", "prod_tipos", "prod_marcas",
        "prod_inventario", "prod_motivos_incidencia",
    ]
    for t in tables:
        try:
            await conn.execute(f"DELETE FROM {t}")
        except Exception:
            pass


# ════════════════════════════════════════════════════════════
#  CATÁLOGOS
# ════════════════════════════════════════════════════════════

async def seed_catalogos(conn):
    # ── Marcas ──
    for id_, nombre, orden in [
        (MARCA_ELEMENT, "Element Premium", 1),
        (MARCA_URBAN, "Urban Style", 2),
    ]:
        await conn.execute(
            "INSERT INTO prod_marcas (id,nombre,orden,created_at) VALUES ($1,$2,$3,$4)",
            id_, nombre, orden, NOW)

    # ── Tipos → Marcas (cascada) ──
    for id_, nombre, marca_ids, orden in [
        (TIPO_POLO, "Polo", [MARCA_ELEMENT], 1),
        (TIPO_CASACA, "Casaca", [MARCA_ELEMENT], 2),
        (TIPO_JOGGER, "Jogger", [MARCA_URBAN], 3),
        (TIPO_HOODIE, "Hoodie", [MARCA_URBAN], 4),
    ]:
        await conn.execute(
            "INSERT INTO prod_tipos (id,nombre,marca_ids,orden,created_at) VALUES ($1,$2,$3,$4,$5)",
            id_, nombre, json.dumps(marca_ids), orden, NOW)

    # ── Entalles → Tipos (cascada) ──
    for id_, nombre, tipo_ids, orden in [
        (ENTALLE_REGULAR, "Regular", [TIPO_POLO, TIPO_CASACA], 1),
        (ENTALLE_SLIM, "Slim Fit", [TIPO_POLO, TIPO_JOGGER], 2),
        (ENTALLE_OVERSIZE, "Oversize", [TIPO_HOODIE], 3),
    ]:
        await conn.execute(
            "INSERT INTO prod_entalles (id,nombre,tipo_ids,orden,created_at) VALUES ($1,$2,$3,$4,$5)",
            id_, nombre, json.dumps(tipo_ids), orden, NOW)

    # ── Telas → Entalles (cascada) ──
    for id_, nombre, entalle_ids, orden in [
        (TELA_JERSEY, "Jersey 30/1", [ENTALLE_REGULAR, ENTALLE_SLIM], 1),
        (TELA_FRENCH, "French Terry", [ENTALLE_OVERSIZE, ENTALLE_REGULAR], 2),
        (TELA_RIB, "Rib 1x1", [ENTALLE_SLIM], 3),
    ]:
        await conn.execute(
            "INSERT INTO prod_telas (id,nombre,entalle_ids,orden,created_at) VALUES ($1,$2,$3,$4,$5)",
            id_, nombre, json.dumps(entalle_ids), orden, NOW)

    # ── Hilos (independientes) ──
    for id_, nombre, orden in [
        (HILO_NEGRO, "Hilo Negro", 1),
        (HILO_BLANCO, "Hilo Blanco", 2),
    ]:
        await conn.execute(
            "INSERT INTO prod_hilos (id,nombre,tela_ids,orden,created_at) VALUES ($1,$2,$3,$4,$5)",
            id_, nombre, json.dumps([]), orden, NOW)

    # ── Tallas catálogo ──
    for id_, nombre, orden in [
        (TALLA_XS, "XS", 1), (TALLA_S, "S", 2), (TALLA_M, "M", 3),
        (TALLA_L, "L", 4), (TALLA_XL, "XL", 5),
    ]:
        await conn.execute(
            "INSERT INTO prod_tallas_catalogo (id,nombre,orden,created_at) VALUES ($1,$2,$3,$4)",
            id_, nombre, orden, NOW)

    # ── Colores generales ──
    for id_, nombre, orden in [
        (COLGEN_NEUTROS, "Neutros", 1),
        (COLGEN_OSCUROS, "Oscuros", 2),
        (COLGEN_CLAROS, "Claros", 3),
    ]:
        await conn.execute(
            "INSERT INTO prod_colores_generales (id,nombre,orden,created_at) VALUES ($1,$2,$3,$4)",
            id_, nombre, orden, NOW)

    # ── Colores catálogo ──
    for id_, nombre, hex_, gen_id, orden in [
        (COLOR_NEGRO, "Negro", "#000000", COLGEN_OSCUROS, 1),
        (COLOR_BLANCO, "Blanco", "#FFFFFF", COLGEN_CLAROS, 2),
        (COLOR_GRIS, "Gris Melange", "#A0A0A0", COLGEN_NEUTROS, 3),
        (COLOR_AZUL_MARINO, "Azul Marino", "#1B3A5C", COLGEN_OSCUROS, 4),
        (COLOR_BEIGE, "Beige", "#D4C5A9", COLGEN_CLAROS, 5),
    ]:
        await conn.execute(
            "INSERT INTO prod_colores_catalogo (id,nombre,codigo_hex,color_general_id,orden,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
            id_, nombre, hex_, gen_id, orden, NOW)

    # ── Hilos específicos ──
    for id_, nombre, codigo, color in [
        (HE_NEGRO_MATE, "Negro Mate", "HE-001", "Negro"),
        (HE_BLANCO_CRUDO, "Blanco Crudo", "HE-002", "Blanco"),
        (HE_AZUL_PETROLEO, "Azul Petróleo", "HE-003", "Azul"),
    ]:
        await conn.execute(
            "INSERT INTO prod_hilos_especificos (id,nombre,codigo,color,orden,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
            id_, nombre, codigo, color, 0, NOW)

    print("   ✓ 2 marcas, 4 tipos, 3 entalles, 3 telas, 2 hilos")
    print("   ✓ 5 tallas, 3 colores generales, 5 colores catálogo, 3 hilos específicos")


# ════════════════════════════════════════════════════════════
#  SERVICIOS, PERSONAS, RUTAS
# ════════════════════════════════════════════════════════════

async def seed_produccion(conn):
    # ── Servicios de producción ──
    servicios = [
        (SRV_CORTE, "Corte", "Corte de tela según moldes y tallas", 0.50, 1, False),
        (SRV_COSTURA, "Costura", "Confección completa de prendas", 3.00, 2, False),
        (SRV_ESTAMPADO, "Estampado", "Estampado serigráfico o digital", 1.50, 3, False),
        (SRV_BORDADO, "Bordado", "Bordado computarizado de logos", 2.00, 4, False),
        (SRV_LAVANDERIA, "Lavandería", "Lavado enzimático y suavizado", 1.00, 5, False),
        (SRV_ACABADO, "Acabado", "Planchado, doblado, embolsado, etiquetado", 0.80, 6, False),
    ]
    for id_, nombre, desc, tarifa, orden, avance in servicios:
        await conn.execute(
            """INSERT INTO prod_servicios_produccion
               (id,nombre,descripcion,tarifa,orden,usa_avance_porcentaje,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)""",
            id_, nombre, desc, tarifa, orden, avance, NOW)

    # ── Personas de producción ──
    personas = [
        (PER_JUAN, "Juan Pérez", "interno", "999111222", "juan@element.pe",
         [{"servicio_id": SRV_CORTE, "tarifa": 0.50}]),
        (PER_MARIA, "María López", "externo", "999333444", "maria@costura.pe",
         [{"servicio_id": SRV_COSTURA, "tarifa": 3.00}]),
        (PER_TALLER, "Taller Express S.A.", "externo", "999555666", "contacto@tallerexpress.pe",
         [{"servicio_id": SRV_COSTURA, "tarifa": 2.80},
          {"servicio_id": SRV_ACABADO, "tarifa": 0.80}]),
        (PER_CARLOS, "Carlos Gómez Estampados", "externo", "999777888", "carlos@estampados.pe",
         [{"servicio_id": SRV_ESTAMPADO, "tarifa": 1.50}]),
        (PER_ARTE, "Arte Bordados E.I.R.L.", "externo", "999888999", "ventas@artebordados.pe",
         [{"servicio_id": SRV_BORDADO, "tarifa": 2.00}]),
        (PER_LAVANDERIA, "Lavandería Industrial SAC", "externo", "999000111", "admin@lavanderia.pe",
         [{"servicio_id": SRV_LAVANDERIA, "tarifa": 1.00}]),
    ]
    for id_, nombre, tipo, tel, email, srvs in personas:
        await conn.execute(
            """INSERT INTO prod_personas_produccion
               (id,nombre,tipo,telefono,email,servicios,activo,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            id_, nombre, tipo, tel, email, json.dumps(srvs), True, NOW)

    # ── Rutas de producción ──
    ruta_basica = [
        {"nombre": "Corte", "servicio_id": SRV_CORTE, "orden": 1,
         "obligatorio": True, "aparece_en_estado": "Para Corte", "es_cierre": False},
        {"nombre": "Costura", "servicio_id": SRV_COSTURA, "orden": 2,
         "obligatorio": True, "aparece_en_estado": "Costura", "es_cierre": False},
        {"nombre": "Acabado", "servicio_id": SRV_ACABADO, "orden": 3,
         "obligatorio": True, "aparece_en_estado": "Acabado", "es_cierre": True},
    ]
    ruta_estampado = [
        {"nombre": "Corte", "servicio_id": SRV_CORTE, "orden": 1,
         "obligatorio": True, "aparece_en_estado": "Para Corte", "es_cierre": False},
        {"nombre": "Estampado", "servicio_id": SRV_ESTAMPADO, "orden": 2,
         "obligatorio": True, "aparece_en_estado": "Estampado", "es_cierre": False},
        {"nombre": "Costura", "servicio_id": SRV_COSTURA, "orden": 3,
         "obligatorio": True, "aparece_en_estado": "Costura", "es_cierre": False},
        {"nombre": "Acabado", "servicio_id": SRV_ACABADO, "orden": 4,
         "obligatorio": True, "aparece_en_estado": "Acabado", "es_cierre": True},
    ]
    ruta_bordado = [
        {"nombre": "Corte", "servicio_id": SRV_CORTE, "orden": 1,
         "obligatorio": True, "aparece_en_estado": "Para Corte", "es_cierre": False},
        {"nombre": "Costura", "servicio_id": SRV_COSTURA, "orden": 2,
         "obligatorio": True, "aparece_en_estado": "Costura", "es_cierre": False},
        {"nombre": "Bordado", "servicio_id": SRV_BORDADO, "orden": 3,
         "obligatorio": True, "aparece_en_estado": "Bordado", "es_cierre": False},
        {"nombre": "Lavandería", "servicio_id": SRV_LAVANDERIA, "orden": 4,
         "obligatorio": True, "aparece_en_estado": "Lavandería", "es_cierre": False},
        {"nombre": "Acabado", "servicio_id": SRV_ACABADO, "orden": 5,
         "obligatorio": True, "aparece_en_estado": "Acabado", "es_cierre": True},
    ]
    for id_, nombre, desc, etapas in [
        (RUTA_BASICA, "Ruta Básica", "Corte → Costura → Acabado", ruta_basica),
        (RUTA_ESTAMPADO, "Ruta con Estampado", "Corte → Estampado → Costura → Acabado", ruta_estampado),
        (RUTA_BORDADO, "Ruta con Bordado", "Corte → Costura → Bordado → Lavandería → Acabado", ruta_bordado),
    ]:
        await conn.execute(
            "INSERT INTO prod_rutas_produccion (id,nombre,descripcion,etapas,created_at) VALUES ($1,$2,$3,$4,$5)",
            id_, nombre, desc, json.dumps(etapas), NOW)

    # ── Motivos de incidencia ──
    for nombre in ['Falta Material', 'Falta Avíos', 'Retraso Taller', 'Calidad',
                    'Cambio Prioridad', 'Sin Capacidad', 'Reprogramación', 'Otro']:
        await conn.execute(
            "INSERT INTO prod_motivos_incidencia (id,nombre,activo,created_at) VALUES ($1,$2,$3,$4)",
            uid(), nombre, True, NOW)

    print("   ✓ 6 servicios, 6 personas, 3 rutas de producción, 8 motivos incidencia")


# ════════════════════════════════════════════════════════════
#  INVENTARIO — MATERIA PRIMA + INGRESOS
# ════════════════════════════════════════════════════════════

async def seed_inventario(conn):
    items = [
        # (id, codigo, nombre, categoria, unidad, control_rollos, stock, stock_min)
        (INV_JERSEY_NEGRO, "TEL-001", "Jersey 30/1 Negro", "Telas", "metros", True, 500.0, 50),
        (INV_JERSEY_BLANCO, "TEL-002", "Jersey 30/1 Blanco", "Telas", "metros", True, 400.0, 50),
        (INV_FRENCH_GRIS, "TEL-003", "French Terry Gris Melange", "Telas", "metros", True, 300.0, 30),
        (INV_FRENCH_NEGRO, "TEL-004", "French Terry Negro", "Telas", "metros", True, 350.0, 30),
        (INV_HILO_COSER_NEGRO, "AVI-001", "Hilo de Coser Negro", "Avios", "cono", False, 50.0, 10),
        (INV_HILO_COSER_BLANCO, "AVI-002", "Hilo de Coser Blanco", "Avios", "cono", False, 50.0, 10),
        (INV_BOTON_SNAP, "AVI-003", "Botón Snap Metálico", "Avios", "unidad", False, 1000.0, 100),
        (INV_CIERRE_YKK, "AVI-004", "Cierre YKK 20cm", "Avios", "unidad", False, 500.0, 50),
        (INV_ETIQUETA, "AVI-005", "Etiqueta Principal Tejida", "Avios", "unidad", False, 2000.0, 200),
        (INV_HANGTAG, "AVI-006", "Hang Tag Cartón", "Avios", "unidad", False, 2000.0, 200),
    ]

    for id_, codigo, nombre, cat, um, rollos, stock, stock_min in items:
        await conn.execute(
            """INSERT INTO prod_inventario
               (id,codigo,nombre,categoria,unidad_medida,control_por_rollos,stock_actual,stock_minimo,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            id_, codigo, nombre, cat, um, rollos, stock, stock_min, NOW)

    # ── Ingresos de TELAS (con rollos individuales) ──
    # Cada tela se recibe en varios rollos con metrajes distintos (como en la vida real)
    tela_ingresos = [
        # (item_id, costo_metro, proveedor, doc, rollos: [(metros, color_id), ...])
        (INV_JERSEY_NEGRO, 15.00, "Textil Perú SAC", "FAC-2026-001", [
            (120.0, COLOR_NEGRO), (130.0, COLOR_NEGRO), (125.0, COLOR_NEGRO), (125.0, COLOR_NEGRO),
        ]),
        (INV_JERSEY_BLANCO, 15.00, "Textil Perú SAC", "FAC-2026-002", [
            (100.0, COLOR_BLANCO), (110.0, COLOR_BLANCO), (95.0, COLOR_BLANCO), (95.0, COLOR_BLANCO),
        ]),
        (INV_FRENCH_GRIS, 20.00, "Tejidos Andinos SRL", "FAC-2026-003", [
            (80.0, COLOR_GRIS), (75.0, COLOR_GRIS), (70.0, COLOR_GRIS), (75.0, COLOR_GRIS),
        ]),
        (INV_FRENCH_NEGRO, 20.00, "Tejidos Andinos SRL", "FAC-2026-004", [
            (90.0, COLOR_NEGRO), (85.0, COLOR_NEGRO), (88.0, COLOR_NEGRO), (87.0, COLOR_NEGRO),
        ]),
    ]
    for item_id, costo, prov, doc, rollos in tela_ingresos:
        total_metros = sum(r[0] for r in rollos)
        ingreso_id = uid()
        await conn.execute(
            """INSERT INTO prod_inventario_ingresos
               (id,item_id,cantidad,cantidad_disponible,costo_unitario,proveedor,numero_documento,fecha,empresa_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            ingreso_id, item_id, total_metros, total_metros, costo, prov, doc, D(30), 7)
        # Crear rollos individuales
        for metros, color_id in rollos:
            await conn.execute(
                """INSERT INTO prod_inventario_rollos
                   (id,item_id,ingreso_id,metraje,metraje_disponible,
                    metros_iniciales,metros_saldo,costo_unitario_metro,costo_total_inicial,
                    color_id,estado,activo,empresa_id)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)""",
                uid(), item_id, ingreso_id, metros, metros,
                metros, metros, costo, metros * costo,
                color_id, "ACTIVO", True, 7)

    # ── Ingresos de AVÍOS (sin rollos, solo cantidades) ──
    avio_ingresos = [
        (INV_HILO_COSER_NEGRO, 50.0, 8.00, "Hilos del Sur", "FAC-2026-005"),
        (INV_HILO_COSER_BLANCO, 50.0, 8.00, "Hilos del Sur", "FAC-2026-006"),
        (INV_BOTON_SNAP, 1000.0, 0.30, "Avíos Importados EIRL", "FAC-2026-007"),
        (INV_CIERRE_YKK, 500.0, 2.50, "YKK Perú SA", "FAC-2026-008"),
        (INV_ETIQUETA, 2000.0, 0.15, "Etiquetas Express", "FAC-2026-009"),
        (INV_HANGTAG, 2000.0, 0.10, "Cartones Lima SAC", "FAC-2026-010"),
    ]
    for item_id, cant, costo, prov, doc in avio_ingresos:
        await conn.execute(
            """INSERT INTO prod_inventario_ingresos
               (id,item_id,cantidad,cantidad_disponible,costo_unitario,proveedor,numero_documento,fecha,empresa_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            uid(), item_id, cant, cant, costo, prov, doc, D(30), 7)

    print("   ✓ 10 items de inventario (4 telas + 6 avíos)")
    print("   ✓ 4 ingresos de tela con 16 rollos individuales")
    print("   ✓ 6 ingresos de avíos con cantidades y costos")


# ════════════════════════════════════════════════════════════
#  MODELOS BASE + TALLAS + BOM
# ════════════════════════════════════════════════════════════

async def seed_modelos_base(conn):
    tallas_std = [TALLA_S, TALLA_M, TALLA_L, TALLA_XL]

    bases = [
        (BASE_POLO, "POLO ELEMENT REGULAR",
         MARCA_ELEMENT, TIPO_POLO, ENTALLE_REGULAR, TELA_JERSEY, HILO_NEGRO,
         RUTA_BASICA, [SRV_CORTE, SRV_COSTURA, SRV_ACABADO]),
        (BASE_CASACA, "CASACA ELEMENT REGULAR",
         MARCA_ELEMENT, TIPO_CASACA, ENTALLE_REGULAR, TELA_FRENCH, HILO_NEGRO,
         RUTA_BORDADO, [SRV_CORTE, SRV_COSTURA, SRV_BORDADO, SRV_LAVANDERIA, SRV_ACABADO]),
        (BASE_HOODIE, "HOODIE URBAN OVERSIZE",
         MARCA_URBAN, TIPO_HOODIE, ENTALLE_OVERSIZE, TELA_FRENCH, HILO_NEGRO,
         RUTA_ESTAMPADO, [SRV_CORTE, SRV_ESTAMPADO, SRV_COSTURA, SRV_ACABADO]),
    ]

    for id_, nombre, marca, tipo, entalle, tela, hilo, ruta, srvs in bases:
        await conn.execute(
            """INSERT INTO prod_modelos
               (id,nombre,marca_id,tipo_id,entalle_id,tela_id,hilo_id,
                ruta_produccion_id,servicios_ids,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
            id_, nombre, marca, tipo, entalle, tela, hilo, ruta, json.dumps(srvs), NOW)

        # Asignar tallas
        for i, talla_id in enumerate(tallas_std):
            await conn.execute(
                """INSERT INTO prod_modelo_tallas
                   (id,modelo_id,talla_id,activo,orden,created_at)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                uid(), id_, talla_id, True, (i + 1) * 10, NOW)

    # ── BOM: POLO ELEMENT ──
    bom_polo = uid()
    await conn.execute(
        "INSERT INTO prod_bom_cabecera (id,modelo_id,nombre,version,estado,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        bom_polo, BASE_POLO, "BOM Polo Element", 1, "VIGENTE", NOW)
    for inv_id, cant, tipo, orden in [
        (INV_JERSEY_NEGRO, 0.80, "TELA", 1),    # 0.80 m de jersey por prenda
        (INV_HILO_COSER_NEGRO, 0.05, "AVIO", 2), # 0.05 conos por prenda
        (INV_ETIQUETA, 1.0, "AVIO", 3),           # 1 etiqueta por prenda
        (INV_HANGTAG, 1.0, "AVIO", 4),            # 1 hang tag por prenda
    ]:
        await conn.execute(
            """INSERT INTO prod_modelo_bom_linea
               (id,modelo_id,bom_id,inventario_id,cantidad_base,tipo_componente,activo,orden,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            uid(), BASE_POLO, bom_polo, inv_id, cant, tipo, True, orden, NOW)

    # ── BOM: CASACA ELEMENT ──
    bom_casaca = uid()
    await conn.execute(
        "INSERT INTO prod_bom_cabecera (id,modelo_id,nombre,version,estado,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        bom_casaca, BASE_CASACA, "BOM Casaca Element", 1, "VIGENTE", NOW)
    for inv_id, cant, tipo, orden in [
        (INV_FRENCH_GRIS, 1.50, "TELA", 1),       # 1.50 m de french terry
        (INV_HILO_COSER_NEGRO, 0.08, "AVIO", 2),   # 0.08 conos
        (INV_CIERRE_YKK, 1.0, "AVIO", 3),          # 1 cierre
        (INV_BOTON_SNAP, 4.0, "AVIO", 4),          # 4 botones snap
        (INV_ETIQUETA, 1.0, "AVIO", 5),
        (INV_HANGTAG, 1.0, "AVIO", 6),
    ]:
        await conn.execute(
            """INSERT INTO prod_modelo_bom_linea
               (id,modelo_id,bom_id,inventario_id,cantidad_base,tipo_componente,activo,orden,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            uid(), BASE_CASACA, bom_casaca, inv_id, cant, tipo, True, orden, NOW)

    # ── BOM: HOODIE URBAN ──
    bom_hoodie = uid()
    await conn.execute(
        "INSERT INTO prod_bom_cabecera (id,modelo_id,nombre,version,estado,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        bom_hoodie, BASE_HOODIE, "BOM Hoodie Urban", 1, "VIGENTE", NOW)
    for inv_id, cant, tipo, orden in [
        (INV_FRENCH_NEGRO, 1.80, "TELA", 1),      # 1.80 m de french terry negro
        (INV_HILO_COSER_NEGRO, 0.10, "AVIO", 2),  # 0.10 conos
        (INV_ETIQUETA, 1.0, "AVIO", 3),
        (INV_HANGTAG, 1.0, "AVIO", 4),
    ]:
        await conn.execute(
            """INSERT INTO prod_modelo_bom_linea
               (id,modelo_id,bom_id,inventario_id,cantidad_base,tipo_componente,activo,orden,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            uid(), BASE_HOODIE, bom_hoodie, inv_id, cant, tipo, True, orden, NOW)

    print("   ✓ 3 bases: Polo Element, Casaca Element, Hoodie Urban")
    print("   ✓ 4 tallas asignadas a cada base (S, M, L, XL)")
    print("   ✓ BOM completo: Polo (4 líneas), Casaca (6 líneas), Hoodie (4 líneas)")


# ════════════════════════════════════════════════════════════
#  VARIANTES
# ════════════════════════════════════════════════════════════

async def seed_variantes(conn):
    variantes = [
        (VAR_POLO_NEGRO, "POLO ELEMENT REGULAR - Negro Mate", BASE_POLO, HE_NEGRO_MATE),
        (VAR_POLO_BLANCO, "POLO ELEMENT REGULAR - Blanco Crudo", BASE_POLO, HE_BLANCO_CRUDO),
        (VAR_CASACA_AZUL, "CASACA ELEMENT REGULAR - Azul Petróleo", BASE_CASACA, HE_AZUL_PETROLEO),
        (VAR_HOODIE_NEGRO, "HOODIE URBAN OVERSIZE - Negro Mate", BASE_HOODIE, HE_NEGRO_MATE),
    ]
    for var_id, nombre, base_id, he_id in variantes:
        base = await conn.fetchrow("SELECT * FROM prod_modelos WHERE id = $1", base_id)
        srvs = base["servicios_ids"]
        if isinstance(srvs, str):
            srvs_str = srvs
        else:
            srvs_str = json.dumps(srvs)

        await conn.execute(
            """INSERT INTO prod_modelos
               (id,nombre,marca_id,tipo_id,entalle_id,tela_id,hilo_id,
                ruta_produccion_id,servicios_ids,base_id,hilo_especifico_id,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
            var_id, nombre, base["marca_id"], base["tipo_id"], base["entalle_id"],
            base["tela_id"], base["hilo_id"], base["ruta_produccion_id"],
            srvs_str, base_id, he_id, NOW)

        # Copiar BOM de la base a la variante
        bom_base = await conn.fetch(
            "SELECT * FROM prod_modelo_bom_linea WHERE modelo_id = $1 AND activo = true", base_id)
        if bom_base:
            var_bom_id = uid()
            cab_nombre = f"BOM {nombre}"
            await conn.execute(
                "INSERT INTO prod_bom_cabecera (id,modelo_id,nombre,version,estado,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
                var_bom_id, var_id, cab_nombre, 1, "VIGENTE", NOW)
            for line in bom_base:
                await conn.execute(
                    """INSERT INTO prod_modelo_bom_linea
                       (id,modelo_id,bom_id,inventario_id,cantidad_base,tipo_componente,activo,orden,created_at)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
                    uid(), var_id, var_bom_id, line["inventario_id"],
                    line["cantidad_base"], line["tipo_componente"] or "TELA",
                    True, line["orden"], NOW)

        # Copiar tallas de la base a la variante
        tallas_base = await conn.fetch(
            "SELECT * FROM prod_modelo_tallas WHERE modelo_id = $1 AND activo = true", base_id)
        for t in tallas_base:
            await conn.execute(
                """INSERT INTO prod_modelo_tallas (id,modelo_id,talla_id,activo,orden,created_at)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                uid(), var_id, t["talla_id"], True, t["orden"], NOW)

    print("   ✓ 4 variantes con BOM y tallas copiadas de sus bases")


# ════════════════════════════════════════════════════════════
#  REGISTROS DE PRODUCCIÓN
# ════════════════════════════════════════════════════════════

async def seed_registros(conn):
    """
    7 registros en diferentes etapas para testing completo:

    CORTE-001  Polo Negro Mate    → Costura     (corte OK, costura 50%)
    CORTE-002  Polo Blanco Crudo  → Acabado     (corte+costura OK, acabado 60%)
    CORTE-003  Casaca Azul Petr.  → Bordado     (corte+costura OK, bordado 40%)
    CORTE-004  Hoodie Negro Mate  → Para Corte  (recién creado, sin movimientos)
    CORTE-005  Polo Negro Mate    → Costura     (lote dividido — padre)
    CORTE-005D Polo Negro Mate    → Costura     (lote dividido — hijo)
    CORTE-006  Hoodie Negro Mate  → Estampado   (con requerimiento MP generado)
    """

    registros = [
        # id, n_corte, modelo, estado, tallas[(talla_id, cant)...], fecha_creacion, fecha_entrega, urgente
        (REG_001, "CORTE-001", VAR_POLO_NEGRO, "Costura",
         [(TALLA_S, 20), (TALLA_M, 40), (TALLA_L, 40), (TALLA_XL, 20)],
         D(20), F(10), False),

        (REG_002, "CORTE-002", VAR_POLO_BLANCO, "Acabado",
         [(TALLA_S, 15), (TALLA_M, 25), (TALLA_L, 25), (TALLA_XL, 15)],
         D(25), F(5), False),

        (REG_003, "CORTE-003", VAR_CASACA_AZUL, "Bordado",
         [(TALLA_S, 10), (TALLA_M, 20), (TALLA_L, 20), (TALLA_XL, 10)],
         D(15), F(15), False),

        (REG_004, "CORTE-004", VAR_HOODIE_NEGRO, "Para Corte",
         [(TALLA_S, 15), (TALLA_M, 30), (TALLA_L, 35), (TALLA_XL, 20)],
         D(1), F(20), True),  # urgente

        (REG_005, "CORTE-005", VAR_POLO_NEGRO, "Costura",
         [(TALLA_S, 30), (TALLA_M, 60), (TALLA_L, 70), (TALLA_XL, 40)],
         D(10), F(15), False),

        (REG_006, "CORTE-006", VAR_HOODIE_NEGRO, "Estampado",
         [(TALLA_S, 25), (TALLA_M, 50), (TALLA_L, 50), (TALLA_XL, 25)],
         D(10), F(20), False),
    ]

    for reg_id, n_corte, modelo_id, estado, tallas_raw, fecha_cre, fecha_ent, urgente in registros:
        tallas_json = [{"talla_id": t[0], "cantidad": t[1]} for t in tallas_raw]
        curva = "/".join(str(t[1]) for t in tallas_raw)
        total = sum(t[1] for t in tallas_raw)

        await conn.execute(
            """INSERT INTO prod_registros
               (id,n_corte,modelo_id,estado,tallas,curva,urgente,fecha_creacion,fecha_entrega_final,empresa_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
            reg_id, n_corte, modelo_id, estado, json.dumps(tallas_json),
            curva, urgente, fecha_cre, fecha_ent, 8)

        for t_id, cant in tallas_raw:
            await conn.execute(
                """INSERT INTO prod_registro_tallas (id,registro_id,talla_id,cantidad_real,created_at,empresa_id)
                   VALUES ($1,$2,$3,$4,$5,$6)
                   ON CONFLICT (registro_id, talla_id) DO UPDATE SET cantidad_real = $4""",
                uid(), reg_id, t_id, cant, NOW, 8)

    # ── División de lote: CORTE-005 → CORTE-005D ──
    # El hijo se lleva 80 prendas, el padre se queda con 120
    tallas_hijo = [(TALLA_S, 10), (TALLA_M, 20), (TALLA_L, 30), (TALLA_XL, 20)]
    tallas_hijo_json = [{"talla_id": t[0], "cantidad": t[1]} for t in tallas_hijo]

    await conn.execute(
        """INSERT INTO prod_registros
           (id,n_corte,modelo_id,estado,tallas,curva,urgente,fecha_creacion,fecha_entrega_final,
            dividido_desde_registro_id,division_numero,empresa_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
        REG_005B, "CORTE-005-D1", VAR_POLO_NEGRO, "Costura",
        json.dumps(tallas_hijo_json), "10/20/30/20", False, D(5), F(15),
        REG_005, 1, 8)

    for t_id, cant in tallas_hijo:
        await conn.execute(
            """INSERT INTO prod_registro_tallas (id,registro_id,talla_id,cantidad_real,created_at,empresa_id)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (registro_id, talla_id) DO UPDATE SET cantidad_real = $4""",
            uid(), REG_005B, t_id, cant, NOW, 8)

    # Reducir tallas del padre (CORTE-005)
    tallas_padre_post = [(TALLA_S, 20), (TALLA_M, 40), (TALLA_L, 40), (TALLA_XL, 20)]
    await conn.execute(
        "UPDATE prod_registros SET tallas = $1, curva = $2 WHERE id = $3",
        json.dumps([{"talla_id": t[0], "cantidad": t[1]} for t in tallas_padre_post]),
        "20/40/40/20", REG_005)
    for t_id, cant in tallas_padre_post:
        await conn.execute(
            "UPDATE prod_registro_tallas SET cantidad_real = $1 WHERE registro_id = $2 AND talla_id = $3",
            cant, REG_005, t_id)

    print("   ✓ 7 registros creados:")
    print("     CORTE-001: Polo Negro → Costura (120 prendas)")
    print("     CORTE-002: Polo Blanco → Acabado (80 prendas)")
    print("     CORTE-003: Casaca Azul → Bordado (60 prendas)")
    print("     CORTE-004: Hoodie Negro → Para Corte (100 prendas, URGENTE)")
    print("     CORTE-005: Polo Negro → Costura (120 prendas, padre)")
    print("     CORTE-005-D1: Polo Negro → Costura (80 prendas, división)")
    print("     CORTE-006: Hoodie Negro → Estampado (150 prendas)")

    # ════════════════════════════════════════════════
    # MOVIMIENTOS DE PRODUCCIÓN
    # ════════════════════════════════════════════════
    print("   📦 Creando movimientos de producción...")

    # CORTE-001: Corte completo (120→120), Costura parcial (120→60)
    await mov(conn, REG_001, SRV_CORTE, PER_JUAN, 120, 120, 0.50, D(18), D(16))
    await mov(conn, REG_001, SRV_COSTURA, PER_MARIA, 120, 60, 3.00, D(15), None)

    # CORTE-002: Corte completo, Costura completa, Acabado parcial (80→50)
    await mov(conn, REG_002, SRV_CORTE, PER_JUAN, 80, 80, 0.50, D(23), D(21))
    await mov(conn, REG_002, SRV_COSTURA, PER_TALLER, 80, 80, 2.80, D(20), D(12))
    await mov(conn, REG_002, SRV_ACABADO, PER_TALLER, 80, 50, 0.80, D(10), None)

    # CORTE-003: Corte completo, Costura completa, Bordado parcial (60→25)
    await mov(conn, REG_003, SRV_CORTE, PER_JUAN, 60, 60, 0.50, D(13), D(12))
    await mov(conn, REG_003, SRV_COSTURA, PER_MARIA, 60, 60, 3.00, D(11), D(7))
    await mov(conn, REG_003, SRV_BORDADO, PER_ARTE, 60, 25, 2.00, D(5), None)

    # CORTE-004: Sin movimientos (recién creado)

    # CORTE-005 (padre): Corte completo de las 120 restantes, Costura parcial
    await mov(conn, REG_005, SRV_CORTE, PER_JUAN, 120, 120, 0.50, D(8), D(6))
    await mov(conn, REG_005, SRV_COSTURA, PER_MARIA, 120, 45, 3.00, D(5), None)

    # CORTE-005-D1 (hijo): Corte completo, Costura sin empezar a recibir
    await mov(conn, REG_005B, SRV_CORTE, PER_JUAN, 80, 80, 0.50, D(4), D(3))
    await mov(conn, REG_005B, SRV_COSTURA, PER_TALLER, 80, 0, 2.80, D(2), None)

    # CORTE-006: Corte completo, Estampado parcial (150→80)
    await mov(conn, REG_006, SRV_CORTE, PER_JUAN, 150, 150, 0.50, D(8), D(6))
    await mov(conn, REG_006, SRV_ESTAMPADO, PER_CARLOS, 150, 80, 1.50, D(5), None)

    print("   ✓ 14 movimientos creados con avance parcial y completo")

    # ════════════════════════════════════════════════
    # REQUERIMIENTOS DE MATERIA PRIMA (REG-006)
    # ════════════════════════════════════════════════
    print("   📋 Generando requerimiento MP para CORTE-006...")
    total_006 = 150
    reqs = [
        (INV_FRENCH_NEGRO, 1.80 * total_006, "PENDIENTE"),    # 270 m
        (INV_HILO_COSER_NEGRO, 0.10 * total_006, "PENDIENTE"), # 15 conos
        (INV_ETIQUETA, 1.0 * total_006, "PENDIENTE"),           # 150 u
        (INV_HANGTAG, 1.0 * total_006, "PENDIENTE"),            # 150 u
    ]
    for item_id, cant_req, estado in reqs:
        await conn.execute(
            """INSERT INTO prod_registro_requerimiento_mp
               (id,registro_id,item_id,cantidad_requerida,cantidad_reservada,cantidad_consumida,estado,created_at,empresa_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            uid(), REG_006, item_id, cant_req, 0, 0, estado, NOW, 7)
    print("   ✓ 4 líneas de requerimiento MP para CORTE-006")


async def mov(conn, reg_id, srv_id, per_id, enviada, recibida, tarifa, f_inicio, f_fin):
    """Helper: crear movimiento de producción."""
    await conn.execute(
        """INSERT INTO prod_movimientos_produccion
           (id,registro_id,servicio_id,persona_id,cantidad_enviada,cantidad_recibida,
            tarifa_aplicada,fecha_inicio,fecha_fin,diferencia,costo_calculado,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
        uid(), reg_id, srv_id, per_id, enviada, recibida,
        tarifa, f_inicio, f_fin, enviada - recibida, recibida * tarifa, NOW)


# ════════════════════════════════════════════════════════════
#  RESUMEN FINAL
# ════════════════════════════════════════════════════════════

async def print_resumen(conn):
    counts = {}
    for table, label in [
        ("prod_marcas", "Marcas"),
        ("prod_tipos", "Tipos"),
        ("prod_entalles", "Entalles"),
        ("prod_telas", "Telas"),
        ("prod_tallas_catalogo", "Tallas"),
        ("prod_colores_catalogo", "Colores"),
        ("prod_hilos_especificos", "Hilos Específicos"),
        ("prod_servicios_produccion", "Servicios"),
        ("prod_personas_produccion", "Personas"),
        ("prod_rutas_produccion", "Rutas"),
        ("prod_inventario", "Items Inventario"),
        ("prod_inventario_ingresos", "Ingresos"),
        ("prod_modelos", "Modelos (base+var)"),
        ("prod_modelo_bom_linea", "Líneas BOM"),
        ("prod_registros", "Registros"),
        ("prod_movimientos_produccion", "Movimientos"),
        ("prod_registro_requerimiento_mp", "Req. MP"),
    ]:
        try:
            n = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
            counts[label] = n
        except Exception:
            counts[label] = 0

    print("┌─────────────────────────────────────────┐")
    print("│        RESUMEN DE DATOS CREADOS          │")
    print("├─────────────────────────────────────────┤")
    for label, n in counts.items():
        print(f"│  {label:<28} {n:>5}    │")
    print("└─────────────────────────────────────────┘")


if __name__ == "__main__":
    asyncio.run(main())
