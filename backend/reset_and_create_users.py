"""
Script para vaciar todas las tablas de producción y crear usuarios con permisos.
Ejecutar: python3 reset_and_create_users.py
"""
import asyncio
import json
import uuid
import bcrypt
import asyncpg

DB_URL = "postgresql://admin:admin@72.60.241.216:9595/datos"
SCHEMA = "produccion"

def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

# ---------- permisos helpers ----------
def solo_ver(*tablas):
    """Permisos de solo lectura para las tablas indicadas."""
    return {t: {"ver": True, "crear": False, "editar": False, "eliminar": False} for t in tablas}

def crud(*tablas):
    return {t: {"ver": True, "crear": True, "editar": True, "eliminar": True} for t in tablas}

def ver_crear(*tablas):
    return {t: {"ver": True, "crear": True, "editar": False, "eliminar": False} for t in tablas}

def ver_crear_editar(*tablas):
    return {t: {"ver": True, "crear": True, "editar": True, "eliminar": False} for t in tablas}

# ---------- usuarios ----------
USERS = [
    # 1. eduard — admin
    {
        "username": "eduard",
        "nombre_completo": "Eduard Cardenas",
        "rol": "admin",
        "password": "eduard123",
        "permisos": {},
    },
    # 2. raul — costura, para atraque, atraque, para lavandería
    {
        "username": "raul",
        "nombre_completo": "Raul",
        "rol": "usuario",
        "password": "raul123",
        "permisos": {
            **solo_ver("registros", "movimientos_produccion"),
            "_operativos": {
                "servicios_permitidos": [],
                "estados_permitidos": ["Costura", "Para Atraque", "Atraque", "Para Lavandería"],
                "acciones_produccion": {
                    "crear_movimientos": False,
                    "editar_movimientos": False,
                    "cambiar_estados": True,
                    "registrar_incidencias": False,
                    "resolver_incidencias": False,
                    "dividir_lotes": False,
                    "cerrar_lotes": False,
                },
                "acciones_inventario": {
                    "crear_items": False,
                    "registrar_ingresos": False,
                    "dar_salida_mp": False,
                    "reservar_materiales": False,
                    "ajustes_stock": False,
                    "gestionar_bom": False,
                },
            },
        },
    },
    # 3. diana — igual que raul
    {
        "username": "diana",
        "nombre_completo": "Diana",
        "rol": "usuario",
        "password": "diana123",
        "permisos": {
            **solo_ver("registros", "movimientos_produccion"),
            "_operativos": {
                "servicios_permitidos": [],
                "estados_permitidos": ["Costura", "Para Atraque", "Atraque", "Para Lavandería"],
                "acciones_produccion": {
                    "crear_movimientos": False,
                    "editar_movimientos": False,
                    "cambiar_estados": True,
                    "registrar_incidencias": False,
                    "resolver_incidencias": False,
                    "dividir_lotes": False,
                    "cerrar_lotes": False,
                },
                "acciones_inventario": {
                    "crear_items": False,
                    "registrar_ingresos": False,
                    "dar_salida_mp": False,
                    "reservar_materiales": False,
                    "ajustes_stock": False,
                    "gestionar_bom": False,
                },
            },
        },
    },
    # 4. cristian-casas — corte, para costura, descarga MP, crear registro/modelo/base,
    #    agregar tallas/cantidades, modificar, crear marca/tipo/entalle/telas/hilos/hilo_especifico
    {
        "username": "cristian-casas",
        "nombre_completo": "Cristian Casas",
        "rol": "usuario",
        "password": "cristian-casas123",
        "permisos": {
            **ver_crear_editar("registros"),
            **solo_ver("movimientos_produccion"),
            **ver_crear_editar("modelos"),
            **crud("marcas", "tipos", "entalles", "telas", "hilos", "hilos_especificos"),
            **solo_ver("tallas", "colores", "colores_generales"),
            **solo_ver("inventario", "inventario_ingresos", "inventario_salidas"),
            "_operativos": {
                "servicios_permitidos": [],
                "estados_permitidos": ["Corte", "Para Costura"],
                "acciones_produccion": {
                    "crear_movimientos": True,
                    "editar_movimientos": False,
                    "cambiar_estados": True,
                    "registrar_incidencias": False,
                    "resolver_incidencias": False,
                    "dividir_lotes": False,
                    "cerrar_lotes": False,
                },
                "acciones_inventario": {
                    "crear_items": False,
                    "registrar_ingresos": False,
                    "dar_salida_mp": True,
                    "reservar_materiales": False,
                    "ajustes_stock": False,
                    "gestionar_bom": False,
                },
            },
        },
    },
    # 5. fortunato — corte, para costura, descarga MP, agregar tallas/cantidades
    {
        "username": "fortunato",
        "nombre_completo": "Fortunato",
        "rol": "usuario",
        "password": "fortunato123",
        "permisos": {
            **{
                "registros": {"ver": True, "crear": False, "editar": True, "eliminar": False},
            },
            **solo_ver("movimientos_produccion"),
            **solo_ver("inventario", "inventario_salidas"),
            "_operativos": {
                "servicios_permitidos": [],
                "estados_permitidos": ["Corte", "Para Costura"],
                "acciones_produccion": {
                    "crear_movimientos": False,
                    "editar_movimientos": False,
                    "cambiar_estados": True,
                    "registrar_incidencias": False,
                    "resolver_incidencias": False,
                    "dividir_lotes": False,
                    "cerrar_lotes": False,
                },
                "acciones_inventario": {
                    "crear_items": False,
                    "registrar_ingresos": False,
                    "dar_salida_mp": True,
                    "reservar_materiales": False,
                    "ajustes_stock": False,
                    "gestionar_bom": False,
                },
            },
        },
    },
    # 6. mirian — crear registro, modelo, base, pone "Para Corte" (al crear)
    {
        "username": "mirian",
        "nombre_completo": "Mirian",
        "rol": "usuario",
        "password": "mirian123",
        "permisos": {
            **ver_crear("registros"),
            **ver_crear("modelos"),
            **solo_ver("movimientos_produccion", "tallas", "colores", "colores_generales",
                       "marcas", "tipos", "entalles", "telas", "hilos", "hilos_especificos"),
            "_operativos": {
                "servicios_permitidos": [],
                "estados_permitidos": ["Para Corte"],
                "acciones_produccion": {
                    "crear_movimientos": False,
                    "editar_movimientos": False,
                    "cambiar_estados": False,
                    "registrar_incidencias": False,
                    "resolver_incidencias": False,
                    "dividir_lotes": False,
                    "cerrar_lotes": False,
                },
                "acciones_inventario": {
                    "crear_items": False,
                    "registrar_ingresos": False,
                    "dar_salida_mp": False,
                    "reservar_materiales": False,
                    "ajustes_stock": False,
                    "gestionar_bom": False,
                },
            },
        },
    },
    # 7. omar — lavandería, para acabado, acabado, producto terminado,
    #    agregar colores en registro y tablas, salida MP, guía de remisión
    {
        "username": "omar",
        "nombre_completo": "Omar",
        "rol": "usuario",
        "password": "omar123",
        "permisos": {
            **{
                "registros": {"ver": True, "crear": False, "editar": True, "eliminar": False},
            },
            **solo_ver("movimientos_produccion"),
            **crud("colores", "colores_generales"),
            **{
                "inventario_salidas": {"ver": True, "crear": True, "editar": False, "eliminar": False},
            },
            **solo_ver("inventario", "inventario_ingresos"),
            **crud("guias_remision"),
            "_operativos": {
                "servicios_permitidos": [],
                "estados_permitidos": ["Lavandería", "Para Acabado", "Acabado", "Producto Terminado"],
                "acciones_produccion": {
                    "crear_movimientos": False,
                    "editar_movimientos": False,
                    "cambiar_estados": True,
                    "registrar_incidencias": False,
                    "resolver_incidencias": False,
                    "dividir_lotes": False,
                    "cerrar_lotes": False,
                },
                "acciones_inventario": {
                    "crear_items": False,
                    "registrar_ingresos": False,
                    "dar_salida_mp": True,
                    "reservar_materiales": False,
                    "ajustes_stock": False,
                    "gestionar_bom": False,
                },
            },
        },
    },
    # 8. lorena — solo acepta cierre (almacén PT, confirma cuánto le llegó)
    {
        "username": "lorena",
        "nombre_completo": "Lorena",
        "rol": "usuario",
        "password": "lorena123",
        "permisos": {
            **solo_ver("registros", "movimientos_produccion"),
            "_operativos": {
                "servicios_permitidos": [],
                "estados_permitidos": ["Almacén PT"],
                "acciones_produccion": {
                    "crear_movimientos": False,
                    "editar_movimientos": False,
                    "cambiar_estados": True,
                    "registrar_incidencias": False,
                    "resolver_incidencias": False,
                    "dividir_lotes": False,
                    "cerrar_lotes": True,
                },
                "acciones_inventario": {
                    "crear_items": False,
                    "registrar_ingresos": False,
                    "dar_salida_mp": False,
                    "reservar_materiales": False,
                    "ajustes_stock": False,
                    "gestionar_bom": False,
                },
            },
        },
    },
    # 9. tait — admin
    {
        "username": "tait",
        "nombre_completo": "Tait",
        "rol": "admin",
        "password": "tait123",
        "permisos": {},
    },
    # 10. maria — admin
    {
        "username": "maria",
        "nombre_completo": "Maria",
        "rol": "admin",
        "password": "maria123",
        "permisos": {},
    },
]

# Tablas a vaciar (orden importa por foreign keys)
TABLES_TO_TRUNCATE = [
    # Dependientes primero
    "prod_registro_costos_servicio",
    "prod_registro_cierre",
    "prod_inventario_reservas_linea",
    "prod_inventario_reservas",
    "prod_inventario_ajustes",
    "prod_inventario_salidas",
    "prod_inventario_ingresos",
    "prod_inventario_rollos",
    "prod_registro_requerimiento_mp",
    "prod_registro_tallas",
    "prod_movimientos_produccion",
    "prod_servicio_orden",
    "prod_incidencia",
    "prod_paralizacion",
    "prod_conversacion",
    "prod_modelo_bom_linea",
    "prod_bom_cabecera",
    "prod_modelo_tallas",
    # Principales
    "prod_registros",
    "prod_modelos",
    "prod_inventario",
    # Catálogos
    "prod_hilos_especificos",
    "prod_hilos",
    "prod_telas",
    "prod_entalles",
    "prod_tipos",
    "prod_marcas",
    "prod_tallas",
    "prod_colores",
    "prod_colores_generales",
    # Maestros
    "prod_personas_produccion",
    "prod_servicios_produccion",
    "prod_rutas_produccion",
    "prod_motivos_incidencia",
    # Auditoría y actividad
    "prod_actividad_historial",
    "audit_log",
    # Usuarios
    "prod_usuarios",
]


async def main():
    conn = await asyncpg.connect(DB_URL)
    try:
        # Set schema
        await conn.execute(f"SET search_path TO {SCHEMA}, public")

        # 1. Truncar todas las tablas
        print("=== Vaciando tablas ===")
        for table in TABLES_TO_TRUNCATE:
            try:
                await conn.execute(f"TRUNCATE TABLE {table} CASCADE")
                print(f"  ✓ {table}")
            except Exception as e:
                print(f"  ✗ {table}: {e}")

        # 2. Crear usuarios
        print("\n=== Creando usuarios ===")
        for u in USERS:
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
            print(f"  ✓ {u['username']} ({u['rol']}) — contraseña: {u['password']}")

        print("\n=== Listo ===")
        print(f"Tablas vaciadas: {len(TABLES_TO_TRUNCATE)}")
        print(f"Usuarios creados: {len(USERS)}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
