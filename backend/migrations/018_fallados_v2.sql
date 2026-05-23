-- ============================================================================
-- Migration 018: Fallados v2
-- ----------------------------------------------------------------------------
-- Habilita el rediseño del módulo de fallados:
--   1) prod_revision_calidad   : marca "SIN FALLADOS" del operario (Opción B
--                                — una revisión por registro, hasta que se
--                                agregue un fallado nuevo).
--   2) prod_revision_calidad_historial : auditoría de revisiones que se borran
--                                automáticamente cuando aparece un fallado
--                                posterior (Gap 7).
--   3) prod_arreglo_entregas   : historial de entregas parciales del flujo
--                                SERVICIO (cant_ok / cant_liq / cant_merma
--                                por fecha).
--   4) prod_notificacion       : tracking de recordatorios enviados (in-app,
--                                email, telegram). Idempotencia + auditoría.
--   5) Columnas nuevas en prod_registro_arreglos:
--        - fecha_limite_original  : se conserva al dar prórroga.
--        - prorrogas              : JSONB con histórico.
--        - precio_unitario_facturacion + monto_total_facturacion (Opción B
--          del paso de facturación).
--   6) Trigger Opción B          : al INSERT en prod_fallados, mueve la fila
--                                de prod_revision_calidad al historial y la
--                                borra (el corte vuelve a aparecer en lista).
--
-- Idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================


-- ============================================================================
-- 0. Extensión requerida (para gen_random_uuid en el trigger)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================================
-- 1. Tabla prod_revision_calidad
-- ============================================================================
CREATE TABLE IF NOT EXISTS produccion.prod_revision_calidad (
    id              VARCHAR PRIMARY KEY,
    registro_id     VARCHAR NOT NULL,
    etapa_al_revisar VARCHAR NOT NULL,   -- 'Para Acabado','Acabado','Almacén PT','Tienda'
    revisado_por    VARCHAR NOT NULL,
    revisado_por_nombre VARCHAR,
    revisado_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    sin_fallados    BOOLEAN NOT NULL DEFAULT TRUE,
    observacion     TEXT,
    CONSTRAINT prod_revision_calidad_registro_unique UNIQUE (registro_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_revision_calidad_registro
    ON produccion.prod_revision_calidad (registro_id);


-- ============================================================================
-- 2. Tabla prod_revision_calidad_historial (auditoría — Gap 7)
-- ============================================================================
CREATE TABLE IF NOT EXISTS produccion.prod_revision_calidad_historial (
    id              VARCHAR PRIMARY KEY,
    registro_id     VARCHAR NOT NULL,
    etapa_al_revisar VARCHAR NOT NULL,
    revisado_por    VARCHAR NOT NULL,
    revisado_por_nombre VARCHAR,
    revisado_at     TIMESTAMP NOT NULL,
    observacion     TEXT,
    -- Por qué se borró del activo
    borrado_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    borrado_motivo  VARCHAR DEFAULT 'fallado_posterior'  -- o 'manual', 'cambio_etapa'
);

CREATE INDEX IF NOT EXISTS idx_prod_revision_calidad_hist_registro
    ON produccion.prod_revision_calidad_historial (registro_id);


-- ============================================================================
-- 3. Tabla prod_arreglo_entregas (historial entregas parciales SERVICIO)
-- ============================================================================
CREATE TABLE IF NOT EXISTS produccion.prod_arreglo_entregas (
    id              VARCHAR PRIMARY KEY,
    arreglo_id      VARCHAR NOT NULL,         -- FK a prod_registro_arreglos.id (soft)
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    cant_ok         INT NOT NULL DEFAULT 0,
    cant_liq        INT NOT NULL DEFAULT 0,   -- a liquidación
    cant_merma      INT NOT NULL DEFAULT 0,
    observacion     TEXT,
    registrado_por  VARCHAR,
    registrado_por_nombre VARCHAR,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_arreglo_entregas_arreglo
    ON produccion.prod_arreglo_entregas (arreglo_id);


-- ============================================================================
-- 4. Tabla prod_notificacion (recordatorios — Sprint 5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS produccion.prod_notificacion (
    id              VARCHAR PRIMARY KEY,
    tipo            VARCHAR NOT NULL,          -- 'vence_manana','vence_hoy','vencido'
    arreglo_id      VARCHAR,                   -- opcional, contexto
    registro_id     VARCHAR,                   -- opcional
    canal           VARCHAR NOT NULL,          -- 'in_app','email','telegram'
    destinatario    VARCHAR NOT NULL,          -- usuario o chat_id
    payload         JSONB,                     -- contenido completo del mensaje
    enviado_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    leido_at        TIMESTAMP,
    -- Idempotencia: no enviar la misma notif dos veces el mismo día
    clave_idempotencia VARCHAR NOT NULL,
    CONSTRAINT prod_notificacion_clave_unique UNIQUE (clave_idempotencia)
);

CREATE INDEX IF NOT EXISTS idx_prod_notificacion_arreglo
    ON produccion.prod_notificacion (arreglo_id);
CREATE INDEX IF NOT EXISTS idx_prod_notificacion_destinatario_no_leida
    ON produccion.prod_notificacion (destinatario) WHERE leido_at IS NULL;


-- ============================================================================
-- 5. Columnas nuevas en prod_registro_arreglos
-- ============================================================================
ALTER TABLE produccion.prod_registro_arreglos
    ADD COLUMN IF NOT EXISTS fecha_limite_original DATE;

ALTER TABLE produccion.prod_registro_arreglos
    ADD COLUMN IF NOT EXISTS prorrogas JSONB DEFAULT '[]'::jsonb;

ALTER TABLE produccion.prod_registro_arreglos
    ADD COLUMN IF NOT EXISTS precio_unitario_facturacion NUMERIC(12,2);

-- monto_total_facturacion lo calculamos en query para no necesitar GENERATED
-- (que en Postgres requiere ALWAYS STORED y no nos da flexibilidad)
ALTER TABLE produccion.prod_registro_arreglos
    ADD COLUMN IF NOT EXISTS monto_total_facturacion NUMERIC(12,2);

-- Backfill: para arreglos existentes, fecha_limite_original = fecha_limite actual
UPDATE produccion.prod_registro_arreglos
   SET fecha_limite_original = fecha_limite
 WHERE fecha_limite_original IS NULL
   AND fecha_limite IS NOT NULL;


-- ============================================================================
-- 6. Trigger Opción B: al insertar un fallado, archivar y borrar la revisión
-- ============================================================================
CREATE OR REPLACE FUNCTION produccion.fn_archivar_revision_al_fallado()
RETURNS TRIGGER AS $$
BEGIN
    -- Si existe una revisión activa para este registro, la mueve al historial
    INSERT INTO produccion.prod_revision_calidad_historial
        (id, registro_id, etapa_al_revisar, revisado_por, revisado_por_nombre,
         revisado_at, observacion, borrado_motivo)
    SELECT
        gen_random_uuid()::varchar,
        rc.registro_id,
        rc.etapa_al_revisar,
        rc.revisado_por,
        rc.revisado_por_nombre,
        rc.revisado_at,
        rc.observacion,
        'fallado_posterior'
    FROM produccion.prod_revision_calidad rc
    WHERE rc.registro_id = NEW.registro_id;

    DELETE FROM produccion.prod_revision_calidad
     WHERE registro_id = NEW.registro_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archivar_revision_al_fallado ON produccion.prod_fallados;
CREATE TRIGGER trg_archivar_revision_al_fallado
    AFTER INSERT ON produccion.prod_fallados
    FOR EACH ROW
    EXECUTE FUNCTION produccion.fn_archivar_revision_al_fallado();


-- ============================================================================
-- Notas
-- ============================================================================
-- Lo que NO toca esta migración (queda igual):
--   - prod_fallados, prod_registro_arreglos (estructura previa), prod_arreglos,
--     prod_notas_cobro, prod_arreglos_audit, prod_personas_produccion,
--     prod_servicios_produccion.
--
-- El flujo de "pasar a facturación" sigue siendo:
--   POST /api/arreglos/{id}/marcar-cobro   (existe ya)
-- pero ahora con dos campos extra opcionales en el body:
--   precio_unitario_facturacion (NUMERIC)
--   El backend calcula monto_total = pendiente * precio_unitario.
--
-- gen_random_uuid() requiere extensión pgcrypto, ya activada arriba (sección 0).
-- Todas las referencias usan schema 'produccion.' explícito, consistente con
-- el estilo de las migraciones 005/006/007.
