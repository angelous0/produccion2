-- =====================================================================
-- 011_tiendas_comerciales.sql
-- =====================================================================
-- Marca qué locations de Odoo son "tiendas comerciales reales"
-- (donde se vende al cliente final). El resto (AP almacén intermedio,
-- TALLER, REMATE/outlet, Fallados, Ajustes) NO cuentan como tienda
-- para el cambio automático de estado del corte a "Tienda".
--
-- alias_grupo permite agrupar 2 locations de Odoo bajo una sola
-- tienda visible (ej. GR55 y GR82 son la misma tienda).
-- =====================================================================
CREATE TABLE IF NOT EXISTS produccion.prod_tiendas_comerciales (
    id               SERIAL PRIMARY KEY,
    odoo_location_id INTEGER NOT NULL UNIQUE,
    nombre           VARCHAR(40) NOT NULL,        -- nombre visible (x_nombre o alias)
    alias_grupo      VARCHAR(40),                 -- para unificar dos locations bajo un nombre
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    notas            TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiendas_comerciales_activo
    ON produccion.prod_tiendas_comerciales(activo) WHERE activo = TRUE;

-- Seed inicial de tiendas comerciales reales.
-- IDs vienen de odoo.stock_location.odoo_id.
INSERT INTO produccion.prod_tiendas_comerciales (odoo_location_id, nombre, alias_grupo, activo, notas) VALUES
    (22,  'GM209',  NULL,  TRUE,  'Galería Mercedes 209'),
    (40,  'GM207',  NULL,  TRUE,  'Galería Mercedes 207'),
    (198, 'GM207',  'GM207', TRUE, 'GAM207 — alias del mismo GM207'),
    (155, 'GM218',  NULL,  TRUE,  'Galería Mercedes 218 (GAM218)'),
    (52,  'GR238',  NULL,  TRUE,  'Gamarra 238'),
    (174, 'GR55',   NULL,  TRUE,  'Gamarra 55 (GRA55)'),
    (70,  'GR55',   'GR55', TRUE, 'GR82 — alias del mismo GR55'),
    (226, 'BOOSH',  NULL,  TRUE,  'Boosh (BOSGA)'),
    (129, 'AZUL',   NULL,  TRUE,  'Azul'),
    (64,  'ZAP',    NULL,  TRUE,  'Zapatería')
ON CONFLICT (odoo_location_id) DO NOTHING;
