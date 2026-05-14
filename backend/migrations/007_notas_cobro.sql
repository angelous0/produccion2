-- =====================================================================
-- 007_notas_cobro.sql
-- =====================================================================
-- Notas de cobro emitidas por Producción para que Finanzas las procese.
-- Cada nota agrupa N envíos a arreglo (lotes vencidos) de un mismo
-- proveedor. Convive con `prod_arreglos_audit` (paso 006) y deja un
-- vínculo limpio entre envío vencido y nota.
--
-- Nombres en schema produccion (no finanzas) — Producción es quien emite;
-- Finanzas las consume vía endpoint o lectura cross-schema cuando esté.
-- =====================================================================

CREATE TABLE IF NOT EXISTS produccion.prod_notas_cobro (
    id              VARCHAR PRIMARY KEY,
    numero          VARCHAR(50) NOT NULL UNIQUE,   -- ej. "NC-2026-0001"
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    proveedor_id    VARCHAR,                       -- prod_personas_produccion.id
    proveedor_nombre VARCHAR(255) NOT NULL,        -- snapshot al momento
    total_pzs       INTEGER NOT NULL DEFAULT 0,
    total_lotes     INTEGER NOT NULL DEFAULT 0,
    observacion     TEXT,
    estado          VARCHAR(20) NOT NULL DEFAULT 'activa'
                            CHECK (estado IN ('activa','anulada')),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by_id   VARCHAR,
    created_by_nombre VARCHAR(255),
    anulada_at      TIMESTAMP,
    anulada_by_id   VARCHAR,
    anulada_by_nombre VARCHAR(255),
    motivo_anulacion TEXT,
    empresa_id      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notas_cobro_proveedor ON produccion.prod_notas_cobro(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_notas_cobro_estado ON produccion.prod_notas_cobro(estado, fecha DESC);

CREATE TABLE IF NOT EXISTS produccion.prod_notas_cobro_lotes (
    id              SERIAL PRIMARY KEY,
    nota_id         VARCHAR NOT NULL REFERENCES produccion.prod_notas_cobro(id) ON DELETE CASCADE,
    arreglo_id      VARCHAR NOT NULL REFERENCES produccion.prod_registro_arreglos(id) ON DELETE RESTRICT,
    cantidad        INTEGER NOT NULL,
    dias_vencido    INTEGER,            -- snapshot al momento de la nota
    UNIQUE (nota_id, arreglo_id)
);

CREATE INDEX IF NOT EXISTS idx_notas_cobro_lotes_arreglo ON produccion.prod_notas_cobro_lotes(arreglo_id);

-- Secuencia para generar números de nota (NC-YYYY-NNNN)
CREATE SEQUENCE IF NOT EXISTS produccion.seq_notas_cobro START 1;
