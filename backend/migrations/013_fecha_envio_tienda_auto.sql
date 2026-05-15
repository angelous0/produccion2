-- =====================================================================
-- 013_fecha_envio_tienda_auto.sql
-- =====================================================================
-- Distingue entre fecha_envio_tienda puesta manualmente por el usuario
-- vs. detectada automaticamente por el sync con Odoo.
--
-- Reglas con este flag:
--   - auto=TRUE  -> el sync PUEDE sobrescribir (ej. cuando se cambia
--                   el product_template y la nueva fecha es distinta).
--   - auto=FALSE -> el sync respeta la fecha del usuario.
--
-- Registros legacy (con fecha ya seteada antes de esta migracion) se
-- dejan como auto=FALSE para no pisar nada que el usuario haya hecho
-- a mano. El usuario podra forzar re-detect borrando la fecha (la
-- proxima sync la pone como auto=TRUE).
-- =====================================================================

ALTER TABLE produccion.prod_registros
    ADD COLUMN IF NOT EXISTS fecha_envio_tienda_auto BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN produccion.prod_registros.fecha_envio_tienda_auto IS
    'TRUE si fecha_envio_tienda fue seteada por el sync automatico (sincronizar-estados). FALSE si la puso un usuario manualmente o si todavia esta NULL. El sync solo sobrescribe cuando auto=TRUE.';
