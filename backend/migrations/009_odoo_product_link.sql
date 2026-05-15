-- =====================================================================
-- 009_odoo_product_link.sql
-- =====================================================================
-- Permite vincular cada corte (prod_registros) con un producto de Odoo
-- (odoo.product_product) para poder rastrear:
--   - Cuándo entra a una tienda (vía odoo.stock_move).
--   - Stock vivo en cada tienda (vía odoo.stock_quant).
--   - Ventas desde la fecha de ingreso (vía odoo.pos_order_line).
--
-- NO toca pt_item_id (que sigue apuntando al inventario PT local de
-- producción). Ambos campos pueden coexistir.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE produccion.prod_registros
    ADD COLUMN IF NOT EXISTS odoo_product_id INTEGER,
    ADD COLUMN IF NOT EXISTS odoo_product_company_key VARCHAR(40),
    ADD COLUMN IF NOT EXISTS odoo_product_nombre VARCHAR(255),
    ADD COLUMN IF NOT EXISTS odoo_product_codigo VARCHAR(80),
    ADD COLUMN IF NOT EXISTS odoo_product_asignado_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS odoo_product_asignado_por VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_registros_odoo_product
    ON produccion.prod_registros(odoo_product_id)
    WHERE odoo_product_id IS NOT NULL;
