-- =====================================================================
-- 014_distribucion_cantidad_zero.sql
-- =====================================================================
-- Relaja el CHECK constraint de produccion.prod_registro_pt_relacion para
-- permitir cantidad = 0. Caso de uso: "vínculo puro al template" — el
-- corte declara cuál es el producto Odoo destino para que el sync de
-- tienda funcione, pero deja la cantidad pendiente de definir (llega
-- parcial, los arreglos vienen después, etc.).
--
-- El backend valida que la suma no exceda el total producido.
-- =====================================================================

-- Baja TODOS los CHECK actuales sobre la columna cantidad (con cualquier
-- nombre y cualquier expresión "cantidad > 0", "cantidad > (0)::numeric",
-- etc.). Idempotente.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'produccion'
          AND rel.relname = 'prod_registro_pt_relacion'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ~* 'cantidad\s*>'
    LOOP
        EXECUTE format(
            'ALTER TABLE produccion.prod_registro_pt_relacion DROP CONSTRAINT %I',
            rec.conname
        );
    END LOOP;
END $$;

-- Sube el constraint nuevo (cantidad >= 0). Idempotente.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'produccion'
          AND rel.relname = 'prod_registro_pt_relacion'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ~* 'cantidad\s*>=\s*0'
    ) THEN
        ALTER TABLE produccion.prod_registro_pt_relacion
        ADD CONSTRAINT prod_registro_pt_relacion_cantidad_check CHECK (cantidad >= 0);
    END IF;
END $$;
