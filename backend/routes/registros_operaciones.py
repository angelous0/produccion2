"""Router for registros: cerrar/anular OP, resumen, división y reunificación de lotes."""
import json
import uuid
from fastapi import APIRouter, HTTPException, Depends, Query
from db import get_pool
from auth_utils import get_current_user
from models import DivisionLoteRequest
from helpers import row_to_dict
from routes.registros_materiales import liberar_reservas_pendientes_auto

router = APIRouter(prefix="/api")


@router.post("/registros/{registro_id}/cerrar")
async def cerrar_registro(registro_id: str):
    """
    Cierra una OP (Orden de Producción).
    - Cambia estado a CERRADA
    - Libera automáticamente todas las reservas pendientes
    - No revierte salidas ya realizadas
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Validar registro
            registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
            if not registro:
                raise HTTPException(status_code=404, detail="Registro no encontrado")

            estado_actual = registro['estado']
            if estado_actual == 'ANULADA':
                raise HTTPException(status_code=400, detail="No se puede cerrar una OP que ya está ANULADA")

            if estado_actual == 'CERRADA':
                raise HTTPException(status_code=400, detail="La OP ya está CERRADA")

            # Cambiar estado a CERRADA
            await conn.execute("""
                UPDATE prod_registros
                SET estado = 'CERRADA'
                WHERE id = $1
            """, registro_id)

            # Liberar reservas pendientes automáticamente
            liberacion = await liberar_reservas_pendientes_auto(conn, registro_id)

            return {
                "message": "OP cerrada correctamente",
                "estado_nuevo": "CERRADA",
                "estado_anterior": estado_actual,
                "reservas_liberadas_total": liberacion["total_liberado"],
                "items_liberados": liberacion["items_liberados"]
            }


@router.post("/registros/{registro_id}/anular")
async def anular_registro(registro_id: str):
    """
    Anula una OP (Orden de Producción).
    - Cambia estado a ANULADA
    - Libera automáticamente TODAS las reservas pendientes
    - NO revierte salidas ya realizadas (mantiene trazabilidad FIFO)
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Validar registro
            registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
            if not registro:
                raise HTTPException(status_code=404, detail="Registro no encontrado")

            estado_actual = registro['estado']
            if estado_actual == 'ANULADA':
                raise HTTPException(status_code=400, detail="La OP ya está ANULADA")

            # Cambiar estado a ANULADA
            await conn.execute("""
                UPDATE prod_registros
                SET estado = 'ANULADA'
                WHERE id = $1
            """, registro_id)

            # Liberar reservas pendientes automáticamente
            liberacion = await liberar_reservas_pendientes_auto(conn, registro_id)

            # Obtener info de salidas ya realizadas (para trazabilidad)
            salidas_realizadas = await conn.fetchval("""
                SELECT COUNT(*) FROM prod_inventario_salidas WHERE registro_id = $1
            """, registro_id)

            return {
                "message": "OP anulada correctamente",
                "estado_nuevo": "ANULADA",
                "estado_anterior": estado_actual,
                "reservas_liberadas_total": liberacion["total_liberado"],
                "items_liberados": liberacion["items_liberados"],
                "salidas_no_revertidas": salidas_realizadas,
                "nota": "Las salidas de inventario ya realizadas NO se revierten para mantener trazabilidad FIFO"
            }


@router.get("/registros/{registro_id}/resumen")
async def get_resumen_registro(registro_id: str):
    """
    Devuelve un resumen completo de la OP:
    - Total de prendas (sum tallas)
    - Requerimiento: requerida/reservada/consumida/pendiente por item/talla
    - Reservas: estado y detalle
    - Salidas: total consumido por item/talla, detalle por rollo si aplica
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Validar registro
        registro = await conn.fetchrow("""
            SELECT r.*, m.nombre as modelo_nombre
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            WHERE r.id = $1
        """, registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # Total de prendas (sum de tallas)
        total_prendas = await conn.fetchval("""
            SELECT COALESCE(SUM(cantidad_real), 0) FROM prod_registro_tallas WHERE registro_id = $1
        """, registro_id)

        # Detalle de tallas
        tallas = await conn.fetch("""
            SELECT rt.*, tc.nombre as talla_nombre
            FROM prod_registro_tallas rt
            LEFT JOIN prod_tallas_catalogo tc ON rt.talla_id = tc.id
            WHERE rt.registro_id = $1
            ORDER BY tc.orden
        """, registro_id)

        # Requerimiento de MP
        requerimiento = await conn.fetch("""
            SELECT req.*,
                   i.codigo as item_codigo, i.nombre as item_nombre, i.unidad_medida,
                   tc.nombre as talla_nombre,
                   GREATEST(0, req.cantidad_requerida - req.cantidad_consumida) as pendiente_consumir,
                   GREATEST(0, req.cantidad_reservada - req.cantidad_consumida) as reserva_disponible
            FROM prod_registro_requerimiento_mp req
            JOIN prod_inventario i ON req.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON req.talla_id = tc.id
            WHERE req.registro_id = $1
            ORDER BY i.nombre, tc.orden
        """, registro_id)

        # Reservas
        reservas_raw = await conn.fetch("""
            SELECT res.id, res.estado as reserva_estado, res.fecha as reserva_fecha,
                   rl.item_id, rl.talla_id, rl.cantidad_reservada, rl.cantidad_liberada,
                   i.nombre as item_nombre, tc.nombre as talla_nombre
            FROM prod_inventario_reservas res
            JOIN prod_inventario_reservas_linea rl ON rl.reserva_id = res.id
            JOIN prod_inventario i ON rl.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON rl.talla_id = tc.id
            WHERE res.registro_id = $1
            ORDER BY res.fecha DESC
        """, registro_id)

        # Agrupar reservas
        reservas_totales = {
            "total_reservado": 0,
            "total_liberado": 0,
            "activas": 0,
            "cerradas": 0,
            "detalle": []
        }
        for r in reservas_raw:
            reservas_totales["total_reservado"] += float(r['cantidad_reservada'])
            reservas_totales["total_liberado"] += float(r['cantidad_liberada'])
            if r['reserva_estado'] == 'ACTIVA':
                reservas_totales["activas"] += 1
            else:
                reservas_totales["cerradas"] += 1
            reservas_totales["detalle"].append({
                "item_id": r['item_id'],
                "item_nombre": r['item_nombre'],
                "talla_id": r['talla_id'],
                "talla_nombre": r['talla_nombre'],
                "cantidad_reservada": float(r['cantidad_reservada']),
                "cantidad_liberada": float(r['cantidad_liberada']),
                "pendiente": float(r['cantidad_reservada']) - float(r['cantidad_liberada']),
                "reserva_estado": r['reserva_estado']
            })

        # Salidas
        salidas = await conn.fetch("""
            SELECT s.*,
                   i.codigo as item_codigo, i.nombre as item_nombre, i.control_por_rollos,
                   tc.nombre as talla_nombre,
                   ro.numero_rollo, ro.tono
            FROM prod_inventario_salidas s
            JOIN prod_inventario i ON s.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON s.talla_id = tc.id
            LEFT JOIN prod_inventario_rollos ro ON s.rollo_id = ro.id
            WHERE s.registro_id = $1
            ORDER BY s.fecha DESC
        """, registro_id)

        # Agrupar salidas por item/talla
        salidas_por_item = {}
        for s in salidas:
            key = f"{s['item_id']}_{s['talla_id'] or 'null'}"
            if key not in salidas_por_item:
                salidas_por_item[key] = {
                    "item_id": s['item_id'],
                    "item_nombre": s['item_nombre'],
                    "talla_id": s['talla_id'],
                    "talla_nombre": s['talla_nombre'],
                    "total_consumido": 0,
                    "costo_total": 0,
                    "detalle_salidas": []
                }
            salidas_por_item[key]["total_consumido"] += float(s['cantidad'])
            salidas_por_item[key]["costo_total"] += float(s['costo_total']) if s['costo_total'] else 0
            salidas_por_item[key]["detalle_salidas"].append({
                "id": s['id'],
                "cantidad": float(s['cantidad']),
                "costo_total": float(s['costo_total']) if s['costo_total'] else 0,
                "fecha": s['fecha'].isoformat() if s['fecha'] else None,
                "rollo_id": s['rollo_id'],
                "numero_rollo": s['numero_rollo'],
                "tono": s['tono']
            })

        return {
            "registro": {
                "id": registro['id'],
                "n_corte": registro['n_corte'],
                "estado": registro['estado'],
                "modelo_nombre": registro['modelo_nombre'],
                "fecha_creacion": registro['fecha_creacion'].isoformat() if registro['fecha_creacion'] else None,
                "urgente": registro['urgente']
            },
            "total_prendas": int(total_prendas or 0),
            "tallas": [
                {
                    "talla_id": t['talla_id'],
                    "talla_nombre": t['talla_nombre'],
                    "cantidad": int(t['cantidad_real']) if t['cantidad_real'] else 0
                }
                for t in tallas
            ],
            "requerimiento": [
                {
                    "id": r['id'],
                    "item_id": r['item_id'],
                    "item_codigo": r['item_codigo'],
                    "item_nombre": r['item_nombre'],
                    "unidad_medida": r['unidad_medida'],
                    "talla_id": r['talla_id'],
                    "talla_nombre": r['talla_nombre'],
                    "cantidad_requerida": float(r['cantidad_requerida']),
                    "cantidad_reservada": float(r['cantidad_reservada']),
                    "cantidad_consumida": float(r['cantidad_consumida']),
                    "pendiente_consumir": float(r['pendiente_consumir']),
                    "reserva_disponible": float(r['reserva_disponible']),
                    "estado": r['estado']
                }
                for r in requerimiento
            ],
            "reservas": reservas_totales,
            "salidas": {
                "total_salidas": len(salidas),
                "costo_total": sum(float(s['costo_total'] or 0) for s in salidas),
                "por_item": list(salidas_por_item.values())
            }
        }


# ==================== ENDPOINTS INVENTARIO ====================

CATEGORIAS_INVENTARIO = ["Telas", "Avios", "Otros"]
@router.post("/registros/{registro_id}/dividir")
async def dividir_lote(registro_id: str, body: DivisionLoteRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        padre = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not padre:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        tallas_padre = padre['tallas'] if isinstance(padre['tallas'], list) else json.loads(padre['tallas']) if padre['tallas'] else []
        tallas_hijo_req = body.tallas_hijo

        # Validar que las cantidades del hijo no excedan las del padre
        padre_map = {t['talla_id']: t for t in tallas_padre}
        nuevas_tallas_padre = []
        tallas_hijo_final = []

        for tp in tallas_padre:
            hijo_t = next((h for h in tallas_hijo_req if h.get('talla_id') == tp['talla_id']), None)
            cant_hijo = hijo_t.get('cantidad', 0) if hijo_t else 0
            if cant_hijo < 0:
                raise HTTPException(status_code=400, detail=f"Cantidad negativa para talla {tp.get('talla_nombre')}")
            if cant_hijo > tp['cantidad']:
                raise HTTPException(status_code=400, detail=f"Cantidad para talla {tp.get('talla_nombre')} ({cant_hijo}) excede disponible ({tp['cantidad']})")
            nuevas_tallas_padre.append({**tp, 'cantidad': tp['cantidad'] - cant_hijo})
            if cant_hijo > 0:
                tallas_hijo_final.append({**tp, 'cantidad': cant_hijo})

        if not tallas_hijo_final:
            raise HTTPException(status_code=400, detail="Debe asignar al menos una talla al nuevo lote")

        # Determinar número de división
        max_div = await conn.fetchval(
            "SELECT COALESCE(MAX(division_numero), 0) FROM prod_registros WHERE dividido_desde_registro_id = $1",
            registro_id
        )
        # También considerar divisiones del padre original
        padre_original_id = padre.get('dividido_desde_registro_id') or registro_id
        if padre_original_id != registro_id:
            max_div2 = await conn.fetchval(
                "SELECT COALESCE(MAX(division_numero), 0) FROM prod_registros WHERE dividido_desde_registro_id = $1",
                padre_original_id
            )
            max_div = max(max_div, max_div2)

        division_num = max_div + 1
        n_corte_base = padre['n_corte'].split('-')[0]
        n_corte_hijo = f"{n_corte_base}-{division_num}"

        hijo_id = str(uuid.uuid4())
        estado_hijo = body.estado_hijo or padre['estado']

        await conn.execute("""
            INSERT INTO prod_registros (id, n_corte, modelo_id, curva, estado, urgente, tallas, distribucion_colores,
                fecha_creacion, hilo_especifico_id, empresa_id, pt_item_id, fecha_entrega_final,
                dividido_desde_registro_id, division_numero)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, CURRENT_TIMESTAMP, $9, $10, $11, $12, $13, $14)
        """,
            hijo_id, n_corte_hijo, padre['modelo_id'], padre.get('curva'), estado_hijo,
            padre.get('urgente', False),
            json.dumps(tallas_hijo_final), json.dumps(padre['distribucion_colores'] if isinstance(padre['distribucion_colores'], list) else []),
            padre.get('hilo_especifico_id'), padre.get('empresa_id'), padre.get('pt_item_id'),
            padre.get('fecha_entrega_final'),
            registro_id, division_num
        )

        await conn.execute(
            "UPDATE prod_registros SET tallas = $1::jsonb WHERE id = $2",
            json.dumps(nuevas_tallas_padre), registro_id
        )

        # Sincronizar prod_registro_tallas del padre (actualizar cantidades)
        for tp in nuevas_tallas_padre:
            await conn.execute(
                "UPDATE prod_registro_tallas SET cantidad_real = $1, updated_at = CURRENT_TIMESTAMP WHERE registro_id = $2 AND talla_id = $3",
                tp['cantidad'], registro_id, tp['talla_id']
            )

        # Crear prod_registro_tallas del hijo
        # Obtener empresa_id real desde los registros existentes
        empresa_id_real = await conn.fetchval(
            "SELECT empresa_id FROM prod_registro_tallas WHERE registro_id = $1 LIMIT 1", registro_id
        ) or 7
        for th in tallas_hijo_final:
            await conn.execute(
                """INSERT INTO prod_registro_tallas (id, registro_id, talla_id, cantidad_real, empresa_id, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                str(uuid.uuid4()), hijo_id, th['talla_id'], th['cantidad'], empresa_id_real
            )

        return {
            "mensaje": f"Lote dividido exitosamente. Nuevo registro: {n_corte_hijo}",
            "registro_hijo_id": hijo_id,
            "n_corte_hijo": n_corte_hijo,
            "tallas_padre": nuevas_tallas_padre,
            "tallas_hijo": tallas_hijo_final,
        }

@router.get("/registros/{registro_id}/divisiones")
async def get_divisiones_registro(registro_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        padre = await conn.fetchrow("SELECT id, n_corte, dividido_desde_registro_id FROM prod_registros WHERE id = $1", registro_id)
        if not padre:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # Hijos directos
        hijos = await conn.fetch(
            "SELECT id, n_corte, estado, tallas, division_numero FROM prod_registros WHERE dividido_desde_registro_id = $1 ORDER BY division_numero",
            registro_id
        )

        # Si este registro es un hijo, obtener info del padre
        padre_info = None
        if padre['dividido_desde_registro_id']:
            p = await conn.fetchrow(
                "SELECT id, n_corte, estado FROM prod_registros WHERE id = $1",
                padre['dividido_desde_registro_id']
            )
            if p:
                padre_info = {"id": p['id'], "n_corte": p['n_corte'], "estado": p['estado']}

        # Hermanos (otros hijos del mismo padre)
        hermanos = []
        if padre['dividido_desde_registro_id']:
            hermanos_rows = await conn.fetch(
                "SELECT id, n_corte, estado FROM prod_registros WHERE dividido_desde_registro_id = $1 AND id != $2 ORDER BY division_numero",
                padre['dividido_desde_registro_id'], registro_id
            )
            hermanos = [{"id": h['id'], "n_corte": h['n_corte'], "estado": h['estado']} for h in hermanos_rows]

        return {
            "registro_id": registro_id,
            "n_corte": padre['n_corte'],
            "es_hijo": padre['dividido_desde_registro_id'] is not None,
            "padre": padre_info,
            "hijos": [
                {
                    "id": h['id'],
                    "n_corte": h['n_corte'],
                    "estado": h['estado'],
                    "tallas": h['tallas'] if isinstance(h['tallas'], list) else json.loads(h['tallas']) if h['tallas'] else [],
                    "division_numero": h['division_numero'],
                }
                for h in hijos
            ],
            "hermanos": hermanos,
        }

@router.post("/registros/{registro_id}/reunificar")
async def reunificar_lote(registro_id: str):
    """Reunifica un registro hijo con su padre. Solo si el hijo no tiene movimientos propios."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        hijo = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not hijo:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        if not hijo.get('dividido_desde_registro_id'):
            raise HTTPException(status_code=400, detail="Este registro no es una división. No se puede reunificar.")

        padre_id = hijo['dividido_desde_registro_id']

        # Verificar que el hijo no tenga movimientos
        mov_count = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_movimientos_produccion WHERE registro_id = $1", registro_id
        )
        if mov_count and mov_count > 0:
            raise HTTPException(status_code=400, detail="Este lote ya tiene movimientos registrados. No se puede reunificar.")

        # Verificar que el hijo no tenga salidas de inventario
        sal_count = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_inventario_salidas WHERE registro_id = $1", registro_id
        )
        if sal_count and sal_count > 0:
            raise HTTPException(status_code=400, detail="Este lote ya tiene salidas de inventario. No se puede reunificar.")

        # Sumar tallas del hijo al padre
        padre = await conn.fetchrow("SELECT tallas FROM prod_registros WHERE id = $1", padre_id)
        tallas_padre = padre['tallas'] if isinstance(padre['tallas'], list) else json.loads(padre['tallas']) if padre['tallas'] else []
        tallas_hijo = hijo['tallas'] if isinstance(hijo['tallas'], list) else json.loads(hijo['tallas']) if hijo['tallas'] else []

        padre_map = {t['talla_id']: t for t in tallas_padre}
        for th in tallas_hijo:
            tid = th['talla_id']
            if tid in padre_map:
                padre_map[tid]['cantidad'] = padre_map[tid]['cantidad'] + th['cantidad']
            else:
                padre_map[tid] = th

        nuevas_tallas = list(padre_map.values())

        await conn.execute(
            "UPDATE prod_registros SET tallas = $1::jsonb WHERE id = $2",
            json.dumps(nuevas_tallas), padre_id
        )

        # Sincronizar prod_registro_tallas del padre
        for tp in nuevas_tallas:
            existing = await conn.fetchval(
                "SELECT id FROM prod_registro_tallas WHERE registro_id = $1 AND talla_id = $2", padre_id, tp['talla_id']
            )
            if existing:
                await conn.execute(
                    "UPDATE prod_registro_tallas SET cantidad_real = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                    tp['cantidad'], existing
                )
            else:
                await conn.execute(
                    """INSERT INTO prod_registro_tallas (id, registro_id, talla_id, cantidad_real, empresa_id, created_at, updated_at)
                       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                    str(uuid.uuid4()), padre_id, tp['talla_id'], tp['cantidad'], 7
                )

        # Eliminar prod_registro_tallas del hijo
        await conn.execute("DELETE FROM prod_registro_tallas WHERE registro_id = $1", registro_id)

        # Eliminar incidencias y paralizaciones del hijo
        await conn.execute("DELETE FROM prod_incidencia WHERE registro_id = $1", registro_id)
        await conn.execute("DELETE FROM prod_paralizacion WHERE registro_id = $1", registro_id)

        # Eliminar el registro hijo
        await conn.execute("DELETE FROM prod_registros WHERE id = $1", registro_id)

        return {
            "mensaje": f"Lote reunificado exitosamente con {padre['tallas']}",
            "padre_id": padre_id,
            "tallas_reunificadas": nuevas_tallas,
        }
