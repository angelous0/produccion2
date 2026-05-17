-- =====================================================================
-- 016_locations_ingreso_produccion.sql
-- =====================================================================
-- Marca qué locations de Odoo se consideran "Almacén de ingreso de
-- producción" — donde un Ajuste de Inventario (stock_inventory) cuenta
-- como ingreso físico de prendas terminadas que vienen de planta.
--
-- Reemplaza el uso del flag manual `stock_inventory.x_es_ingreso_produccion`
-- (que dependía de que alguien lo prendiera a mano en Odoo) por una
-- regla automática: si el ajuste cae en una de estas locations,
-- es candidato a vincular con un corte.
--
-- alias_grupo permite agrupar varias locations bajo un nombre visible
-- (no esperamos usarlo mucho aquí, pero queda por consistencia con
-- prod_tiendas_comerciales).
--
-- Seed inicial: location_id=15 (AP / Existencias del almacén principal),
-- detectada como la única con volumen real de ingresos de producción
-- (189 ajustes en los últimos 6 meses al momento de la migración).
-- =====================================================================
CREATE TABLE IF NOT EXISTS produccion.prod_locations_ingreso_produccion (
    id               SERIAL PRIMARY KEY,
    odoo_location_id INTEGER NOT NULL UNIQUE,
    nombre           VARCHAR(40) NOT NULL,
    alias_grupo      VARCHAR(40),
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    notas            TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_ingreso_activo
    ON produccion.prod_locations_ingreso_produccion(activo) WHERE activo = TRUE;

INSERT INTO produccion.prod_locations_ingreso_produccion
    (odoo_location_id, nombre, alias_grupo, activo, notas)
VALUES
    (15, 'AP', NULL, TRUE, 'Almacén Principal — Existencias. Ingreso por defecto desde planta.')
ON CONFLICT (odoo_location_id) DO NOTHING;
