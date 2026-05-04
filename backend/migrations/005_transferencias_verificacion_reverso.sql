-- ============================================================================
-- Migración 005: Transferencias inter-línea — verificación contable + reverso
-- ============================================================================
-- Contexto:
-- Una transferencia entre líneas es contablemente como una "compra interna":
-- la línea destino paga (a costo) a la línea origen. Necesitamos:
--   1) Reflejar la operación en finanzas para que se vea en P&L por línea.
--   2) Un paso de verificación contable (finanzas aprueba que el monto/registro
--      está bien) sin bloquear el movimiento de stock.
--   3) Capacidad de reversar (devolver stock) o eliminar en cascada (admin).
--
-- Esta migración es idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas en producción.prod_transferencias_linea
-- ----------------------------------------------------------------------------
ALTER TABLE produccion.prod_transferencias_linea
ADD COLUMN IF NOT EXISTS verificada BOOLEAN DEFAULT FALSE;
ALTER TABLE produccion.prod_transferencias_linea
ADD COLUMN IF NOT EXISTS verificada_at TIMESTAMP;
ALTER TABLE produccion.prod_transferencias_linea
ADD COLUMN IF NOT EXISTS verificada_por VARCHAR;
ALTER TABLE produccion.prod_transferencias_linea
ADD COLUMN IF NOT EXISTS observaciones_verificacion TEXT;
ALTER TABLE produccion.prod_transferencias_linea
ADD COLUMN IF NOT EXISTS reversada_at TIMESTAMP;
ALTER TABLE produccion.prod_transferencias_linea
ADD COLUMN IF NOT EXISTS reversada_por VARCHAR;
ALTER TABLE produccion.prod_transferencias_linea
ADD COLUMN IF NOT EXISTS motivo_reverso TEXT;

-- ----------------------------------------------------------------------------
-- 2. Tabla espejo en finanzas2 — vista contable de la transferencia
-- ----------------------------------------------------------------------------
-- Contiene los datos relevantes para el contador: línea origen/destino,
-- monto a costo, estado de verificación, etc. Se inserta automáticamente al
-- confirmar la transferencia en producción y se actualiza al reversar/anular.
CREATE TABLE IF NOT EXISTS finanzas2.cont_transferencia_linea (
    id SERIAL PRIMARY KEY,
    empresa_id INT NOT NULL,
    transferencia_prod_id VARCHAR NOT NULL UNIQUE,
    codigo VARCHAR NOT NULL,
    fecha DATE NOT NULL,
    linea_origen_id INT NOT NULL,
    linea_destino_id INT NOT NULL,
    item_origen_codigo VARCHAR,
    item_origen_nombre VARCHAR,
    item_destino_codigo VARCHAR,
    item_destino_nombre VARCHAR,
    cantidad NUMERIC NOT NULL,
    unidad_medida VARCHAR,
    costo_unitario_promedio NUMERIC NOT NULL,
    costo_total NUMERIC NOT NULL,
    estado VARCHAR NOT NULL DEFAULT 'CONFIRMADO',
    -- CONFIRMADO: se hizo, pendiente verificación contable.
    -- VERIFICADA: contador la aprobó (queda registrada en P&L como interna).
    -- REVERSADA: se devolvió el stock; el monto ya no impacta P&L.
    verificada BOOLEAN DEFAULT FALSE,
    verificada_at TIMESTAMP,
    verificada_por VARCHAR,
    observaciones_verificacion TEXT,
    motivo TEXT,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cont_transf_linea_empresa
    ON finanzas2.cont_transferencia_linea(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_cont_transf_linea_origen
    ON finanzas2.cont_transferencia_linea(linea_origen_id);
CREATE INDEX IF NOT EXISTS idx_cont_transf_linea_destino
    ON finanzas2.cont_transferencia_linea(linea_destino_id);
CREATE INDEX IF NOT EXISTS idx_cont_transf_linea_verif
    ON finanzas2.cont_transferencia_linea(verificada, estado);
