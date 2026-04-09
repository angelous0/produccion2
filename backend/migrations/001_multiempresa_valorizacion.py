"""
Migración: Multiempresa + Tablas de Valorización + PT
- Agrega empresa_id a todas las tablas de producción
- Backfill a empresa_id=6 (Ambission Industries SAC)
- Crea tablas: prod_registro_costos_servicio, prod_registro_cierre
- Agrega pt_item_id a prod_registros
- Agrega campos de trazabilidad financiera a ingresos
"""
import asyncio
import asyncpg

DATABASE_URL = "postgres://admin:admin@72.60.241.216:9090/datos?sslmode=disable"
DEFAULT_EMPRESA_ID = 6

async def migrate():
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        async with conn.transaction():
            print("=== FASE A: Multiempresa - empresa_id en todas las tablas ===")
            
            # Tablas que necesitan empresa_id (las que NO lo tienen aún)
            tables_need_empresa = [
                'produccion.prod_registros',
                'produccion.prod_registro_tallas',
                'produccion.prod_registro_requerimiento_mp',
                'produccion.prod_inventario_ingresos',
                'produccion.prod_inventario_salidas',
                'produccion.prod_inventario_rollos',
                'produccion.prod_inventario_reservas',
                'produccion.prod_inventario_reservas_linea',
            ]
            
            for table in tables_need_empresa:
                col_exists = await conn.fetchval(f"""
                    SELECT EXISTS(
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_schema = 'produccion' 
                        AND table_name = '{table.split('.')[1]}' 
                        AND column_name = 'empresa_id'
                    )
                """)
                if not col_exists:
                    print(f"  ADD empresa_id to {table}")
                    await conn.execute(f"ALTER TABLE {table} ADD COLUMN empresa_id INTEGER")
                    await conn.execute(f"UPDATE {table} SET empresa_id = {DEFAULT_EMPRESA_ID} WHERE empresa_id IS NULL")
                    await conn.execute(f"ALTER TABLE {table} ALTER COLUMN empresa_id SET NOT NULL")
                    await conn.execute(f"ALTER TABLE {table} ADD CONSTRAINT {table.split('.')[1]}_empresa_fk FOREIGN KEY (empresa_id) REFERENCES finanzas2.cont_empresa(id)")
                else:
                    # Already has empresa_id, just backfill and add NOT NULL + FK if missing
                    print(f"  BACKFILL empresa_id in {table}")
                    await conn.execute(f"UPDATE {table} SET empresa_id = {DEFAULT_EMPRESA_ID} WHERE empresa_id IS NULL")
                    # Try to set NOT NULL (may already be set)
                    try:
                        await conn.execute(f"ALTER TABLE {table} ALTER COLUMN empresa_id SET NOT NULL")
                    except Exception:
                        pass
                    # Try to add FK (may already exist)
                    try:
                        await conn.execute(f"ALTER TABLE {table} ADD CONSTRAINT {table.split('.')[1]}_empresa_fk FOREIGN KEY (empresa_id) REFERENCES finanzas2.cont_empresa(id)")
                    except Exception:
                        pass
            
            # Fix prod_inventario: already has empresa_id but need backfill to 6 and FK
            print("  FIX prod_inventario empresa_id (1 -> 6)")
            await conn.execute(f"UPDATE produccion.prod_inventario SET empresa_id = {DEFAULT_EMPRESA_ID} WHERE empresa_id IS NULL OR empresa_id != {DEFAULT_EMPRESA_ID}")
            try:
                await conn.execute(f"ALTER TABLE produccion.prod_inventario ALTER COLUMN empresa_id SET NOT NULL")
            except Exception:
                pass
            try:
                await conn.execute(f"ALTER TABLE produccion.prod_inventario ADD CONSTRAINT prod_inventario_empresa_fk FOREIGN KEY (empresa_id) REFERENCES finanzas2.cont_empresa(id)")
            except Exception:
                pass
            
            # Ensure PK constraints exist on key tables (some may lack them)
            print("\n=== ENSURE PRIMARY KEYS ===")
            pk_tables = [
                'prod_inventario', 'prod_registros', 'prod_inventario_ingresos',
                'prod_inventario_salidas', 'prod_inventario_rollos',
                'prod_inventario_reservas', 'prod_inventario_reservas_linea',
                'prod_registro_tallas', 'prod_registro_requerimiento_mp'
            ]
            for tbl in pk_tables:
                has_pk = await conn.fetchval(f"""
                    SELECT EXISTS(
                        SELECT 1 FROM pg_constraint 
                        WHERE conrelid = 'produccion.{tbl}'::regclass AND contype = 'p'
                    )
                """)
                if not has_pk:
                    print(f"  ADD PK to {tbl}")
                    await conn.execute(f"ALTER TABLE produccion.{tbl} ADD PRIMARY KEY (id)")
                else:
                    print(f"  {tbl} already has PK")
            
            print("\n=== FASE B: pt_item_id en prod_registros ===")
            col_exists = await conn.fetchval("""
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_schema = 'produccion' 
                    AND table_name = 'prod_registros' 
                    AND column_name = 'pt_item_id'
                )
            """)
            if not col_exists:
                print("  ADD pt_item_id VARCHAR to prod_registros")
                await conn.execute("ALTER TABLE produccion.prod_registros ADD COLUMN pt_item_id VARCHAR")
                # FK to prod_inventario (now that PK exists)
                await conn.execute("""
                    ALTER TABLE produccion.prod_registros 
                    ADD CONSTRAINT prod_registros_pt_item_fk 
                    FOREIGN KEY (pt_item_id) REFERENCES produccion.prod_inventario(id)
                """)
            else:
                print("  pt_item_id already exists")
            
            print("\n=== FASE C: Campos trazabilidad financiera en ingresos ===")
            for col in ['fin_origen_tipo', 'fin_origen_id', 'fin_numero_doc']:
                col_exists = await conn.fetchval(f"""
                    SELECT EXISTS(
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_schema = 'produccion' 
                        AND table_name = 'prod_inventario_ingresos' 
                        AND column_name = '{col}'
                    )
                """)
                if not col_exists:
                    print(f"  ADD {col} to prod_inventario_ingresos")
                    await conn.execute(f"ALTER TABLE produccion.prod_inventario_ingresos ADD COLUMN {col} TEXT")
                else:
                    print(f"  {col} already exists")
            
            # Unique constraint for idempotency
            try:
                await conn.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_ingresos_fin_unico 
                    ON produccion.prod_inventario_ingresos (empresa_id, fin_origen_tipo, fin_origen_id, item_id)
                    WHERE fin_origen_tipo IS NOT NULL AND fin_origen_id IS NOT NULL
                """)
                print("  CREATED unique index for finance idempotency")
            except Exception as e:
                print(f"  Index may already exist: {e}")
            
            print("\n=== FASE E: Tabla prod_registro_costos_servicio ===")
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS produccion.prod_registro_costos_servicio (
                    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    empresa_id INTEGER NOT NULL REFERENCES finanzas2.cont_empresa(id),
                    registro_id VARCHAR NOT NULL REFERENCES produccion.prod_registros(id) ON DELETE CASCADE,
                    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
                    descripcion TEXT NOT NULL,
                    proveedor_texto TEXT,
                    monto NUMERIC(18,2) NOT NULL,
                    fin_origen_tipo TEXT,
                    fin_origen_id TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            print("  CREATED prod_registro_costos_servicio")
            
            print("\n=== FASE F: Tabla prod_registro_cierre ===")
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS produccion.prod_registro_cierre (
                    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    empresa_id INTEGER NOT NULL REFERENCES finanzas2.cont_empresa(id),
                    registro_id VARCHAR NOT NULL UNIQUE REFERENCES produccion.prod_registros(id) ON DELETE CASCADE,
                    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
                    qty_terminada NUMERIC(18,6) NOT NULL,
                    costo_mp NUMERIC(18,2) NOT NULL,
                    costo_servicios NUMERIC(18,2) NOT NULL,
                    costo_total NUMERIC(18,2) NOT NULL,
                    costo_unit_pt NUMERIC(18,6) NOT NULL,
                    pt_ingreso_id VARCHAR REFERENCES produccion.prod_inventario_ingresos(id),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            print("  CREATED prod_registro_cierre")
            
            # Add empresa_id to prod_inventario_ingresos if not already done above
            # Also add empresa_id to new table backfill
            
            print("\n=== MIGRACIÓN COMPLETA ===")
            
            # Verify counts
            for tbl in ['prod_registros','prod_inventario','prod_inventario_ingresos','prod_inventario_salidas']:
                cnt = await conn.fetchval(f"SELECT COUNT(*) FROM produccion.{tbl}")
                emp = await conn.fetchval(f"SELECT COUNT(DISTINCT empresa_id) FROM produccion.{tbl}")
                print(f"  {tbl}: {cnt} rows, {emp} distinct empresa_ids")
            
    except Exception as e:
        print(f"ERROR: {e}")
        raise
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
