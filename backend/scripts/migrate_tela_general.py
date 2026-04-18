"""
Migración: Tela General

Convierte prod_tipos_tela en registros de prod_telas, crea prod_telas_general,
asigna tela_general_id a cada tela, y limpia las tablas obsoletas.

Idempotente: puede correrse múltiples veces sin duplicar datos.

Uso:
    cd produccion/backend
    python scripts/migrate_tela_general.py
"""
import asyncio
import sys
import os
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_pool


def new_id():
    return str(uuid.uuid4())

def now():
    return datetime.utcnow()


async def migrate():
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():

            # ── PASO A: Poblar prod_telas_general ────────────────────────────
            print("\n=== PASO A: Telas Generales ===")
            telas_generales_def = [
                ("Denim",  1),
                ("Drill",  2),
                ("Jersey", 3),
            ]
            tg_ids = {}
            for nombre, orden in telas_generales_def:
                existing = await conn.fetchrow(
                    "SELECT * FROM prod_telas_general WHERE nombre = $1", nombre
                )
                if existing:
                    tg_ids[nombre] = existing["id"]
                    print(f"  [OK]  Tela General '{nombre}' ya existe")
                else:
                    new_tg_id = new_id()
                    await conn.execute(
                        "INSERT INTO prod_telas_general (id, nombre, orden, created_at) VALUES ($1, $2, $3, $4)",
                        new_tg_id, nombre, orden, now()
                    )
                    tg_ids[nombre] = new_tg_id
                    print(f"  [NEW] Tela General '{nombre}' creada")

            # ── PASO B: Agregar telas faltantes desde prod_tipos_tela ────────
            print("\n=== PASO B: Importar telas desde prod_tipos_tela ===")
            tabla_existe = await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prod_tipos_tela')"
            )
            if tabla_existe:
                tipos_tela_rows = await conn.fetch("SELECT * FROM prod_tipos_tela")
                print(f"  Encontrados {len(tipos_tela_rows)} registros en prod_tipos_tela")
                for row in tipos_tela_rows:
                    nombre = row["nombre"]
                    existing = await conn.fetchrow(
                        "SELECT id FROM prod_telas WHERE LOWER(nombre) = LOWER($1)", nombre
                    )
                    if existing:
                        print(f"  [OK]  Tela '{nombre}' ya existe en prod_telas")
                    else:
                        max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_telas")
                        await conn.execute(
                            "INSERT INTO prod_telas (id, nombre, entalle_ids, orden, created_at) VALUES ($1, $2, '[]'::jsonb, $3, $4)",
                            new_id(), nombre, max_orden + 1, now()
                        )
                        print(f"  [NEW] Tela '{nombre}' agregada a prod_telas")
            else:
                print("  [SKIP] Tabla prod_tipos_tela no existe, saltando")

            # ── PASO C: Asignar tela_general_id a cada tela ─────────────────
            print("\n=== PASO C: Asignar tela_general_id ===")
            mapping = {
                "Comfort":      "Denim",
                "Denim":        "Denim",
                "Jogg":         "Denim",
                "Satinado":     "Denim",
                "Rígido":       "Denim",
                "Drill":        "Drill",
                "Paper touch":  "Drill",
                "PPTCH":        "Drill",
                "Jersey":       "Jersey",
                "Jersey 24/1":  "Jersey",
                "Jersey 20/1":  "Jersey",
            }
            all_telas = await conn.fetch("SELECT id, nombre, tela_general_id FROM prod_telas")
            for tela in all_telas:
                tela_nombre = tela["nombre"]
                tela_general_nombre = mapping.get(tela_nombre)
                if tela_general_nombre is None:
                    print(f"  [WARN] Tela '{tela_nombre}' no está en el mapping — tela_general_id no asignado")
                    continue
                tg_id = tg_ids.get(tela_general_nombre)
                if tg_id is None:
                    print(f"  [WARN] Tela General '{tela_general_nombre}' no encontrada para '{tela_nombre}'")
                    continue
                if tela["tela_general_id"] == tg_id:
                    print(f"  [OK]  Tela '{tela_nombre}' → {tela_general_nombre} (ya asignado)")
                else:
                    await conn.execute(
                        "UPDATE prod_telas SET tela_general_id = $1 WHERE id = $2",
                        tg_id, tela["id"]
                    )
                    print(f"  [SET] Tela '{tela_nombre}' → {tela_general_nombre}")

            # ── PASO D: Dropear prod_tipos_tela ──────────────────────────────
            print("\n=== PASO D: Eliminar prod_tipos_tela ===")
            if tabla_existe:
                await conn.execute("DROP TABLE IF EXISTS prod_tipos_tela")
                print("  [OK]  prod_tipos_tela eliminada")
            else:
                print("  [SKIP] prod_tipos_tela no existe")

            # ── PASO E: Eliminar tipo_tela_id de prod_modelos ────────────────
            print("\n=== PASO E: Eliminar tipo_tela_id de prod_modelos ===")
            col_existe = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'prod_modelos' AND column_name = 'tipo_tela_id'
                )
            """)
            if col_existe:
                count_with_data = await conn.fetchval(
                    "SELECT COUNT(*) FROM prod_modelos WHERE tipo_tela_id IS NOT NULL"
                )
                if count_with_data > 0:
                    print(f"  [WARN] {count_with_data} modelos tienen tipo_tela_id != NULL — columna NO dropeada")
                    print("         Revisar manualmente antes de dropear")
                else:
                    await conn.execute("ALTER TABLE prod_modelos DROP COLUMN IF EXISTS tipo_tela_id")
                    print("  [OK]  Columna tipo_tela_id eliminada de prod_modelos")
            else:
                print("  [SKIP] Columna tipo_tela_id no existe")

            # ── Verificación final ───────────────────────────────────────────
            print("\n=== VERIFICACIÓN FINAL ===")
            n_tg = await conn.fetchval("SELECT COUNT(*) FROM prod_telas_general")
            n_t = await conn.fetchval("SELECT COUNT(*) FROM prod_telas")
            n_sin_padre = await conn.fetchval("SELECT COUNT(*) FROM prod_telas WHERE tela_general_id IS NULL")
            print(f"  Telas Generales: {n_tg}  (esperado: 3)")
            print(f"  Telas:          {n_t}  (esperado: 11)")
            print(f"  Sin padre:       {n_sin_padre}  (esperado: 0)")

            tg_rows = await conn.fetch("SELECT id, nombre FROM prod_telas_general ORDER BY orden")
            for tg in tg_rows:
                hijas = await conn.fetch("SELECT nombre FROM prod_telas WHERE tela_general_id = $1 ORDER BY nombre", tg["id"])
                nombres_hijas = [h["nombre"] for h in hijas]
                print(f"  {tg['nombre']}: {nombres_hijas}")

    await pool.close()
    print("\nMigración completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
