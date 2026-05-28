-- ============================================================================
-- Migration 022: prod_tipos.ruta_produccion_id (fallback de ruta por tipo)
-- ----------------------------------------------------------------------------
-- Permite que un corte ingresado con `modelo_manual` (sin modelo catalogado)
-- herede la ruta de producción del tipo de prenda (Polo, Pantalon, etc).
-- Idempotente.
-- ============================================================================

ALTER TABLE produccion.prod_tipos
    ADD COLUMN IF NOT EXISTS ruta_produccion_id VARCHAR;

-- Asignación inicial: matchear por nombre tipo ↔ ruta existente.
UPDATE produccion.prod_tipos
   SET ruta_produccion_id = (SELECT id FROM produccion.prod_rutas_produccion WHERE nombre = 'Polo')
 WHERE nombre = 'Polo' AND ruta_produccion_id IS NULL;

UPDATE produccion.prod_tipos
   SET ruta_produccion_id = (SELECT id FROM produccion.prod_rutas_produccion WHERE nombre = 'Pantalon Denim')
 WHERE nombre = 'Pantalon' AND ruta_produccion_id IS NULL;
