"""
Migración de roles para alinearlos con la matriz de permisos móvil.

Lo que hace:
    1. Crea el usuario `inventario` (supervisor de inventario) si no existe.
    2. Actualiza el campo `rol` de los usuarios existentes para que coincida
       con los roles que el frontend móvil usa en src/mobile/utils/permisos.js.

Lo que NO hace:
    - NO toca el campo `permisos` JSON existente (sigue siendo válido como
      override por usuario).
    - NO borra ni modifica datos de producción.
    - NO afecta a los admins (eduard, tait, maria).

Ejecutar:
    python3 migrate_roles_mobile.py

Es idempotente: se puede correr varias veces sin efectos negativos.
"""

import asyncio
import json
import uuid
import bcrypt
import asyncpg

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / '.env')
DB_URL = os.environ['DATABASE_URL']  # falla explicito si no esta configurado
SCHEMA = "produccion"


def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ─── Mapeo username → rol nuevo ─────────────────────────────────────────────
# Estos roles tienen que coincidir con las claves de ROLES_PRESET en
# frontend/src/mobile/utils/permisos.js
ROL_POR_USUARIO = {
    "eduard":         "admin",
    "tait":           "admin",
    "maria":          "admin",
    "mirian":         "operario",                       # crea cortes
    "cristian-casas": "supervisor_corte_planificacion", # corte/estampado/bordado + descarga toda MP
    "fortunato":      "supervisor_corte",               # corte/estampado/bordado + descarga solo tela
    "raul":           "operario_costura",               # costura
    "diana":          "supervisor_atraque_lavanderia",  # atraque + envío lavandería
    "omar":           "supervisor_acabado",             # retorno lavandería + acabado + PT
    "lorena":         "encargada_pt",                   # almacén PT + tienda
}


# ─── Usuarios nuevos que faltan ──────────────────────────────────────────────
# Si el username ya existe, se ignora y solo se actualiza el rol.
PERMISOS_INVENTARIO_USER = {
    # Inventario: TODO (lo suyo)
    "inventario": {"ver": True, "crear": True, "editar": True, "eliminar": False},
    "inventario_ingresos": {"ver": True, "crear": True, "editar": True, "eliminar": False},
    "inventario_salidas": {"ver": True, "crear": True, "editar": True, "eliminar": False},
    # Registros (cortes): solo VER — necesario para cruzar las salidas con cortes
    "registros": {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "movimientos_produccion": {"ver": True, "crear": False, "editar": False, "eliminar": False},
    # Catálogos: solo VER — para que las pantallas que muestran modelo/marca/tela cargen
    "modelos":  {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "marcas":   {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "tipos":    {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "entalles": {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "telas":    {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "hilos":    {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "hilos_especificos": {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "tallas":   {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "colores":  {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "colores_generales": {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "guias_remision":    {"ver": True, "crear": False, "editar": False, "eliminar": False},
    "_operativos": {
        "servicios_permitidos": [],
        "estados_permitidos": [],
        "acciones_produccion": {
            "crear_movimientos": False,
            "editar_movimientos": False,
            "cambiar_estados": False,
            "registrar_incidencias": True,
            "resolver_incidencias": False,
            "dividir_lotes": False,
            "cerrar_lotes": False,
        },
        "acciones_inventario": {
            "crear_items": True,
            "registrar_ingresos": True,
            "dar_salida_mp": True,
            "reservar_materiales": True,
            "ajustes_stock": True,
            "gestionar_bom": False,
        },
    },
}

USUARIOS_NUEVOS = [
    {
        "username": "inventario",
        "nombre_completo": "Supervisor Inventario",
        "rol": "supervisor_inventario",
        "password": "inventario123",
        "permisos": PERMISOS_INVENTARIO_USER,
    },
]


async def main():
    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute(f"SET search_path TO {SCHEMA}, public")

        print("=== Migración de roles móvil ===\n")

        # 1. Actualizar rol de usuarios existentes
        print("→ Actualizando roles de usuarios existentes")
        cambiados = 0
        no_encontrados = []
        for username, nuevo_rol in ROL_POR_USUARIO.items():
            row = await conn.fetchrow(
                "SELECT id, rol FROM prod_usuarios WHERE username = $1",
                username,
            )
            if not row:
                no_encontrados.append(username)
                continue
            if row["rol"] == nuevo_rol:
                print(f"  · {username:20s} ya tenía rol={nuevo_rol} (sin cambio)")
                continue
            await conn.execute(
                "UPDATE prod_usuarios SET rol = $1, updated_at = NOW() WHERE id = $2",
                nuevo_rol,
                row["id"],
            )
            print(f"  ✓ {username:20s} {row['rol']:10s} → {nuevo_rol}")
            cambiados += 1

        if no_encontrados:
            print("\n⚠ Usuarios no encontrados (saltados):")
            for u in no_encontrados:
                print(f"  · {u}")

        # 2. Crear usuarios nuevos que falten
        print("\n→ Creando usuarios nuevos si no existen")
        nuevos = 0
        for u in USUARIOS_NUEVOS:
            existe = await conn.fetchval(
                "SELECT 1 FROM prod_usuarios WHERE username = $1",
                u["username"],
            )
            if existe:
                # Si existe, actualizamos rol Y permisos (los permisos pueden haber cambiado
                # entre versiones del script).
                permisos_json = json.dumps(u["permisos"])
                await conn.execute(
                    "UPDATE prod_usuarios SET rol = $1, permisos = $2::jsonb, updated_at = NOW() "
                    "WHERE username = $3",
                    u["rol"],
                    permisos_json,
                    u["username"],
                )
                print(f"  ↻ {u['username']:20s} ya existe (rol={u['rol']}, permisos actualizados)")
                continue
            user_id = str(uuid.uuid4())
            pw_hash = hash_pw(u["password"])
            permisos_json = json.dumps(u["permisos"])
            await conn.execute(
                """INSERT INTO prod_usuarios
                   (id, username, email, password_hash, nombre_completo, rol, permisos, activo, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())""",
                user_id,
                u["username"],
                u.get("email"),
                pw_hash,
                u["nombre_completo"],
                u["rol"],
                permisos_json,
            )
            print(f"  ✓ {u['username']:20s} CREADO ({u['rol']}) · contraseña: {u['password']}")
            nuevos += 1

        # 3. Resumen final
        print("\n=== Listo ===")
        print(f"Roles actualizados : {cambiados}")
        print(f"Usuarios creados   : {nuevos}")

        # 4. Mostrar estado final
        print("\n=== Estado actual ===")
        rows = await conn.fetch(
            "SELECT username, nombre_completo, rol FROM prod_usuarios "
            "WHERE activo = true ORDER BY rol, username"
        )
        for r in rows:
            print(f"  {r['username']:20s} {r['rol']:35s} {r['nombre_completo']}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
