-- =====================================================================
-- 023_publicacion_cortes.sql
-- =====================================================================
-- Control de fotografía y publicación web por corte.
--
-- Solo aplica a cortes en "Para Acabado" o más adelante (Acabado,
-- Producto Terminado, Almacén PT, Tienda). Un corte se considera
-- REALIZADO cuando tiene_foto = TRUE y en_web = TRUE.
--
-- Se guarda quién y cuándo marcó cada casilla para poder auditar y
-- deshacer. Al desmarcar, el usuario y la fecha se limpian (NULL) para
-- no dejar un rastro que ya no corresponde.
--
-- La tabla también se crea sola en cada arranque vía
-- routes/publicacion_cortes.py::init_publicacion_tables().
-- =====================================================================
CREATE TABLE IF NOT EXISTS produccion.prod_corte_publicacion (
    registro_id VARCHAR PRIMARY KEY,
    tiene_foto  BOOLEAN   NOT NULL DEFAULT FALSE,
    foto_por    VARCHAR,
    foto_at     TIMESTAMP,
    en_web      BOOLEAN   NOT NULL DEFAULT FALSE,
    web_por     VARCHAR,
    web_at      TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corte_publicacion_realizado
    ON produccion.prod_corte_publicacion(tiene_foto, en_web);

COMMENT ON TABLE produccion.prod_corte_publicacion IS
    'Fotografía y publicación web por corte. Realizado = tiene_foto AND en_web.';
