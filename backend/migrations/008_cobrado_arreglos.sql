-- =====================================================================
-- 008_cobrado_arreglos.sql
-- =====================================================================
-- Extiende prod_registro_arreglos con un estado "COBRADO" para registrar
-- el cierre del cobro al proveedor (cuando Finanzas ya emitió la nota
-- de descuento o registró el comprobante).
--
-- Flujo de los 3 estados (en el reporte Fallados y Arreglos):
--   vencido_sin_marcar  →  marcado  →  cobrado
--
-- - sin_marcar: marcado_para_cobro = FALSE
-- - marcado:    marcado_para_cobro = TRUE  y cobrado = FALSE
-- - cobrado:    cobrado = TRUE
-- =====================================================================

ALTER TABLE produccion.prod_registro_arreglos
    ADD COLUMN IF NOT EXISTS cobrado                       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cobrado_por_usuario_id        VARCHAR,
    ADD COLUMN IF NOT EXISTS cobrado_por_nombre            VARCHAR(255),
    ADD COLUMN IF NOT EXISTS fecha_cobro                   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS tipo_comprobante              VARCHAR(40),
    ADD COLUMN IF NOT EXISTS numero_comprobante            VARCHAR(80),
    ADD COLUMN IF NOT EXISTS fecha_emision_comprobante     DATE,
    ADD COLUMN IF NOT EXISTS observaciones_cobro           TEXT;

CREATE INDEX IF NOT EXISTS idx_arreglos_cobrado
    ON produccion.prod_registro_arreglos(cobrado)
    WHERE cobrado = TRUE;

CREATE INDEX IF NOT EXISTS idx_arreglos_marcado_no_cobrado
    ON produccion.prod_registro_arreglos(marcado_para_cobro)
    WHERE marcado_para_cobro = TRUE AND cobrado = FALSE;

-- Ampliar CHECK del audit para incluir las nuevas acciones
DO $$
BEGIN
    -- Drop si existe el constraint viejo
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_schema='produccion' AND table_name='prod_arreglos_audit'
          AND constraint_name = 'prod_arreglos_audit_accion_check'
    ) THEN
        ALTER TABLE produccion.prod_arreglos_audit
            DROP CONSTRAINT prod_arreglos_audit_accion_check;
    END IF;
    -- Crear el nuevo (idempotente con IF NOT EXISTS lógico via DO)
    ALTER TABLE produccion.prod_arreglos_audit
        ADD CONSTRAINT prod_arreglos_audit_accion_check
        CHECK (accion IN ('marcar_cobro','desmarcar_cobro','cobrar','descobrar'));
END $$;
