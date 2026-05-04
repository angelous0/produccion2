-- ============================================================================
-- Migración 004: Transferencias entre líneas — agregar item_destino_id
-- ============================================================================
-- Contexto:
-- En el modelo viejo, una transferencia entre líneas usaba un solo `item_id`
-- y movía el `linea_negocio_id` de las capas FIFO. Eso era inconsistente con
-- el catálogo `prod_inventario`, donde cada (nombre, línea) suele ser un
-- item DISTINTO con su propio código (TEL-001 vs TEL-046, ambos "DR1100 Blue").
--
-- Resultado del bug: las capas creadas en línea destino quedaban atadas al
-- item de la línea origen, dejando el item destino con stock_actual = 0
-- aunque "su" línea sí tuviera capas con cantidad_disponible.
--
-- Fix:
-- 1. Agregar columna `item_destino_id` para que cada transferencia explicite
--    el item de destino (que el usuario elige a mano en el form).
-- 2. Reparar la transferencia ya hecha (TRF-20260430-001) re-apuntando la
--    capa fantasma al item destino correcto y ajustando stock_actual.
--
-- Esta migración es idempotente; se puede correr múltiples veces sin efecto.
-- ============================================================================

-- 1. Estructura
ALTER TABLE produccion.prod_transferencias_linea
ADD COLUMN IF NOT EXISTS item_destino_id VARCHAR;

-- 2. Reparación de TRF-20260430-001 (única transferencia confirmada con el bug).
--    Se ejecuta solo si el estado actual de los datos coincide con el bug
--    descrito (capa fantasma cc5def33 atada al item de Element Premium pero con
--    linea_negocio_id de Qepo). Si ya fue reparada, este bloque no hace nada.
DO $$
DECLARE
  v_capa_fantasma  uuid := 'cc5def33-21f6-4fa4-ad57-43ecd6f894c4';
  v_item_origen    uuid := '1b5fe17f-9f89-49f2-ac9c-34f7818e9ad7'; -- TEL-001
  v_item_destino   uuid := '11cd5b82-8c86-4fcd-8e21-33a68a5e21f2'; -- TEL-046
  v_cantidad       numeric := 1698.40;
  v_actual_item    varchar;
BEGIN
  SELECT item_id::varchar INTO v_actual_item
  FROM produccion.prod_inventario_ingresos
  WHERE id = v_capa_fantasma::varchar;

  -- Solo reparar si la capa todavía apunta al item origen (i.e. no fue corregida)
  IF v_actual_item = v_item_origen::varchar THEN
    UPDATE produccion.prod_inventario_ingresos
    SET item_id = v_item_destino::varchar
    WHERE id = v_capa_fantasma::varchar;

    UPDATE produccion.prod_transferencias_linea
    SET item_destino_id = v_item_destino::varchar
    WHERE codigo = 'TRF-20260430-001';

    UPDATE produccion.prod_inventario
    SET stock_actual = stock_actual - v_cantidad
    WHERE id = v_item_origen::varchar;

    UPDATE produccion.prod_inventario
    SET stock_actual = stock_actual + v_cantidad
    WHERE id = v_item_destino::varchar;

    -- Recalcular costo_promedio de ambos
    UPDATE produccion.prod_inventario SET costo_promedio = COALESCE((
        SELECT SUM(cantidad_disponible * costo_unitario) / NULLIF(SUM(cantidad_disponible), 0)
        FROM produccion.prod_inventario_ingresos
        WHERE item_id = v_item_origen::varchar AND cantidad_disponible > 0
    ), 0) WHERE id = v_item_origen::varchar;

    UPDATE produccion.prod_inventario SET costo_promedio = COALESCE((
        SELECT SUM(cantidad_disponible * costo_unitario) / NULLIF(SUM(cantidad_disponible), 0)
        FROM produccion.prod_inventario_ingresos
        WHERE item_id = v_item_destino::varchar AND cantidad_disponible > 0
    ), 0) WHERE id = v_item_destino::varchar;

    RAISE NOTICE 'Migración 004: TRF-20260430-001 reparada';
  ELSE
    RAISE NOTICE 'Migración 004: TRF-20260430-001 ya estaba reparada (skip)';
  END IF;
END $$;
