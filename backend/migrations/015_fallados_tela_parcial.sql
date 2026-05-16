-- =====================================================================
-- 015_fallados_tela_parcial.sql
-- =====================================================================
-- Permite resolver fallados causa='tela' en partes (mezcla recuperado +
-- liquidado, en varios pasos). Antes era todo-o-nada: estado_tela se
-- ponía en RECUPERADO o LIQUIDADO completo.
--
-- Migra registros legacy:
--   - estado_tela = 'RECUPERADO' → cantidad_tela_recuperada = cantidad_detectada
--   - estado_tela = 'LIQUIDADO'  → cantidad_tela_liquidada  = cantidad_detectada
--   - estado_tela IN (NULL, 'EVALUANDO') → quedan en 0/0
--
-- El estado_tela ahora se deriva de las cantidades (no se escribe a mano)
-- pero la columna se mantiene por compatibilidad con queries existentes.
-- =====================================================================

ALTER TABLE produccion.prod_fallados
    ADD COLUMN IF NOT EXISTS cantidad_tela_recuperada NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cantidad_tela_liquidada  NUMERIC NOT NULL DEFAULT 0;

-- Migra los registros existentes que ya tenían estado_tela cerrado.
UPDATE produccion.prod_fallados
   SET cantidad_tela_recuperada = COALESCE(cantidad_detectada, 0)
 WHERE causa = 'tela'
   AND estado_tela = 'RECUPERADO'
   AND cantidad_tela_recuperada = 0
   AND cantidad_tela_liquidada = 0;

UPDATE produccion.prod_fallados
   SET cantidad_tela_liquidada = COALESCE(cantidad_detectada, 0)
 WHERE causa = 'tela'
   AND estado_tela = 'LIQUIDADO'
   AND cantidad_tela_recuperada = 0
   AND cantidad_tela_liquidada = 0;

-- CHECK: no exceder lo detectado, no negativos.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'produccion'
          AND rel.relname = 'prod_fallados'
          AND con.conname = 'prod_fallados_tela_cantidades_check'
    ) THEN
        ALTER TABLE produccion.prod_fallados
        ADD CONSTRAINT prod_fallados_tela_cantidades_check
        CHECK (
            cantidad_tela_recuperada >= 0
            AND cantidad_tela_liquidada >= 0
            AND cantidad_tela_recuperada + cantidad_tela_liquidada <= COALESCE(cantidad_detectada, 0)
        );
    END IF;
END $$;

COMMENT ON COLUMN produccion.prod_fallados.cantidad_tela_recuperada IS
    'Para causa=tela: prendas que Acabado recuperó (vuelven al lote bueno). Permite resoluciones parciales.';
COMMENT ON COLUMN produccion.prod_fallados.cantidad_tela_liquidada IS
    'Para causa=tela: prendas que Acabado liquidó (salen del inventario).';
