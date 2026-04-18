"""
Seed de clasificación de productos — valores definitivos.
Idempotente: busca por nombre antes de insertar, nunca duplica.
Actualiza cascadas (JSONB arrays) sin perder datos existentes.

Uso:
    cd produccion/backend
    python scripts/seed_clasificacion.py
"""
import asyncio
import sys
import os
import uuid
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_pool


# ── Helpers ─────────────────────────────────────────────────────────────────

def new_id():
    return str(uuid.uuid4())

def now():
    return datetime.utcnow()

async def get_by_name(conn, tabla, nombre):
    """Devuelve la fila completa si existe, None si no."""
    return await conn.fetchrow(f"SELECT * FROM {tabla} WHERE nombre = $1", nombre)

async def ensure_marca(conn, nombre):
    existing = await get_by_name(conn, "prod_marcas", nombre)
    if existing:
        print(f"  [OK]  Marca '{nombre}' ya existe")
        return dict(existing)
    max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_marcas")
    row = {"id": new_id(), "nombre": nombre, "orden": max_orden + 1, "created_at": now()}
    await conn.execute(
        "INSERT INTO prod_marcas (id, nombre, orden, created_at) VALUES ($1, $2, $3, $4)",
        row["id"], row["nombre"], row["orden"], row["created_at"]
    )
    print(f"  [NEW] Marca '{nombre}' creada")
    return row

async def ensure_tipo(conn, nombre, marca_ids):
    existing = await get_by_name(conn, "prod_tipos", nombre)
    if existing:
        print(f"  [OK]  Tipo '{nombre}' ya existe")
        return dict(existing)
    max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_tipos")
    row = {"id": new_id(), "nombre": nombre, "marca_ids": marca_ids, "orden": max_orden + 1, "created_at": now()}
    await conn.execute(
        "INSERT INTO prod_tipos (id, nombre, marca_ids, orden, created_at) VALUES ($1, $2, $3::jsonb, $4, $5)",
        row["id"], row["nombre"], json.dumps(row["marca_ids"]), row["orden"], row["created_at"]
    )
    print(f"  [NEW] Tipo '{nombre}' creado")
    return row

async def update_tipo_marca_ids(conn, tipo_nombre, nuevas_marcas_ids):
    """Agrega marcas al tipo sin perder las que ya tiene."""
    row = await get_by_name(conn, "prod_tipos", tipo_nombre)
    if not row:
        print(f"  [WARN] Tipo '{tipo_nombre}' no encontrado, saltando")
        return
    current = []
    raw = row["marca_ids"]
    if raw:
        try:
            current = json.loads(raw) if isinstance(raw, str) else list(raw)
        except Exception:
            current = []
    union = list(dict.fromkeys(current + [m for m in nuevas_marcas_ids if m not in current]))
    await conn.execute(
        "UPDATE prod_tipos SET marca_ids = $1::jsonb WHERE id = $2",
        json.dumps(union), row["id"]
    )
    print(f"  [UPD] Tipo '{tipo_nombre}' → marca_ids actualizado ({len(current)} → {len(union)} marcas)")

async def ensure_entalle(conn, nombre, tipo_ids):
    existing = await get_by_name(conn, "prod_entalles", nombre)
    if existing:
        print(f"  [OK]  Entalle '{nombre}' ya existe")
        return dict(existing)
    max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_entalles")
    row = {"id": new_id(), "nombre": nombre, "tipo_ids": tipo_ids, "orden": max_orden + 1, "created_at": now()}
    await conn.execute(
        "INSERT INTO prod_entalles (id, nombre, tipo_ids, orden, created_at) VALUES ($1, $2, $3::jsonb, $4, $5)",
        row["id"], row["nombre"], json.dumps(row["tipo_ids"]), row["orden"], row["created_at"]
    )
    print(f"  [NEW] Entalle '{nombre}' creado")
    return row

async def update_entalle_tipo_ids(conn, entalle_nombre, nuevos_tipo_ids):
    """Agrega tipos al entalle sin perder los que ya tiene."""
    row = await get_by_name(conn, "prod_entalles", entalle_nombre)
    if not row:
        print(f"  [WARN] Entalle '{entalle_nombre}' no encontrado, saltando")
        return
    current = []
    raw = row["tipo_ids"]
    if raw:
        try:
            current = json.loads(raw) if isinstance(raw, str) else list(raw)
        except Exception:
            current = []
    union = list(dict.fromkeys(current + [t for t in nuevos_tipo_ids if t not in current]))
    await conn.execute(
        "UPDATE prod_entalles SET tipo_ids = $1::jsonb WHERE id = $2",
        json.dumps(union), row["id"]
    )
    print(f"  [UPD] Entalle '{entalle_nombre}' → tipo_ids actualizado ({len(current)} → {len(union)} tipos)")

async def ensure_tela(conn, nombre, entalle_ids):
    existing = await get_by_name(conn, "prod_telas", nombre)
    if existing:
        print(f"  [OK]  Tela '{nombre}' ya existe")
        return dict(existing)
    max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_telas")
    row = {"id": new_id(), "nombre": nombre, "entalle_ids": entalle_ids, "orden": max_orden + 1, "created_at": now()}
    await conn.execute(
        "INSERT INTO prod_telas (id, nombre, entalle_ids, orden, created_at) VALUES ($1, $2, $3::jsonb, $4, $5)",
        row["id"], row["nombre"], json.dumps(row["entalle_ids"]), row["orden"], row["created_at"]
    )
    print(f"  [NEW] Tela '{nombre}' creada")
    return row

async def ensure_genero(conn, nombre, marca_ids):
    existing = await get_by_name(conn, "prod_generos", nombre)
    if existing:
        print(f"  [OK]  Género '{nombre}' ya existe")
        return dict(existing)
    max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_generos")
    row = {"id": new_id(), "nombre": nombre, "marca_ids": marca_ids, "orden": max_orden + 1, "created_at": now()}
    await conn.execute(
        "INSERT INTO prod_generos (id, nombre, marca_ids, orden, created_at) VALUES ($1, $2, $3::jsonb, $4, $5)",
        row["id"], row["nombre"], json.dumps(row["marca_ids"]), row["orden"], row["created_at"]
    )
    print(f"  [NEW] Género '{nombre}' creado")
    return row

async def ensure_tipo_tela(conn, nombre, tela_ids):
    existing = await get_by_name(conn, "prod_tipos_tela", nombre)
    if existing:
        print(f"  [OK]  Tipo de tela '{nombre}' ya existe")
        return dict(existing)
    max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_tipos_tela")
    row = {"id": new_id(), "nombre": nombre, "tela_ids": tela_ids, "orden": max_orden + 1, "created_at": now()}
    await conn.execute(
        "INSERT INTO prod_tipos_tela (id, nombre, tela_ids, orden, created_at) VALUES ($1, $2, $3::jsonb, $4, $5)",
        row["id"], row["nombre"], json.dumps(row["tela_ids"]), row["orden"], row["created_at"]
    )
    print(f"  [NEW] Tipo de tela '{nombre}' creado")
    return row

async def ensure_cuello(conn, nombre, tipo_ids):
    existing = await get_by_name(conn, "prod_cuellos", nombre)
    if existing:
        print(f"  [OK]  Cuello '{nombre}' ya existe")
        return dict(existing)
    max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_cuellos")
    row = {"id": new_id(), "nombre": nombre, "tipo_ids": tipo_ids, "orden": max_orden + 1, "created_at": now()}
    await conn.execute(
        "INSERT INTO prod_cuellos (id, nombre, tipo_ids, orden, created_at) VALUES ($1, $2, $3::jsonb, $4, $5)",
        row["id"], row["nombre"], json.dumps(row["tipo_ids"]), row["orden"], row["created_at"]
    )
    print(f"  [NEW] Cuello '{nombre}' creado")
    return row


# ── Main ─────────────────────────────────────────────────────────────────────

async def seed():
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():

            print("\n=== PASO 1: MARCAS ===")
            m_element  = await ensure_marca(conn, "Element Premium")
            m_qepo     = await ensure_marca(conn, "Qepo")
            m_boosh    = await ensure_marca(conn, "Boosh")
            m_ep       = await ensure_marca(conn, "EP Studio")

            all_marca_ids = [m_element["id"], m_qepo["id"], m_boosh["id"], m_ep["id"]]

            print("\n=== PASO 2: TIPOS — crear nuevos ===")
            t_pantalon = await ensure_tipo(conn, "Pantalon", all_marca_ids)
            t_polo     = await ensure_tipo(conn, "Polo",     all_marca_ids)
            t_short    = await ensure_tipo(conn, "Short",    all_marca_ids)
            t_casaca   = await ensure_tipo(conn, "Casaca",   all_marca_ids)

            print("\n=== PASO 2b: TIPOS — actualizar cascadas existentes ===")
            # Pantalon existente: agregar EP Studio
            await update_tipo_marca_ids(conn, "Pantalon", [m_ep["id"]])
            # Polo existente: agregar Boosh y EP Studio
            await update_tipo_marca_ids(conn, "Polo", [m_boosh["id"], m_ep["id"]])

            print("\n=== PASO 3: ENTALLES — crear nuevos ===")
            # Nuevos entalles para Pantalon
            e_jogger         = await ensure_entalle(conn, "Jogger",         [t_pantalon["id"]])
            e_jogger_cargo   = await ensure_entalle(conn, "Jogger Cargo",   [t_pantalon["id"]])
            e_oversize_cargo = await ensure_entalle(conn, "Oversize Cargo", [t_pantalon["id"]])
            # Short
            e_torero         = await ensure_entalle(conn, "Torero",         [t_short["id"]])
            # Casaca
            e_slim           = await ensure_entalle(conn, "Slim",           [t_casaca["id"]])
            # Polo
            e_boxi           = await ensure_entalle(conn, "Boxi fit",       [t_polo["id"]])

            print("\n=== PASO 4: ENTALLES — actualizar cascadas existentes ===")
            # Regular → Pantalon ya lo tiene, agregar Polo + Short + Casaca
            await update_entalle_tipo_ids(conn, "Regular", [t_polo["id"], t_short["id"], t_casaca["id"]])
            # Oversize → Pantalon ya lo tiene, agregar Polo + Casaca
            await update_entalle_tipo_ids(conn, "Oversize", [t_polo["id"], t_casaca["id"]])

            print("\n=== PASO 5: TELAS — crear nuevas ===")
            # Entalles pre-existentes que necesitamos para Drill/Jersey
            pre_existentes_drill = ["Skinny", "Pitillo", "Semipitillo", "Regular", "Mom", "Flare", "Oversize", "Baggy"]
            entalle_ids_drill = []
            for nombre in pre_existentes_drill:
                row = await get_by_name(conn, "prod_entalles", nombre)
                if row:
                    entalle_ids_drill.append(row["id"])
                else:
                    print(f"  [WARN] Entalle '{nombre}' no encontrado para Drill")
            # Agregar los nuevos ya creados (ids ya disponibles)
            entalle_ids_drill += [e_jogger["id"], e_jogger_cargo["id"], e_oversize_cargo["id"], e_torero["id"]]

            # Para Jersey: pre-existentes Regular y Oversize + nuevos Slim y Boxi fit
            entalle_ids_jersey = []
            for nombre in ["Regular", "Oversize"]:
                row = await get_by_name(conn, "prod_entalles", nombre)
                if row:
                    entalle_ids_jersey.append(row["id"])
                else:
                    print(f"  [WARN] Entalle '{nombre}' no encontrado para Jersey")
            entalle_ids_jersey += [e_slim["id"], e_boxi["id"]]

            await ensure_tela(conn, "Drill",  entalle_ids_drill)
            await ensure_tela(conn, "Jersey", entalle_ids_jersey)
            # Denim y Comfort: no se tocan

            print("\n=== PASO 6: GÉNEROS ===")
            await ensure_genero(conn, "Hombre", all_marca_ids)
            await ensure_genero(conn, "Mujer",  all_marca_ids)

            print("\n=== PASO 7: TIPOS DE TELA ===")
            # Obtener IDs de telas por nombre
            tela_denim  = await get_by_name(conn, "prod_telas", "Denim")
            tela_drill  = await get_by_name(conn, "prod_telas", "Drill")
            tela_jersey = await get_by_name(conn, "prod_telas", "Jersey")

            id_denim  = tela_denim["id"]  if tela_denim  else None
            id_drill  = tela_drill["id"]  if tela_drill  else None
            id_jersey = tela_jersey["id"] if tela_jersey else None

            await ensure_tipo_tela(conn, "Satinado",    [id_denim] if id_denim else [])
            await ensure_tipo_tela(conn, "Rígido",      [x for x in [id_denim, id_drill] if x])
            await ensure_tipo_tela(conn, "Paper touch", [id_drill]  if id_drill  else [])
            await ensure_tipo_tela(conn, "Jersey 24/1", [id_jersey] if id_jersey else [])
            await ensure_tipo_tela(conn, "Jersey 20/1", [id_jersey] if id_jersey else [])

            print("\n=== PASO 8: CUELLOS ===")
            await ensure_cuello(conn, "V",       [t_polo["id"]])
            await ensure_cuello(conn, "Redondo", [t_polo["id"]])

            print("\n=== PASO 9: DETALLES (vacío — se agrega desde UI) ===")
            print("  [OK]  Sin seed, el usuario agrega manualmente")

            # ── Resumen final ─────────────────────────────────────────────
            print("\n=== RESUMEN FINAL ===")
            counts = {}
            for tabla, label in [
                ("prod_marcas",     "marcas"),
                ("prod_tipos",      "tipos"),
                ("prod_entalles",   "entalles"),
                ("prod_telas",      "telas"),
                ("prod_generos",    "generos"),
                ("prod_tipos_tela", "tiposTela"),
                ("prod_cuellos",    "cuellos"),
                ("prod_detalles",   "detalles"),
            ]:
                n = await conn.fetchval(f"SELECT COUNT(*) FROM {tabla}")
                counts[label] = int(n)
                print(f"  {label}: {n}")

            print(f"""
Esperado:
  marcas:    4  → {'✓' if counts['marcas']    == 4 else '✗ GOT ' + str(counts['marcas'])}
  tipos:     4  → {'✓' if counts['tipos']     == 4 else '✗ GOT ' + str(counts['tipos'])}
  entalles: 14  → {'✓' if counts['entalles'] == 14 else '✗ GOT ' + str(counts['entalles'])}
  telas:     4  → {'✓' if counts['telas']     == 4 else '✗ GOT ' + str(counts['telas'])}
  generos:   2  → {'✓' if counts['generos']   == 2 else '✗ GOT ' + str(counts['generos'])}
  tiposTela: 5  → {'✓' if counts['tiposTela'] == 5 else '✗ GOT ' + str(counts['tiposTela'])}
  cuellos:   2  → {'✓' if counts['cuellos']   == 2 else '✗ GOT ' + str(counts['cuellos'])}
""")

    await pool.close()
    print("Seed completado.")


if __name__ == "__main__":
    asyncio.run(seed())
