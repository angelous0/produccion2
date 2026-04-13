"""
Migración 003: Eliminar columnas muertas de la BD
Campos que existen pero nunca se consultan ni usan en lógica de negocio.
Verificado con grep exhaustivo contra todas las rutas del backend.
"""
import asyncio
import asyncpg
import os

DATABASE_URL = os.environ.get('MUESTRA_DATABASE_URL')
if not DATABASE_URL:
    raise RuntimeError("Variable MUESTRA_DATABASE_URL no configurada")

COLUMNS_TO_DROP = [
    # (tabla, columna, razón)
    ("prod_inventario_rollos", "lote", "Añadido en migración, nunca usado en ninguna ruta"),
    ("prod_inventario_rollos", "color_id", "FK nunca establecida ni referenciada en código"),
]


async def run_migration():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        print("=" * 60)
        print("MIGRACIÓN 003: Eliminar columnas muertas")
        print("=" * 60)

        dropped = 0
        skipped = 0

        for table, column, reason in COLUMNS_TO_DROP:
            exists = await conn.fetchval("""
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = $1
                      AND column_name = $2
                )
            """, table, column)

            if not exists:
                print(f"  SKIP  {table}.{column} — no existe")
                skipped += 1
                continue

            count = await conn.fetchval(
                f'SELECT COUNT(*) FROM {table} WHERE "{column}" IS NOT NULL'
            )

            await conn.execute(
                f'ALTER TABLE {table} DROP COLUMN IF EXISTS "{column}"'
            )
            print(f"  DROP  {table}.{column} ({count} valores no nulos) — {reason}")
            dropped += 1

        print()
        print(f"Resultado: {dropped} columnas eliminadas, {skipped} ya no existían")
        print("=" * 60)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run_migration())
