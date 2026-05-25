"""
Backfill: prod_registro_tallas desde prod_registros.tallas (JSONB legacy)

CONTEXTO:
Históricamente las tallas de un corte se guardaban en dos lugares:
  - JSONB  → prod_registros.tallas
  - Tabla  → prod_registro_tallas (normalizada, leída por reportes formales)

El endpoint create_registro guardaba SOLO el JSONB y olvidaba poblar la tabla.
Resultado: cortes creados (y nunca editados por completo) quedaron con tallas
en el JSONB pero la tabla vacía. Reportes formales veían 0 prendas para ellos.

Este script recorre todos los registros donde la tabla normalizada esté vacía
pero el JSONB tenga cantidades, y crea las filas faltantes. Es idempotente:
si la tabla ya tiene filas para ese registro, no toca nada.

Uso:
    cd produccion/backend
    python scripts/backfill_tallas_normalizadas.py [--dry-run]

Opciones:
    --dry-run   Solo reporta qué haría sin escribir nada en la BD.
"""
import asyncio
import sys
import os
import json
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_pool


def parse_jsonb(value):
    """asyncpg puede devolver JSONB como dict/list ya parseado o como str."""
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return None
    return None


async def main(dry_run: bool = False):
    pool = await get_pool()
    revisados = 0
    backfilled = 0
    ya_ok = 0
    sin_datos = 0
    incoherentes = 0
    total_filas_insertadas = 0
    detalles_backfill = []
    detalles_incoherentes = []

    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ahora}] Iniciando backfill de tallas{'(DRY-RUN)' if dry_run else ''}...\n")

    async with pool.acquire() as conn:
        # Universo: todos los registros con su JSONB
        registros = await conn.fetch(
            """SELECT id, n_corte, empresa_id, modelo_id, tallas
                 FROM prod_registros
                ORDER BY n_corte"""
        )
        total = len(registros)
        print(f"Total de registros a revisar: {total}\n")

        # Catálogo de tallas válidas por modelo (para validar)
        modelo_tallas = await conn.fetch(
            """SELECT modelo_id, talla_id
                 FROM prod_modelo_tallas
                WHERE activo = TRUE"""
        )
        valid_por_modelo = {}
        for r in modelo_tallas:
            valid_por_modelo.setdefault(r['modelo_id'], set()).add(r['talla_id'])

        for r in registros:
            revisados += 1
            reg_id = r['id']
            n_corte = r['n_corte']
            modelo_id = r['modelo_id']

            # ¿Ya tiene filas en la tabla?
            count_tabla = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_registro_tallas WHERE registro_id = $1",
                reg_id,
            )
            if count_tabla and count_tabla > 0:
                ya_ok += 1
                continue

            # No tiene filas → revisar JSONB
            tallas_jsonb = parse_jsonb(r['tallas'])
            if not tallas_jsonb or not isinstance(tallas_jsonb, list):
                sin_datos += 1
                continue

            # Construir lista de tallas válidas (con cantidad > 0 y talla_id que pertenece al modelo)
            valid_set = valid_por_modelo.get(modelo_id, set())
            a_insertar = []
            descartadas_por_modelo = []
            for t in tallas_jsonb:
                if not isinstance(t, dict):
                    continue
                tid = t.get('talla_id')
                tnom = t.get('talla_nombre') or ''
                cant = int(t.get('cantidad', 0) or 0)
                if not tid or cant <= 0:
                    continue
                if valid_set and tid not in valid_set:
                    # Talla en JSONB que NO pertenece al modelo actual: la registramos
                    # como incoherencia y NO la insertamos para no romper la FK lógica.
                    descartadas_por_modelo.append((tid, tnom, cant))
                    continue
                a_insertar.append((tid, tnom, cant))

            if not a_insertar:
                if descartadas_por_modelo:
                    incoherentes += 1
                    detalles_incoherentes.append({
                        'n_corte': n_corte,
                        'registro_id': reg_id,
                        'tallas_invalidas': descartadas_por_modelo,
                    })
                else:
                    sin_datos += 1
                continue

            # Hacer el insert
            empresa_id = r['empresa_id'] or 7
            if not dry_run:
                async with conn.transaction():
                    for tid, _tnom, cant in a_insertar:
                        await conn.execute(
                            """INSERT INTO prod_registro_tallas
                                   (id, registro_id, talla_id, cantidad_real, empresa_id, created_at, updated_at)
                               VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                            str(uuid.uuid4()), reg_id, tid, cant, empresa_id,
                        )

            backfilled += 1
            total_filas_insertadas += len(a_insertar)
            detalles_backfill.append({
                'n_corte': n_corte,
                'filas': len(a_insertar),
                'total_pzs': sum(c for _, _, c in a_insertar),
                'descartadas': len(descartadas_por_modelo),
            })

    print(f"\n{'='*60}")
    print(f"RESUMEN ({'DRY-RUN' if dry_run else 'APLICADO'})")
    print(f"{'='*60}")
    print(f"  Registros revisados        : {revisados}")
    print(f"  Ya tenían filas en tabla   : {ya_ok}")
    print(f"  Sin tallas en ningún lado  : {sin_datos}")
    print(f"  Incoherentes (JSONB con tallas que no son del modelo): {incoherentes}")
    print(f"  Backfilled                 : {backfilled}")
    print(f"  Filas insertadas           : {total_filas_insertadas}")
    print(f"{'='*60}\n")

    if detalles_backfill:
        print("DETALLE BACKFILL (primeros 20):")
        for d in detalles_backfill[:20]:
            desc = f" (+ {d['descartadas']} descartadas)" if d['descartadas'] else ''
            print(f"  - {d['n_corte']:20s} → {d['filas']} tallas, {d['total_pzs']} pzs{desc}")
        if len(detalles_backfill) > 20:
            print(f"  ... y {len(detalles_backfill) - 20} más.")
        print()

    if detalles_incoherentes:
        print("INCOHERENCIAS (tallas en JSONB que NO pertenecen al modelo):")
        for d in detalles_incoherentes[:10]:
            print(f"  - {d['n_corte']}: {len(d['tallas_invalidas'])} tallas inválidas:")
            for tid, tnom, cant in d['tallas_invalidas'][:5]:
                print(f"      talla_id={tid[:8]}... '{tnom}' cant={cant}")
        if len(detalles_incoherentes) > 10:
            print(f"  ... y {len(detalles_incoherentes) - 10} más.")
        print()
        print("  Estas requieren revisión manual: el modelo cambió su catálogo de tallas")
        print("  después de crear el corte. Resolver desde web reasignando talla.\n")

    if dry_run:
        print("⚠  Esto fue un dry-run. Para aplicar, corre el script sin --dry-run.")
    else:
        print("✓ Backfill aplicado.")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    asyncio.run(main(dry_run=dry))
