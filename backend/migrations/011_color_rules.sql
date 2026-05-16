-- =====================================================================
-- 011_color_rules.sql
-- =====================================================================
-- Reemplaza la lógica plana Tipo -> Color por reglas reutilizables:
--   Marca opcional + Tipo opcional + grupo de Entalles -> Colores.
--
-- Esto permite grupos como:
--   Element Premium + Pantalon + [Semipitillo, Pitillo, Skinny]
--   Element Premium + Pantalon + [Baggy, Oversize]
--
-- La relación antigua prod_color_tipo se conserva como fallback y se migra
-- a reglas generales por tipo cuando existe.
-- =====================================================================

CREATE TABLE IF NOT EXISTS produccion.prod_color_reglas (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    marca_id VARCHAR NULL,
    tipo_id VARCHAR NULL,
    entalle_ids JSONB DEFAULT '[]'::jsonb,
    activo BOOLEAN DEFAULT TRUE,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produccion.prod_color_regla_colores (
    regla_id VARCHAR NOT NULL,
    color_id VARCHAR NOT NULL,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (regla_id, color_id)
);

CREATE INDEX IF NOT EXISTS idx_color_reglas_scope
    ON produccion.prod_color_reglas(marca_id, tipo_id, activo);

CREATE INDEX IF NOT EXISTS idx_color_regla_colores_color
    ON produccion.prod_color_regla_colores(color_id);

DO $$
BEGIN
    IF to_regclass('produccion.prod_color_tipo') IS NOT NULL THEN
        INSERT INTO produccion.prod_color_reglas (id, nombre, tipo_id, entalle_ids, activo, orden)
        SELECT 'legacy-tipo-' || t.id,
               'General ' || t.nombre,
               t.id,
               '[]'::jsonb,
               TRUE,
               COALESCE(t.orden, 0)
          FROM produccion.prod_tipos t
         WHERE EXISTS (
                SELECT 1
                  FROM produccion.prod_color_tipo ct
                 WHERE ct.tipo_id = t.id
         )
           AND NOT EXISTS (
                SELECT 1
                  FROM produccion.prod_color_reglas r
                 WHERE r.tipo_id = t.id
                   AND r.marca_id IS NULL
                   AND COALESCE(jsonb_array_length(r.entalle_ids), 0) = 0
           );

        INSERT INTO produccion.prod_color_regla_colores (regla_id, color_id, orden)
        SELECT r.id, ct.color_id, COALESCE(ct.orden, 0)
          FROM produccion.prod_color_tipo ct
          JOIN produccion.prod_color_reglas r
            ON r.tipo_id = ct.tipo_id
           AND r.marca_id IS NULL
           AND COALESCE(jsonb_array_length(r.entalle_ids), 0) = 0
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
