-- =====================================================================
-- 024_salida_sin_respaldo_fifo.sql
-- =====================================================================
-- Hace rastreable el descuadre entre stock_actual y las capas FIFO.
--
-- PROBLEMA
--   Al crear una salida, inventario_main.py consume capas FIFO mientras
--   haya disponibles y descuenta stock_actual por la cantidad COMPLETA.
--   Si las capas no alcanzan, el sobrante (`cantidad_restante`) se
--   descartaba en silencio: el contador bajaba, ninguna capa lo cubría y
--   no quedaba rastro de por qué las dos cifras dejaban de coincidir.
--   Ese hueco es lo que hace que la pantalla Inventario y la de
--   Transferencias muestren números distintos para el mismo ítem.
--
-- SOLUCIÓN
--   Guardar ese sobrante por salida. No cambia el comportamiento (la
--   salida se sigue permitiendo, no se bloquea la operación); solo deja
--   el rastro para poder auditarlo y repararlo con
--   POST /api/inventario/recalcular-costos-fifo.
--
-- El ALTER también corre solo en cada arranque desde
-- migrations/startup_ddl.py::ensure_startup_migrations().
-- =====================================================================

ALTER TABLE produccion.prod_inventario_salidas
    ADD COLUMN IF NOT EXISTS cantidad_sin_respaldo NUMERIC DEFAULT 0;

COMMENT ON COLUMN produccion.prod_inventario_salidas.cantidad_sin_respaldo IS
    'Parte de la salida que no encontró capa FIFO. stock_actual se descontó igual; esta cifra es la divergencia atribuible a esta salida.';

-- Backfill del histórico: se deriva de detalle_fifo, no se inventa nada.
-- cantidad_sin_respaldo = cantidad - (lo que realmente salió de una capa)
--
-- Solo cuentan las entradas que referencian una capa real (ingreso_id o
-- rollo_id). Existen entradas del tipo {"cantidad": X, "costo_unitario": 0}
-- sin referencia: registran un consumo que no tocó ninguna capa, así que
-- NO son respaldo — son justamente el hueco que hay que medir.
-- Idempotente: recalcula el mismo valor si se vuelve a correr.
WITH respaldado AS (
    SELECT s.id,
           COALESCE(SUM((e->>'cantidad')::numeric)
                    FILTER (WHERE e ? 'ingreso_id' OR e ? 'rollo_id'), 0) AS cubierto
    FROM produccion.prod_inventario_salidas s
    LEFT JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.detalle_fifo) = 'array'
             THEN s.detalle_fifo ELSE '[]'::jsonb END
    ) e ON TRUE
    GROUP BY s.id
)
UPDATE produccion.prod_inventario_salidas s
SET cantidad_sin_respaldo = GREATEST(0, s.cantidad - r.cubierto)
FROM respaldado r
WHERE r.id = s.id;

CREATE INDEX IF NOT EXISTS idx_salidas_sin_respaldo
    ON produccion.prod_inventario_salidas(item_id)
    WHERE cantidad_sin_respaldo > 0;
