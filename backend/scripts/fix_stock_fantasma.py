"""
Fix: Stock Fantasma en prod_inventario

Para items cuyo stock_actual en la BD no coincide con la suma de movimientos del kardex,
genera un ingreso retroactivo de tipo 'stock_inicial' para regularizar la discrepancia.

IMPORTANTE: NO modifica prod_inventario.stock_actual — solo crea el movimiento faltante
en el kardex para que coincida con el stock ya registrado en la tabla.

Idempotente: si ya existe un ingreso con observaciones LIKE 'Regularización: stock inicial%'
para ese item, no lo duplica.

Uso:
    cd produccion/backend
    python scripts/fix_stock_fantasma.py
"""
import asyncio
import sys
import os
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_pool


async def main():
    pool = await get_pool()
    regularizados = 0
    ya_ok = 0
    errores = 0
    total_unidades = 0
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    async with pool.acquire() as conn:
        # Asegurar columna tipo_ingreso (idempotente)
        await conn.execute(
            "ALTER TABLE prod_inventario_ingresos ADD COLUMN IF NOT EXISTS tipo_ingreso VARCHAR NULL"
        )

        # Obtener todos los items con empresa_id
        items = await conn.fetch(
            """SELECT id, codigo, nombre, stock_actual, costo_promedio, created_at,
                      linea_negocio_id,
                      COALESCE(empresa_id, 7) AS empresa_id
               FROM prod_inventario
               ORDER BY codigo"""
        )

        print(f"Revisando {len(items)} items...")

        for item in items:
            item_id   = item['id']
            stock_bd  = float(item['stock_actual'] or 0)

            # Calcular kardex: ingresos - salidas ± ajustes
            ingresos_sum = float(await conn.fetchval(
                "SELECT COALESCE(SUM(cantidad), 0) FROM prod_inventario_ingresos WHERE item_id = $1",
                item_id
            ) or 0)
            salidas_sum = float(await conn.fetchval(
                "SELECT COALESCE(SUM(cantidad), 0) FROM prod_inventario_salidas WHERE item_id = $1",
                item_id
            ) or 0)
            ajustes = await conn.fetch(
                "SELECT tipo, cantidad FROM prod_inventario_ajustes WHERE item_id = $1",
                item_id
            )
            ajustes_neto = sum(
                float(a['cantidad']) if a['tipo'] == 'entrada' else -float(a['cantidad'])
                for a in ajustes
            )

            kardex_calc = round(ingresos_sum - salidas_sum + ajustes_neto, 6)
            diferencia  = round(stock_bd - kardex_calc, 6)

            if abs(diferencia) <= 0.001:
                ya_ok += 1
                continue

            # Idempotencia: ¿ya fue regularizado antes?
            ya_existe = await conn.fetchval(
                """SELECT COUNT(*) FROM prod_inventario_ingresos
                   WHERE item_id = $1
                     AND observaciones LIKE 'Regularización: stock inicial%'""",
                item_id
            )
            if ya_existe > 0:
                print(f"  {item['codigo']} ({item['nombre']}): ya regularizado anteriormente, omitiendo.")
                ya_ok += 1
                continue

            try:
                async with conn.transaction():
                    if diferencia > 0:
                        # Stock BD > kardex → falta ingreso
                        ingreso_id = str(uuid.uuid4())
                        costo_u    = float(item['costo_promedio'] or 0)
                        fecha      = item['created_at']  # Fecha del item, no now()

                        await conn.execute(
                            """INSERT INTO prod_inventario_ingresos
                                   (id, item_id, cantidad, cantidad_disponible, costo_unitario,
                                    proveedor, numero_documento, observaciones, tipo_ingreso,
                                    fecha, empresa_id, linea_negocio_id)
                               VALUES ($1, $2, $3, $4, $5, '', '',
                                       $6, 'stock_inicial',
                                       $7, $8, $9)""",
                            ingreso_id,
                            item_id,
                            diferencia,
                            diferencia,
                            costo_u,
                            f'Regularización: stock inicial no registrado al crear item — fix_stock_fantasma.py {ahora}',
                            fecha,
                            item['empresa_id'],
                            item['linea_negocio_id'],
                        )
                        print(
                            f"  {item['codigo']} ({item['nombre']}): "
                            f"stock={int(stock_bd)}, kardex={int(kardex_calc)}, "
                            f"diff=+{int(diferencia)} → Ingreso creado"
                        )
                        total_unidades += diferencia

                    else:
                        # Stock BD < kardex → sobran movimientos, crear ajuste de salida
                        diferencia_abs = abs(diferencia)
                        ajuste_id = str(uuid.uuid4())
                        await conn.execute(
                            """INSERT INTO prod_inventario_ajustes
                                   (id, item_id, tipo, cantidad, motivo, observaciones, fecha)
                               VALUES ($1, $2, 'salida', $3,
                                       'Regularización: exceso de stock detectado al auditar kardex',
                                       $4, CURRENT_TIMESTAMP)""",
                            ajuste_id,
                            item_id,
                            diferencia_abs,
                            f'fix_stock_fantasma.py {ahora}',
                        )
                        print(
                            f"  {item['codigo']} ({item['nombre']}): "
                            f"stock={int(stock_bd)}, kardex={int(kardex_calc)}, "
                            f"diff={int(diferencia)} → Ajuste salida creado"
                        )

                regularizados += 1

            except Exception as e:
                errores += 1
                print(f"  {item['codigo']}: ERROR — {e}")

    # ── Resumen ──────────────────────────────────────────────────────────────
    print()
    print("Resultado:")
    print(f"  ✅ {ya_ok} items ya estaban OK")
    print(f"  ✅ {regularizados} items regularizados (+{int(total_unidades)} unidades en total)")
    print(f"  ⚠️  {errores} items con error")

    # ── Query de validación ───────────────────────────────────────────────────
    print()
    print("Para validar (debe devolver 0 filas):")
    print("""
  WITH kardex_calc AS (
    SELECT item_id, SUM(qty) AS stock_kardex
    FROM (
      SELECT item_id,  cantidad AS qty FROM prod_inventario_ingresos
      UNION ALL
      SELECT item_id, -cantidad AS qty FROM prod_inventario_salidas
      UNION ALL
      SELECT item_id,
             CASE WHEN tipo = 'entrada' THEN cantidad ELSE -cantidad END AS qty
      FROM prod_inventario_ajustes
    ) movs
    GROUP BY item_id
  )
  SELECT i.codigo, i.nombre, i.stock_actual,
         COALESCE(k.stock_kardex, 0) AS stock_kardex,
         i.stock_actual - COALESCE(k.stock_kardex, 0) AS diferencia
  FROM prod_inventario i
  LEFT JOIN kardex_calc k ON i.id = k.item_id
  WHERE ABS(i.stock_actual - COALESCE(k.stock_kardex, 0)) > 0.001
  ORDER BY ABS(i.stock_actual - COALESCE(k.stock_kardex, 0)) DESC;
""")


if __name__ == "__main__":
    asyncio.run(main())
