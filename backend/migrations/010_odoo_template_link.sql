-- =====================================================================
-- 010_odoo_template_link.sql
-- =====================================================================
-- Agrega odoo_template_id a prod_registros. El cruce con movs/stock/ventas
-- debe ser por template (modelo), no por variante específica (talla/color),
-- porque los movimientos en Odoo se reparten por talla y un corte representa
-- el modelo completo.
-- =====================================================================

ALTER TABLE produccion.prod_registros
    ADD COLUMN IF NOT EXISTS odoo_template_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_registros_odoo_template
    ON produccion.prod_registros(odoo_template_id)
    WHERE odoo_template_id IS NOT NULL;
