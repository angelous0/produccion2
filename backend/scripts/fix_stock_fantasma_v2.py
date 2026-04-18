"""
fix_stock_fantasma_v2.py
------------------------
Regulariza el stock fantasma: items donde stock_actual > kardex_calc.

Causa raíz: durante el modo migración, algunos registros se crearon con
descuento_inventario=False (Version A). Las salidas se insertaron en kardex
pero el stock NO se decrementó. Al desactivar la migración, el reversión
incrementó el stock (que nunca había bajado). Resultado: stock_actual > kardex_calc.

Opción A: genera un ajuste_salida por la diferencia fantasma.
- La invariante kardex_calc = stock_actual queda cumplida.
- El historial queda limpio (no se modifica stock_actual directamente).
- Idempotente: no crea duplicados.

Uso:
    cd produccion/backend
    python scripts/fix_stock_fantasma_v2.py [--dry-run]
"""

import asyncio
import sys
import os
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_pool

DRY_RUN = '--dry-run' in sys.argv
MARCA_OBSERVACIONES = 'Regularización fantasma por bug histórico (fix_stock_fantasma_v2)'


async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        # ── Calcular kardex de todos los items ──────────────────────────────
        kardex_rows = await conn.fetch("""
            WITH movimientos AS (
                SELECT item_id, cantidad AS qty
                FROM prod_inventario_ingresos
                UNION ALL
                SELECT item_id, -cantidad AS qty
                FROM prod_inventario_salidas
                UNION ALL
                SELECT item_id,
                       CASE WHEN tipo = 'entrada' THEN cantidad ELSE -cantidad END AS qty
                FROM prod_inventario_ajustes
            )
            SELECT item_id, COALESCE(SUM(qty), 0) AS kardex_calc
            FROM movimientos
            GROUP BY item_id
        """)
        kardex_map = {r['item_id']: float(r['kardex_calc']) for r in kardex_rows}

        # ── Obtener todos los items ──────────────────────────────────────────
        items = await conn.fetch(
            "SELECT id, codigo, nombre, stock_actual FROM prod_inventario ORDER BY codigo"
        )

        fantasmas = []
        for item in items:
            item_id = item['id']
            stock_actual = float(item['stock_actual'] or 0)
            kardex_calc = kardex_map.get(item_id, 0.0)
            diff = round(stock_actual - kardex_calc, 6)

            if diff > 0.001:
                fantasmas.append({
                    'id': item_id,
                    'codigo': item['codigo'],
                    'nombre': item['nombre'],
                    'stock_actual': stock_actual,
                    'kardex_calc': kardex_calc,
                    'diff': diff,
                })

        if not fantasmas:
            print("✅ No se encontraron items con stock fantasma.")
            return

        print(f"{'DRY RUN — ' if DRY_RUN else ''}Encontrados {len(fantasmas)} items con stock_actual > kardex_calc:\n")
        print(f"{'Código':<12} {'Nombre':<35} {'Stock':>10} {'Kardex':>10} {'Fantasma':>10}")
        print("-" * 80)
        for f in fantasmas:
            print(f"{f['codigo']:<12} {f['nombre'][:35]:<35} {f['stock_actual']:>10.2f} {f['kardex_calc']:>10.2f} {f['diff']:>10.2f}")
        print()

        if DRY_RUN:
            print("Modo DRY RUN — no se realizaron cambios.")
            return

        confirmacion = input(f"¿Aplicar {len(fantasmas)} ajuste(s) de salida? [s/N]: ").strip().lower()
        if confirmacion != 's':
            print("Cancelado.")
            return

        aplicados = 0
        for f in fantasmas:
            item_id = f['id']
            diff = f['diff']

            # Idempotencia: no insertar si ya existe un ajuste de regularización fantasma
            ya_existe = await conn.fetchval(
                """SELECT id FROM prod_inventario_ajustes
                   WHERE item_id = $1
                     AND observaciones = $2
                   LIMIT 1""",
                item_id, MARCA_OBSERVACIONES
            )
            if ya_existe:
                print(f"  ⏭  {f['codigo']} ya tiene ajuste de regularización (skip)")
                continue

            ajuste_id = str(uuid.uuid4())
            # Insertar ajuste_ENTRADA por la diferencia:
            # kardex_calc (2751) < stock_actual (2951) → subimos kardex_calc al nivel del stock_actual
            # con un ajuste de entrada que documenta la regularización.
            await conn.execute(
                """INSERT INTO prod_inventario_ajustes
                   (id, item_id, tipo, subtipo, cantidad, motivo, observaciones, fecha)
                   VALUES ($1, $2, 'entrada', 'ajuste_fantasma', $3,
                           'Regularización stock fantasma por bug histórico',
                           $4, CURRENT_TIMESTAMP)""",
                ajuste_id, item_id, diff, MARCA_OBSERVACIONES
            )
            # stock_actual ya está correcto (es el valor de referencia);
            # el ajuste_entrada eleva kardex_calc hasta igualarlo.
            aplicados += 1
            print(f"  ✅ {f['codigo']} — ajuste salida por {diff:.2f}")

        print(f"\nFinalizado. {aplicados} ajuste(s) creado(s).")
        print()
        print("── Verificación SQL ──────────────────────────────────────────────────")
        print("""
WITH kardex AS (
    SELECT item_id, COALESCE(SUM(qty), 0) AS calc FROM (
        SELECT item_id, cantidad AS qty FROM prod_inventario_ingresos
        UNION ALL SELECT item_id, -cantidad FROM prod_inventario_salidas
        UNION ALL SELECT item_id,
            CASE WHEN tipo='entrada' THEN cantidad ELSE -cantidad END
            FROM prod_inventario_ajustes
    ) m GROUP BY item_id
)
SELECT i.codigo, i.nombre, i.stock_actual, k.calc, i.stock_actual - k.calc AS diff
FROM prod_inventario i
LEFT JOIN kardex k ON i.id = k.item_id
WHERE ABS(i.stock_actual - COALESCE(k.calc, 0)) > 0.001
ORDER BY i.codigo;
""")


if __name__ == '__main__':
    asyncio.run(main())
