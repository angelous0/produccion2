-- ============================================================================
-- Migration 019: Fallados v2 — LQ Leve/Grave + No Devuelto
-- ----------------------------------------------------------------------------
-- Cambios en prod_arreglo_entregas (histórico de entregas parciales):
--   - cant_liq    → cant_lq_leve   (rename si existe)
--   - cant_merma  → cant_lq_grave  (rename si existe)
--   - ADD COLUMN cant_no_devuelto  (caso excepcional: proveedor no respondió)
--
-- Idempotente: usa IF EXISTS / IF NOT EXISTS y bloques DO para los rename.
-- NO toca prod_registro_arreglos (la decisión es mantener cantidad_liquidacion
-- y cantidad_merma como están: se siguen sumando para el cálculo de saldo).
-- ============================================================================

-- 1) Renombrar cant_liq → cant_lq_leve (idempotente)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='produccion'
          AND table_name='prod_arreglo_entregas'
          AND column_name='cant_liq'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='produccion'
          AND table_name='prod_arreglo_entregas'
          AND column_name='cant_lq_leve'
    ) THEN
        ALTER TABLE produccion.prod_arreglo_entregas
            RENAME COLUMN cant_liq TO cant_lq_leve;
    END IF;
END $$;

-- 2) Renombrar cant_merma → cant_lq_grave (idempotente)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='produccion'
          AND table_name='prod_arreglo_entregas'
          AND column_name='cant_merma'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='produccion'
          AND table_name='prod_arreglo_entregas'
          AND column_name='cant_lq_grave'
    ) THEN
        ALTER TABLE produccion.prod_arreglo_entregas
            RENAME COLUMN cant_merma TO cant_lq_grave;
    END IF;
END $$;

-- 3) Nueva columna cant_no_devuelto
ALTER TABLE produccion.prod_arreglo_entregas
    ADD COLUMN IF NOT EXISTS cant_no_devuelto INT NOT NULL DEFAULT 0;

-- 4) Defaults explícitos (en caso de que falten tras los renombres)
ALTER TABLE produccion.prod_arreglo_entregas
    ALTER COLUMN cant_lq_leve SET DEFAULT 0;
ALTER TABLE produccion.prod_arreglo_entregas
    ALTER COLUMN cant_lq_grave SET DEFAULT 0;
