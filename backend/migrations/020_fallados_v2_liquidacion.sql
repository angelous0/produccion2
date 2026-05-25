-- ============================================================================
-- Migration 020: Fallados v2.1 — columna cant_liquidacion para arreglos SERVICIO
-- ----------------------------------------------------------------------------
-- Refinamiento de la semántica del modal "Recibir entrega":
--   - Servicio (proveedor): OK / Liquidación / No devuelto
--   - Tela (interno):       OK / LQ Leve / LQ Grave / No devuelto
--
-- Hasta ahora cant_lq_leve + cant_lq_grave se usaba también para servicio,
-- pero conceptualmente al proveedor se le factura un único concepto
-- (liquidación), sin distinguir gravedad. Esta columna nueva separa ambos
-- mundos en el histórico granular.
--
-- Las columnas cant_lq_leve / cant_lq_grave / cant_no_devuelto quedan
-- intactas y siguen usándose para arreglos de tela (interno).
--
-- Idempotente.
-- ============================================================================

ALTER TABLE produccion.prod_arreglo_entregas
    ADD COLUMN IF NOT EXISTS cant_liquidacion INT NOT NULL DEFAULT 0;
