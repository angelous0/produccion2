-- =====================================================================
-- 012_distribucion_pt_tipos.sql
-- =====================================================================
-- Simplifica los tipos de salida de prod_registro_pt_relacion:
--   - Quita 'arreglo' (las prendas que pasaron por arreglo y se
--     recuperaron deben distribuirse como 'normal' o 'liquidacion_*'
--     según calidad final).
--   - Quedan: 'normal', 'liquidacion_leve', 'liquidacion_grave'.
--
-- Los registros existentes con tipo_salida='arreglo' se reasignan
-- automáticamente a 'normal'.
-- =====================================================================
DO $$
BEGIN
    -- 1) Reasignar registros legacy 'arreglo' a 'normal'
    UPDATE produccion.prod_registro_pt_relacion
       SET tipo_salida = 'normal'
     WHERE tipo_salida = 'arreglo';

    -- 2) Recrear el CHECK constraint
    -- (asyncpg crea automáticamente con el patrón <tabla>_<columna>_check
    --  pero asegurémonos buscando en information_schema.)
    PERFORM 1;
END $$;

ALTER TABLE produccion.prod_registro_pt_relacion
    DROP CONSTRAINT IF EXISTS prod_registro_pt_relacion_tipo_salida_check;

ALTER TABLE produccion.prod_registro_pt_relacion
    ADD CONSTRAINT prod_registro_pt_relacion_tipo_salida_check
    CHECK (tipo_salida IN ('normal', 'liquidacion_leve', 'liquidacion_grave'));
