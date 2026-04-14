"""
DDL ejecutado al iniciar la aplicación.
Todas las sentencias son idempotentes (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
"""
import uuid
from db import get_pool


async def ensure_bom_tables():
    """Crea tablas necesarias para BOM (sin modificar tablas existentes).

    Nota: no se crean FKs porque el resto del proyecto no las usa.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Tabla relación Modelo ↔ Tallas
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS prod_modelo_tallas (
                id VARCHAR PRIMARY KEY,
                modelo_id VARCHAR NOT NULL,
                talla_id VARCHAR NOT NULL,
                activo BOOLEAN DEFAULT TRUE,
                orden INT DEFAULT 10,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_modelo_tallas_modelo ON prod_modelo_tallas(modelo_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_modelo_tallas_talla ON prod_modelo_tallas(talla_id)"
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_modelo_talla_activo
            ON prod_modelo_tallas(modelo_id, talla_id)
            WHERE activo = TRUE
            """
        )

        # Tabla BOM por modelo (talla_id NULL = general, talla_id definido = por talla)
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS prod_modelo_bom_linea (
                id VARCHAR PRIMARY KEY,
                modelo_id VARCHAR NOT NULL,
                inventario_id VARCHAR NOT NULL,
                talla_id VARCHAR NULL,
                unidad_base VARCHAR DEFAULT 'PRENDA',
                cantidad_base NUMERIC(14,4) NOT NULL,
                orden INT DEFAULT 10,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bom_modelo_id ON prod_modelo_bom_linea(modelo_id)"
        )
        # Si la tabla ya existía de antes, aseguramos columnas nuevas sin romper datos
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS orden INT DEFAULT 10")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS bom_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS tipo_componente VARCHAR DEFAULT 'TELA'")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS merma_pct NUMERIC(5,2) DEFAULT 0")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS cantidad_total NUMERIC(14,4) NULL")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS es_opcional BOOLEAN DEFAULT FALSE")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS etapa_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS observaciones TEXT NULL")

        # Tabla cabecera BOM
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_bom_cabecera (
                id VARCHAR PRIMARY KEY,
                modelo_id VARCHAR NOT NULL,
                codigo VARCHAR,
                version INT NOT NULL DEFAULT 1,
                estado VARCHAR NOT NULL DEFAULT 'BORRADOR',
                vigente_desde TIMESTAMP NULL,
                vigente_hasta TIMESTAMP NULL,
                observaciones TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_bom_cab_modelo ON prod_bom_cabecera(modelo_id)")
        await conn.execute("ALTER TABLE prod_bom_cabecera ADD COLUMN IF NOT EXISTS nombre VARCHAR NULL")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_bom_linea_bom_id ON prod_modelo_bom_linea(bom_id)")

        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bom_inventario_id ON prod_modelo_bom_linea(inventario_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bom_talla_id ON prod_modelo_bom_linea(talla_id)"
        )
        # Old constraint was too restrictive - needs to include bom_id for multiple versions
        await conn.execute("DROP INDEX IF EXISTS uq_bom_linea_activo")
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_bom_linea_activo_v2
            ON prod_modelo_bom_linea(bom_id, inventario_id, COALESCE(talla_id, '__NULL__'))
            WHERE activo = TRUE
            """
        )

    # Asegurar columnas nuevas en prod_registros
    async with pool.acquire() as conn:
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS observaciones TEXT")
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS skip_validacion_estado BOOLEAN DEFAULT FALSE")

        # Tabla de motivos de incidencia (catálogo administrable)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_motivos_incidencia (
                id VARCHAR PRIMARY KEY,
                nombre VARCHAR NOT NULL UNIQUE,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        # Seed defaults si tabla vacía
        count = await conn.fetchval("SELECT COUNT(*) FROM prod_motivos_incidencia")
        if count == 0:
            defaults = ['Falta Material', 'Falta Avíos', 'Retraso Taller', 'Calidad', 'Cambio Prioridad', 'Sin Capacidad', 'Reprogramación', 'Otro']
            for nombre in defaults:
                await conn.execute(
                    "INSERT INTO prod_motivos_incidencia (id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    str(uuid.uuid4()), nombre
                )

        # Agregar columna paraliza a incidencias existentes
        await conn.execute("ALTER TABLE prod_incidencia ADD COLUMN IF NOT EXISTS paraliza BOOLEAN DEFAULT FALSE")
        await conn.execute("ALTER TABLE prod_incidencia ADD COLUMN IF NOT EXISTS paralizacion_id VARCHAR")
        await conn.execute("ALTER TABLE prod_incidencia ADD COLUMN IF NOT EXISTS comentario_resolucion TEXT")
        # Expandir columna tipo de varchar(30) a VARCHAR sin limite
        await conn.execute("ALTER TABLE prod_incidencia ALTER COLUMN tipo TYPE VARCHAR")
        await conn.execute("ALTER TABLE prod_incidencia ALTER COLUMN usuario TYPE VARCHAR")

        # Tabla de conversacion/hilo por registro
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_conversacion (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                mensaje_padre_id VARCHAR,
                autor VARCHAR NOT NULL,
                mensaje TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        await conn.execute("ALTER TABLE prod_conversacion ADD COLUMN IF NOT EXISTS estado VARCHAR DEFAULT 'normal'")
        await conn.execute("ALTER TABLE prod_conversacion ADD COLUMN IF NOT EXISTS fijado BOOLEAN DEFAULT FALSE")

        # Avance porcentaje en servicios y movimientos
        await conn.execute("ALTER TABLE prod_servicios_produccion ADD COLUMN IF NOT EXISTS usa_avance_porcentaje BOOLEAN DEFAULT FALSE")
        await conn.execute("ALTER TABLE prod_movimientos_produccion ADD COLUMN IF NOT EXISTS avance_porcentaje INTEGER")
        await conn.execute("ALTER TABLE prod_movimientos_produccion ADD COLUMN IF NOT EXISTS avance_updated_at TIMESTAMP")
        # Historial de avances
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS produccion.prod_avance_historial (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                movimiento_id VARCHAR NOT NULL,
                avance_porcentaje INTEGER NOT NULL,
                usuario VARCHAR,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)


async def ensure_fase2_tables():
    """Crea las tablas necesarias para Fase 2: Reservas + Requerimiento MP"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1) prod_registro_tallas: Cantidades reales por talla (normalizado)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_registro_tallas (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                talla_id VARCHAR NOT NULL,
                cantidad_real INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_registro_tallas_registro ON prod_registro_tallas(registro_id)"
        )
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_registro_talla ON prod_registro_tallas(registro_id, talla_id)"
        )

        # 2) prod_registro_requerimiento_mp: Resultado de explosión BOM
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_registro_requerimiento_mp (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                item_id VARCHAR NOT NULL,
                talla_id VARCHAR NULL,
                cantidad_requerida NUMERIC(14,4) NOT NULL DEFAULT 0,
                cantidad_reservada NUMERIC(14,4) NOT NULL DEFAULT 0,
                cantidad_consumida NUMERIC(14,4) NOT NULL DEFAULT 0,
                estado VARCHAR NOT NULL DEFAULT 'PENDIENTE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_req_mp_registro ON prod_registro_requerimiento_mp(registro_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_req_mp_item ON prod_registro_requerimiento_mp(item_id)"
        )
        # Unique index con COALESCE para manejar talla_id NULL
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_req_mp_registro_item_talla
            ON prod_registro_requerimiento_mp(registro_id, item_id, COALESCE(talla_id, '__NULL__'))
        """)

        # 3) prod_inventario_reservas: Cabecera de reservas
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_inventario_reservas (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                estado VARCHAR NOT NULL DEFAULT 'ACTIVA',
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reservas_registro ON prod_inventario_reservas(registro_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reservas_estado ON prod_inventario_reservas(estado)"
        )

        # 4) prod_inventario_reservas_linea: Líneas de reservas
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_inventario_reservas_linea (
                id VARCHAR PRIMARY KEY,
                reserva_id VARCHAR NOT NULL,
                item_id VARCHAR NOT NULL,
                talla_id VARCHAR NULL,
                cantidad_reservada NUMERIC(14,4) NOT NULL DEFAULT 0,
                cantidad_liberada NUMERIC(14,4) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reservas_linea_reserva ON prod_inventario_reservas_linea(reserva_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reservas_linea_item ON prod_inventario_reservas_linea(item_id)"
        )

        # 5) Agregar talla_id a prod_inventario_salidas si no existe
        await conn.execute(
            "ALTER TABLE prod_inventario_salidas ADD COLUMN IF NOT EXISTS talla_id VARCHAR NULL"
        )

        # 6) Agregar ignorar_alerta_stock a prod_inventario si no existe
        await conn.execute(
            "ALTER TABLE prod_inventario ADD COLUMN IF NOT EXISTS ignorar_alerta_stock BOOLEAN DEFAULT FALSE"
        )

        # 7) Línea de negocio en modelos, registros, ingresos y salidas
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS linea_negocio_id INTEGER NULL")
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS linea_negocio_id INTEGER NULL")
        await conn.execute("ALTER TABLE prod_inventario_ingresos ADD COLUMN IF NOT EXISTS linea_negocio_id INTEGER NULL")
        await conn.execute("ALTER TABLE prod_inventario_salidas ADD COLUMN IF NOT EXISTS linea_negocio_id INTEGER NULL")

        # 8) Jerarquía Base → Modelo (variante) → Registro
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS base_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS hilo_especifico_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS muestra_modelo_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS muestra_base_id VARCHAR NULL")


async def ensure_startup_migrations():
    """Migraciones ligeras ejecutadas en cada arranque (idempotentes)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("ALTER TABLE prod_modelos DROP COLUMN IF EXISTS materiales")
        # Columnas para división de lote
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS dividido_desde_registro_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS division_numero INT DEFAULT 0")
        # Modelo manual (ingresado a mano sin seleccionar del catálogo)
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS modelo_manual JSONB")
        # Flag de descuento de inventario (false cuando se crea en modo migración)
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS descuento_inventario BOOLEAN DEFAULT TRUE")

        # Tabla de configuración global del sistema
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_configuracion (
                clave VARCHAR PRIMARY KEY,
                valor VARCHAR NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by VARCHAR
            )
        """)
        # Seed modo_migracion si no existe
        await conn.execute("""
            INSERT INTO prod_configuracion (clave, valor) VALUES ('modo_migracion', 'false')
            ON CONFLICT (clave) DO NOTHING
        """)
        # Migración: extender prod_registro_cierre con campos de auditoría y congelamiento
        for alter_sql in [
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS merma_qty NUMERIC DEFAULT 0",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS otros_costos NUMERIC DEFAULT 0",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS costo_unitario_final NUMERIC DEFAULT 0",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS cerrado_por VARCHAR",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS observacion_cierre TEXT",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS estado_cierre VARCHAR DEFAULT 'CERRADO'",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS snapshot_json JSONB",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS reabierto_por VARCHAR",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS reabierto_at TIMESTAMP",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS motivo_reapertura TEXT",
        ]:
            await conn.execute(alter_sql)
        # Fix: estandarizar empresa_id = 7 en todas las tablas de produccion
        for tabla in [
            'prod_inventario', 'prod_inventario_reservas', 'prod_inventario_reservas_linea',
            'prod_inventario_salidas', 'prod_registro_requerimiento_mp'
        ]:
            await conn.execute(f"UPDATE {tabla} SET empresa_id = 7 WHERE empresa_id != 7")


async def ensure_startup_indices():
    """Crea índices de performance para queries frecuentes."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_movimientos_registro_id ON prod_movimientos_produccion(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_mermas_registro_id ON prod_mermas(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_fallados_registro_id ON prod_fallados(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_arreglos_registro_id ON prod_arreglos(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_registro_arreglos_registro_id ON prod_registro_arreglos(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_registro_arreglos_estado ON prod_registro_arreglos(estado)",
            "CREATE INDEX IF NOT EXISTS idx_incidencia_registro_id ON prod_incidencia(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_registros_estado ON prod_registros(estado)",
            "CREATE INDEX IF NOT EXISTS idx_registros_fecha ON prod_registros(fecha_creacion DESC)",
            "CREATE INDEX IF NOT EXISTS idx_registros_modelo ON prod_registros(modelo_id)",
            "CREATE INDEX IF NOT EXISTS idx_registros_dividido ON prod_registros(dividido_desde_registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_paralizacion_registro ON prod_paralizacion(registro_id, activa)",
            "CREATE INDEX IF NOT EXISTS idx_movimientos_fecha_esperada ON prod_movimientos_produccion(fecha_esperada_movimiento)",
            "CREATE INDEX IF NOT EXISTS idx_salidas_registro ON prod_inventario_salidas(registro_id)",
        ]:
            try:
                await conn.execute(idx_sql)
            except Exception:
                pass
