-- =====================================================================
-- 017_pt_odoo_templates.sql
-- =====================================================================
-- Puente entre Artículo PT (prod_inventario.tipo_item='PT') del ERP de
-- producción y los templates de Odoo (odoo.product_template).
--
-- Un Artículo PT genérico puede mapear a varios templates (ej. Dravenix
-- tiene CLOVER normal + CLOVER-LQ). El vínculo guarda qué template
-- corresponde a qué `tipo_salida` de la distribución (normal /
-- liquidacion_leve / liquidacion_grave).
--
-- Se llena automáticamente: cada vez que se guarda distribución en
-- prod_registro_pt_relacion para un corte que ya tiene pt_item_id,
-- el backend hace UPSERT en esta tabla (auto_vinculado=TRUE).
--
-- El stock vivo del PT pasa a calcularse on-the-fly sumando
-- odoo.stock_quant para todas las variantes de los templates vinculados.
-- =====================================================================
CREATE TABLE IF NOT EXISTS produccion.prod_pt_odoo_templates (
    id               SERIAL PRIMARY KEY,
    pt_item_id       VARCHAR NOT NULL,           -- FK lógica a prod_inventario(id)
    odoo_template_id INTEGER NOT NULL,           -- odoo.product_template.odoo_id
    tipo_salida      VARCHAR NOT NULL CHECK (tipo_salida IN ('normal', 'liquidacion_leve', 'liquidacion_grave')),
    auto_vinculado   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by       VARCHAR,
    UNIQUE (pt_item_id, odoo_template_id)
);

CREATE INDEX IF NOT EXISTS idx_pt_odoo_templates_pt
    ON produccion.prod_pt_odoo_templates(pt_item_id);
CREATE INDEX IF NOT EXISTS idx_pt_odoo_templates_template
    ON produccion.prod_pt_odoo_templates(odoo_template_id);

-- Backfill: para cada distribución existente cuyo corte tiene pt_item_id,
-- creamos el vínculo. Si un PT tiene el mismo template con dos tipos
-- distintos (raro), nos quedamos con el primero por UNIQUE constraint.
INSERT INTO produccion.prod_pt_odoo_templates
    (pt_item_id, odoo_template_id, tipo_salida, auto_vinculado, created_by)
SELECT DISTINCT
    r.pt_item_id,
    rel.product_template_id_odoo,
    rel.tipo_salida,
    TRUE,
    'backfill-017'
FROM produccion.prod_registro_pt_relacion rel
JOIN produccion.prod_registros r ON r.id = rel.registro_id
WHERE r.pt_item_id IS NOT NULL
ON CONFLICT (pt_item_id, odoo_template_id) DO NOTHING;

COMMENT ON TABLE produccion.prod_pt_odoo_templates IS
    'Vínculo PT (ERP propio) ↔ template Odoo. Permite calcular stock vivo y ventas del PT consultando Odoo. Se llena automáticamente al guardar distribución de un corte con pt_item_id.';
