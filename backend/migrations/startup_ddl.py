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
        # Líneas de detalle de costos para movimientos con múltiples componentes
        await conn.execute("ALTER TABLE prod_movimientos_produccion ADD COLUMN IF NOT EXISTS detalle_costos JSONB")
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
        # Referencia idempotente: salida revertida por ajuste de migración
        await conn.execute("ALTER TABLE prod_inventario_salidas ADD COLUMN IF NOT EXISTS revertida_por_migracion_id VARCHAR NULL")
        # Subtipo de ajuste para identificar ajustes de reversión de migración
        await conn.execute("ALTER TABLE prod_inventario_ajustes ADD COLUMN IF NOT EXISTS subtipo VARCHAR NULL")
        # Costo asociado al ajuste (para que el saldo valorizado del kardex cuadre con reversiones)
        await conn.execute("ALTER TABLE prod_inventario_ajustes ADD COLUMN IF NOT EXISTS costo_total NUMERIC DEFAULT 0")
        # Tipo de ingreso para diferenciar stock_inicial de compras normales
        await conn.execute("ALTER TABLE prod_inventario_ingresos ADD COLUMN IF NOT EXISTS tipo_ingreso VARCHAR NULL")

        # ─── Integración Odoo: tabla puente de enriquecimiento ──────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_odoo_productos_enriq (
                id VARCHAR PRIMARY KEY,
                odoo_template_id INTEGER NOT NULL,
                empresa_id INTEGER NOT NULL DEFAULT 7,
                odoo_nombre VARCHAR,
                odoo_default_code VARCHAR,
                odoo_marca_texto VARCHAR,
                odoo_tipo_texto VARCHAR,
                odoo_active BOOLEAN DEFAULT TRUE,
                odoo_stock_actual NUMERIC DEFAULT 0,
                marca_id VARCHAR,
                tipo_id VARCHAR,
                tela_general_id VARCHAR,
                tela_id VARCHAR,
                entalle_id VARCHAR,
                genero_id VARCHAR,
                cuello_id VARCHAR,
                detalle_id VARCHAR,
                lavado_id VARCHAR,
                categoria_color_id VARCHAR,
                estado VARCHAR NOT NULL DEFAULT 'pendiente',
                excluido_motivo VARCHAR,
                campos_pendientes JSONB DEFAULT '[]'::jsonb,
                notas TEXT,
                classified_by VARCHAR,
                classified_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                last_sync TIMESTAMPTZ,
                CONSTRAINT uq_odoo_template_empresa UNIQUE (odoo_template_id, empresa_id)
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_odoo_enriq_estado ON prod_odoo_productos_enriq(empresa_id, estado)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_odoo_enriq_marca ON prod_odoo_productos_enriq(marca_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_odoo_enriq_tipo ON prod_odoo_productos_enriq(tipo_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_odoo_enriq_template ON prod_odoo_productos_enriq(odoo_template_id)")
        # Costo manual para productos Odoo antiguos (los nuevos traen costo auto)
        await conn.execute("ALTER TABLE prod_odoo_productos_enriq ADD COLUMN IF NOT EXISTS costo_manual NUMERIC DEFAULT NULL")
        await conn.execute("ALTER TABLE prod_odoo_productos_enriq ADD COLUMN IF NOT EXISTS costo_updated_at TIMESTAMPTZ DEFAULT NULL")
        await conn.execute("ALTER TABLE prod_odoo_productos_enriq ADD COLUMN IF NOT EXISTS costo_updated_by VARCHAR DEFAULT NULL")

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
        # Tabla de períodos de modo migración (ventana temporal)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_modo_migracion_periodos (
                id VARCHAR PRIMARY KEY,
                empresa_id INTEGER NOT NULL,
                activado_at TIMESTAMPTZ NOT NULL,
                activado_by VARCHAR,
                desactivado_at TIMESTAMPTZ NULL,
                desactivado_by VARCHAR,
                estado VARCHAR NOT NULL DEFAULT 'activo',
                salidas_revertidas_count INTEGER DEFAULT 0,
                ajustes_generados_count INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_migracion_periodos_empresa_estado ON prod_modo_migracion_periodos(empresa_id, estado)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_migracion_periodos_activado ON prod_modo_migracion_periodos(activado_at)"
        )
        # Migración de datos: si la config vieja dice activo=true y no hay período registrado, crear uno retroactivo
        try:
            import uuid as _uuid_mig
            config_vieja = await conn.fetchrow(
                "SELECT valor, updated_at, updated_by FROM prod_configuracion WHERE clave = 'modo_migracion'"
            )
            if config_vieja and config_vieja['valor'] == 'true':
                periodo_existente = await conn.fetchval(
                    "SELECT id FROM prod_modo_migracion_periodos WHERE estado = 'activo' AND empresa_id = 7 LIMIT 1"
                )
                if not periodo_existente:
                    activado_at = config_vieja['updated_at'] or 'now()'
                    await conn.execute(
                        """INSERT INTO prod_modo_migracion_periodos
                               (id, empresa_id, activado_at, activado_by, estado)
                           VALUES ($1, 7, $2, $3, 'activo')""",
                        str(_uuid_mig.uuid4()),
                        activado_at,
                        config_vieja['updated_by'] or 'sistema',
                    )
        except Exception:
            pass  # No bloquear el arranque por esto
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
        # Origen de líneas de requerimiento (BOM o MANUAL)
        await conn.execute("ALTER TABLE prod_registro_requerimiento_mp ADD COLUMN IF NOT EXISTS origen VARCHAR DEFAULT 'BOM'")
        await conn.execute("ALTER TABLE prod_registro_requerimiento_mp ADD COLUMN IF NOT EXISTS observaciones TEXT")

        # Vinculación con facturas de proveedor (Finanzas)
        await conn.execute("ALTER TABLE prod_movimientos_produccion ADD COLUMN IF NOT EXISTS factura_numero VARCHAR(50)")
        await conn.execute("ALTER TABLE prod_movimientos_produccion ADD COLUMN IF NOT EXISTS factura_id VARCHAR(50)")

        # Fix: estandarizar empresa_id = 7 en todas las tablas de produccion
        for tabla in [
            'prod_inventario', 'prod_inventario_reservas', 'prod_inventario_reservas_linea',
            'prod_inventario_salidas', 'prod_registro_requerimiento_mp'
        ]:
            await conn.execute(f"UPDATE {tabla} SET empresa_id = 7 WHERE empresa_id != 7")


async def ensure_clasificacion_tables():
    """Crea tablas de clasificación de productos e índices necesarios (idempotente)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # ── 4 nuevas tablas catálogo ────────────────────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_generos (
                id VARCHAR PRIMARY KEY,
                nombre VARCHAR NOT NULL,
                marca_ids JSONB DEFAULT '[]'::jsonb,
                orden INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_cuellos (
                id VARCHAR PRIMARY KEY,
                nombre VARCHAR NOT NULL,
                tipo_ids JSONB DEFAULT '[]'::jsonb,
                orden INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_detalles (
                id VARCHAR PRIMARY KEY,
                nombre VARCHAR NOT NULL,
                tipo_ids JSONB DEFAULT '[]'::jsonb,
                orden INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # ── Nuevas columnas en prod_modelos ─────────────────────────────────
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS genero_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS cuello_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS detalle_id VARCHAR NULL")
        # ── Categoría en prod_colores_catalogo ──────────────────────────────
        await conn.execute(
            "ALTER TABLE prod_colores_catalogo ADD COLUMN IF NOT EXISTS categoria VARCHAR NOT NULL DEFAULT 'basico'"
        )
        # ── Lavados ─────────────────────────────────────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_lavados (
                id VARCHAR PRIMARY KEY,
                nombre VARCHAR NOT NULL,
                categoria VARCHAR NOT NULL DEFAULT 'basico',
                tipo_ids JSONB DEFAULT '[]'::jsonb,
                orden INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS lavado_id VARCHAR NULL")
        # ── Tela General ─────────────────────────────────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_telas_general (
                id VARCHAR PRIMARY KEY,
                nombre VARCHAR NOT NULL,
                orden INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("ALTER TABLE prod_telas ADD COLUMN IF NOT EXISTS tela_general_id VARCHAR NULL")


async def ensure_salidas_libres_tables():
    """Crea tablas para módulo Salidas Libres y Muestras."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # ── Salidas Libres ──────────────────────────────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_salidas_libres (
                id VARCHAR PRIMARY KEY,
                fecha DATE NOT NULL DEFAULT CURRENT_DATE,
                item_id VARCHAR NOT NULL,
                cantidad NUMERIC(14,4) NOT NULL,
                tipo_salida VARCHAR NOT NULL DEFAULT 'MERMA',
                motivo TEXT,
                destino VARCHAR,
                costo_unitario NUMERIC(14,6) DEFAULT 0,
                costo_total NUMERIC(14,6) DEFAULT 0,
                detalle_fifo JSONB DEFAULT '[]',
                linea_negocio_id INT,
                usuario VARCHAR,
                observaciones TEXT,
                en_migracion BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_salidas_libres_item ON prod_salidas_libres(item_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_salidas_libres_fecha ON prod_salidas_libres(fecha DESC)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_salidas_libres_tipo ON prod_salidas_libres(tipo_salida)")

        # ── Muestras ────────────────────────────────────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_muestras (
                id VARCHAR PRIMARY KEY,
                codigo VARCHAR,
                cliente VARCHAR,
                fecha_envio DATE,
                modelo_id VARCHAR,
                modelo_nombre VARCHAR,
                linea_negocio_id INT,
                estado VARCHAR NOT NULL DEFAULT 'PENDIENTE',
                observaciones TEXT,
                costo_total NUMERIC(14,6) DEFAULT 0,
                usuario_creador VARCHAR,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_muestras_estado ON prod_muestras(estado)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_muestras_fecha ON prod_muestras(fecha_envio DESC)")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_muestras_materiales (
                id VARCHAR PRIMARY KEY,
                muestra_id VARCHAR NOT NULL,
                item_id VARCHAR NOT NULL,
                cantidad NUMERIC(14,4) NOT NULL,
                costo_unitario NUMERIC(14,6) DEFAULT 0,
                costo_total NUMERIC(14,6) DEFAULT 0,
                detalle_fifo JSONB DEFAULT '[]',
                en_migracion BOOLEAN DEFAULT FALSE,
                observaciones TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_muestras_mat_muestra ON prod_muestras_materiales(muestra_id)")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_muestras_historial_estado (
                id VARCHAR PRIMARY KEY,
                muestra_id VARCHAR NOT NULL,
                estado_anterior VARCHAR,
                estado_nuevo VARCHAR NOT NULL,
                comentario TEXT,
                usuario VARCHAR,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_muestras_hist_muestra ON prod_muestras_historial_estado(muestra_id)")


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
