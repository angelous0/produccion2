-- =====================================================================
-- 006_marcaje_para_cobro.sql
-- =====================================================================
-- Marcaje de envíos a arreglo "para cobro" cuando el proveedor incumple
-- el plazo y se decide descontar el costo en lugar de esperar la entrega.
--
-- Nota de tipos: prod_registro_arreglos.id y prod_usuarios.id son VARCHAR
-- en este sistema (no INT como sugería la spec del prompt). Las FK y los
-- campos de marcaje siguen ese tipo.
-- =====================================================================

-- 0) Asegurar PRIMARY KEY en prod_registro_arreglos (no la tenía en BD).
--    Sin esta PK, no se puede crear el FK de la tabla audit.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema='produccion' AND table_name='prod_registro_arreglos'
          AND constraint_type='PRIMARY KEY'
    ) THEN
        ALTER TABLE produccion.prod_registro_arreglos ADD PRIMARY KEY (id);
    END IF;
END $$;

-- 1) Columnas de marcaje en el envío a arreglo
ALTER TABLE produccion.prod_registro_arreglos
    ADD COLUMN IF NOT EXISTS marcado_para_cobro      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS marcado_por_usuario_id  VARCHAR,
    ADD COLUMN IF NOT EXISTS marcado_por_nombre      VARCHAR(255),
    ADD COLUMN IF NOT EXISTS fecha_marcado           TIMESTAMP,
    ADD COLUMN IF NOT EXISTS motivo_marcado          TEXT;

CREATE INDEX IF NOT EXISTS idx_arreglos_marcado_para_cobro
    ON produccion.prod_registro_arreglos(marcado_para_cobro)
    WHERE marcado_para_cobro = TRUE;

-- 2) Tabla de auditoría de marcajes
CREATE TABLE IF NOT EXISTS produccion.prod_arreglos_audit (
    id              SERIAL PRIMARY KEY,
    arreglo_id      VARCHAR NOT NULL REFERENCES produccion.prod_registro_arreglos(id)
                            ON DELETE CASCADE,
    accion          VARCHAR(30) NOT NULL
                            CHECK (accion IN ('marcar_cobro','desmarcar_cobro')),
    usuario_id      VARCHAR NOT NULL,
    usuario_nombre  VARCHAR(255) NOT NULL,
    motivo          TEXT,
    fecha           TIMESTAMP NOT NULL DEFAULT NOW(),
    estado_previo   JSONB,
    estado_nuevo    JSONB
);

CREATE INDEX IF NOT EXISTS idx_arreglos_audit_arreglo
    ON produccion.prod_arreglos_audit(arreglo_id, fecha DESC);
