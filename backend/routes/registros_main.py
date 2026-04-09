"""Router for production registros CRUD, estados, tallas, requerimiento, materiales, reservas, cerrar, anular, dividir, reunificar."""
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from db import get_pool
from auth_utils import get_current_user, require_permiso as require_permission
from models import (
    RegistroCreate, Registro, RegistroTallaCreate, RegistroTallaUpdate, RegistroTallaBulkUpdate,
    ReservaCreateInput, LiberarReservaInput, ESTADOS_PRODUCCION, DivisionLoteRequest,
)
from helpers import row_to_dict, parse_jsonb, registrar_actividad
from routes.auditoria import audit_log_safe, get_usuario
from typing import Optional, List
from pydantic import BaseModel

router = APIRouter(prefix="/api")

@router.get("/estados")
async def get_estados():
    return {"estados": ESTADOS_PRODUCCION}

@router.get("/registros")
async def get_registros(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    estados: str = "",
    excluir_estados: str = "Tienda",
    modelo_id: str = "",
    operativo: str = "",
    linea_negocio_id: str = "",
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Build WHERE clause dynamically
        conditions = []
        params = []
        param_idx = 1

        if search:
            conditions.append(f"(r.n_corte ILIKE ${param_idx} OR m.nombre ILIKE ${param_idx})")
            params.append(f"%{search}%")
            param_idx += 1

        if estados:
            estado_list = [e.strip() for e in estados.split(",") if e.strip()]
            if estado_list:
                placeholders = ", ".join(f"${param_idx + i}" for i in range(len(estado_list)))
                conditions.append(f"r.estado IN ({placeholders})")
                params.extend(estado_list)
                param_idx += len(estado_list)

        if excluir_estados:
            excl_list = [e.strip() for e in excluir_estados.split(",") if e.strip()]
            if excl_list:
                placeholders = ", ".join(f"${param_idx + i}" for i in range(len(excl_list)))
                conditions.append(f"(r.estado NOT IN ({placeholders}) OR r.estado IS NULL)")
                params.extend(excl_list)
                param_idx += len(excl_list)

        if modelo_id:
            conditions.append(f"r.modelo_id = ${param_idx}")
            params.append(modelo_id)
            param_idx += 1

        if linea_negocio_id:
            conditions.append(f"r.linea_negocio_id = ${param_idx}")
            params.append(int(linea_negocio_id))
            param_idx += 1

        where_clause = " AND ".join(conditions) if conditions else "TRUE"

        # Un solo query: count con window function + data paginada
        rows = await conn.fetch(f"""
            SELECT r.*,
                COUNT(*) OVER() as _total_count,
                m.nombre as modelo_nombre,
                ma.nombre as marca_nombre,
                t.nombre as tipo_nombre,
                e.nombre as entalle_nombre,
                te.nombre as tela_nombre,
                h.nombre as hilo_nombre,
                he.nombre as hilo_especifico_nombre,
                rp.n_corte as padre_n_corte,
                ln.nombre as linea_negocio_nombre,
                (SELECT COUNT(*) FROM prod_incidencia i WHERE i.registro_id = r.id AND i.estado = 'ABIERTA') as incidencias_abiertas,
                (SELECT row_to_json(p.*) FROM prod_paralizacion p WHERE p.registro_id = r.id AND p.activa = TRUE LIMIT 1) as paralizacion_json,
                (SELECT COUNT(*) FROM prod_movimientos_produccion mp WHERE mp.registro_id = r.id AND mp.fecha_esperada_movimiento < CURRENT_DATE) as movs_vencidos,
                (SELECT COUNT(*) FROM prod_registros rh WHERE rh.dividido_desde_registro_id = r.id) as cantidad_divisiones,
                (SELECT COALESCE(SUM(cantidad),0) FROM prod_mermas pm WHERE pm.registro_id = r.id) as mermas_total,
                (SELECT COALESCE(SUM(cantidad_detectada),0) FROM prod_fallados pf WHERE pf.registro_id = r.id) as fallados_total,
                (SELECT COUNT(*) FROM prod_registro_arreglos pa WHERE pa.registro_id = r.id AND pa.estado IN ('EN_ARREGLO','PARCIAL','VENCIDO') AND pa.fecha_limite < CURRENT_DATE) as arreglos_vencidos
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_tipos t ON m.tipo_id = t.id
            LEFT JOIN prod_entalles e ON m.entalle_id = e.id
            LEFT JOIN prod_telas te ON m.tela_id = te.id
            LEFT JOIN prod_hilos h ON m.hilo_id = h.id
            LEFT JOIN prod_hilos_especificos he ON COALESCE(r.hilo_especifico_id, m.hilo_especifico_id) = he.id
            LEFT JOIN prod_registros rp ON r.dividido_desde_registro_id = rp.id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON r.linea_negocio_id = ln.id
            WHERE {where_clause}
            ORDER BY r.fecha_creacion DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """, *params, limit, offset)

        total = rows[0]['_total_count'] if rows else 0

        result = []
        from datetime import date as date_type
        for r in rows:
            d = row_to_dict(r)
            d.pop('_total_count', None)
            d['tallas'] = parse_jsonb(d.get('tallas'))
            d['distribucion_colores'] = parse_jsonb(d.get('distribucion_colores'))
            if d.get('fecha_entrega_final'):
                d['fecha_entrega_final'] = str(d['fecha_entrega_final'])
            # Paralización activa
            par_json = d.pop('paralizacion_json', None)
            if par_json and isinstance(par_json, str):
                import json as json_mod
                par_json = json_mod.loads(par_json)
            d['paralizacion_activa'] = par_json
            # Estado operativo
            movs_vencidos = d.pop('movs_vencidos', 0) or 0
            if par_json:
                d['estado_operativo'] = 'PARALIZADA'
            elif d['estado'] != 'Almacén PT':
                if movs_vencidos > 0:
                    d['estado_operativo'] = 'EN_RIESGO'
                elif d.get('fecha_entrega_final'):
                    try:
                        fecha = date_type.fromisoformat(str(d['fecha_entrega_final']))
                        d['estado_operativo'] = 'EN_RIESGO' if fecha < date_type.today() else 'NORMAL'
                    except (ValueError, TypeError):
                        d['estado_operativo'] = 'NORMAL'
                else:
                    d['estado_operativo'] = 'NORMAL'
            result.append(d)
        return {"items": result, "total": total, "limit": limit, "offset": offset}

# Endpoint para obtener estados únicos (para filtros)
@router.get("/registros-estados")
async def get_registros_estados():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT DISTINCT estado FROM prod_registros WHERE estado IS NOT NULL AND estado != '' ORDER BY estado")
        return [r['estado'] for r in rows]

@router.get("/registros/{registro_id}")
async def get_registro(registro_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Un solo query con JOINs en lugar de N+1
        row = await conn.fetchrow("""
            SELECT r.*,
                m.nombre as modelo_nombre,
                ma.nombre as marca_nombre,
                t.nombre as tipo_nombre,
                e.nombre as entalle_nombre,
                te.nombre as tela_nombre,
                h.nombre as hilo_nombre,
                he.nombre as hilo_especifico_nombre,
                pt.nombre as pt_item_nombre,
                pt.codigo as pt_item_codigo,
                ln.nombre as linea_negocio_nombre
            FROM prod_registros r
            LEFT JOIN prod_modelos m ON r.modelo_id = m.id
            LEFT JOIN prod_marcas ma ON m.marca_id = ma.id
            LEFT JOIN prod_tipos t ON m.tipo_id = t.id
            LEFT JOIN prod_entalles e ON m.entalle_id = e.id
            LEFT JOIN prod_telas te ON m.tela_id = te.id
            LEFT JOIN prod_hilos h ON m.hilo_id = h.id
            LEFT JOIN prod_hilos_especificos he ON COALESCE(r.hilo_especifico_id, m.hilo_especifico_id) = he.id
            LEFT JOIN prod_inventario pt ON r.pt_item_id = pt.id
            LEFT JOIN finanzas2.cont_linea_negocio ln ON r.linea_negocio_id = ln.id
            WHERE r.id = $1
        """, registro_id)
        if not row:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        d = row_to_dict(row)
        d['distribucion_colores'] = parse_jsonb(d.get('distribucion_colores'))
        
        # Tallas: un solo query con JOIN
        tallas_tabla = await conn.fetch("""
            SELECT rt.talla_id, rt.cantidad_real, tc.nombre as talla_nombre
            FROM prod_registro_tallas rt
            LEFT JOIN prod_tallas_catalogo tc ON rt.talla_id = tc.id
            WHERE rt.registro_id = $1
            ORDER BY tc.orden
        """, registro_id)
        
        if tallas_tabla:
            d['tallas'] = [{
                'talla_id': str(t['talla_id']),
                'talla_nombre': t['talla_nombre'] or '',
                'cantidad': int(t['cantidad_real']) if t['cantidad_real'] else 0
            } for t in tallas_tabla]
        else:
            # Fallback al JSONB - enriquecer con un solo query batch
            tallas_raw = parse_jsonb(d.get('tallas'))
            talla_ids = [t.get('talla_id') for t in tallas_raw if t.get('talla_id')]
            if talla_ids:
                talla_nombres = await conn.fetch(
                    "SELECT id, nombre FROM prod_tallas_catalogo WHERE id = ANY($1)", talla_ids)
                nombres_map = {str(tn['id']): tn['nombre'] for tn in talla_nombres}
                d['tallas'] = [{
                    'talla_id': t.get('talla_id', ''),
                    'talla_nombre': nombres_map.get(t.get('talla_id'), ''),
                    'cantidad': t.get('cantidad', 0)
                } for t in tallas_raw]
            else:
                d['tallas'] = tallas_raw

        if d.get('fecha_entrega_final'):
            d['fecha_entrega_final'] = str(d['fecha_entrega_final'])
        return d

@router.post("/registros")
async def create_registro(input: RegistroCreate, current_user: dict = Depends(get_current_user)):
    registro = Registro(**input.model_dump())
    # Sanitizar FKs opcionales: string vacío → None
    registro.pt_item_id = registro.pt_item_id or None
    registro.hilo_especifico_id = registro.hilo_especifico_id or None
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Heredar linea_negocio_id del modelo si no viene explícito
        if not registro.linea_negocio_id and registro.modelo_id:
            modelo = await conn.fetchrow("SELECT linea_negocio_id FROM prod_modelos WHERE id = $1", registro.modelo_id)
            if modelo and modelo['linea_negocio_id']:
                registro.linea_negocio_id = modelo['linea_negocio_id']
        tallas_json = json.dumps([t.model_dump() for t in registro.tallas])
        dist_json = json.dumps([d.model_dump() for d in registro.distribucion_colores])
        await conn.execute(
            """INSERT INTO prod_registros (id, n_corte, modelo_id, curva, estado, urgente, hilo_especifico_id, tallas, distribucion_colores, fecha_creacion, pt_item_id, empresa_id, observaciones, linea_negocio_id) 
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)""",
            registro.id, registro.n_corte, registro.modelo_id, registro.curva, registro.estado, registro.urgente,
            registro.hilo_especifico_id, tallas_json, dist_json, registro.fecha_creacion.replace(tzinfo=None),
            registro.pt_item_id, registro.empresa_id, registro.observaciones, registro.linea_negocio_id
        )
        cant_total = sum(t.cantidad for t in registro.tallas) if registro.tallas else 0
        await audit_log_safe(conn, get_usuario(current_user), "CREATE", "produccion", "prod_registros", registro.id,
            datos_despues={"n_corte": registro.n_corte, "modelo_id": registro.modelo_id, "estado": registro.estado,
                           "cantidad": cant_total, "linea_negocio_id": registro.linea_negocio_id, "urgente": registro.urgente},
            linea_negocio_id=registro.linea_negocio_id)
    await registrar_actividad(pool, current_user['id'], current_user.get('username', ''), "crear",
        tabla_afectada="registros", registro_id=registro.id, registro_nombre=registro.n_corte,
        descripcion=f"Creo registro {registro.n_corte} ({cant_total} prendas)")
    return registro

@router.put("/registros/{registro_id}/skip-validacion")
async def toggle_skip_validacion(registro_id: str, body: dict):
    """Activa o desactiva la validación de estados para un registro."""
    skip = body.get("skip_validacion_estado", False)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE prod_registros SET skip_validacion_estado = $1 WHERE id = $2",
            skip, registro_id
        )
        return {"ok": True, "skip_validacion_estado": skip}


@router.put("/registros/{registro_id}")
async def update_registro(registro_id: str, input: RegistroCreate, current_user: dict = Depends(get_current_user)):
    # Sanitizar FKs opcionales: string vacío → None
    input.pt_item_id = input.pt_item_id or None
    input.hilo_especifico_id = input.hilo_especifico_id or None
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not result:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        # Capturar datos_antes para auditoria
        datos_antes = {"estado": result.get('estado'), "n_corte": result.get('n_corte'),
                       "linea_negocio_id": result.get('linea_negocio_id'), "urgente": result.get('urgente')}
        
        # Validar cambio de línea de negocio si hay consumos/movimientos
        old_linea = result.get('linea_negocio_id')
        new_linea = input.linea_negocio_id
        if old_linea and new_linea != old_linea:
            tiene_consumos = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_inventario_salidas WHERE registro_id = $1", registro_id
            )
            tiene_movimientos = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_movimientos_produccion WHERE registro_id = $1", registro_id
            )
            if tiene_consumos > 0 or tiene_movimientos > 0:
                raise HTTPException(
                    status_code=400,
                    detail="No se puede cambiar la línea de negocio: el registro ya tiene consumos o movimientos asociados."
                )
        
        tallas_json = json.dumps([t.model_dump() for t in input.tallas])
        dist_json = json.dumps([d.model_dump() for d in input.distribucion_colores])
        fecha_ef = None
        if input.fecha_entrega_final:
            try:
                fecha_ef = date.fromisoformat(input.fecha_entrega_final)
            except Exception:
                fecha_ef = None
        await conn.execute(
            """UPDATE prod_registros SET n_corte=$1, modelo_id=$2, curva=$3, estado=$4, urgente=$5, hilo_especifico_id=$6, tallas=$7, distribucion_colores=$8, pt_item_id=$9, observaciones=$10, linea_negocio_id=$11, fecha_entrega_final=$13 WHERE id=$12""",
            input.n_corte, input.modelo_id, input.curva, input.estado, input.urgente, input.hilo_especifico_id, tallas_json, dist_json, input.pt_item_id, input.observaciones, input.linea_negocio_id, registro_id, fecha_ef
        )
        
        # Sincronizar prod_registro_tallas con las cantidades del JSON
        await conn.execute("DELETE FROM prod_registro_tallas WHERE registro_id = $1", registro_id)
        empresa_id = 7  # FK válido para cont_empresa
        for t in input.tallas:
            td = t.model_dump()
            cant = td.get('cantidad', 0)
            if cant > 0:
                await conn.execute(
                    """INSERT INTO prod_registro_tallas (id, registro_id, talla_id, cantidad_real, empresa_id, created_at, updated_at)
                       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                    str(uuid.uuid4()), registro_id, td['talla_id'], cant, empresa_id
                )
        
        datos_despues = {"estado": input.estado, "n_corte": input.n_corte,
                         "linea_negocio_id": input.linea_negocio_id, "urgente": input.urgente}
        await audit_log_safe(conn, get_usuario(current_user), "UPDATE", "produccion", "prod_registros", registro_id,
            datos_antes=datos_antes, datos_despues=datos_despues,
            linea_negocio_id=input.linea_negocio_id)
    await registrar_actividad(pool, current_user['id'], current_user.get('username', ''), "editar",
        tabla_afectada="registros", registro_id=registro_id, registro_nombre=input.n_corte,
        descripcion=f"Edito registro {input.n_corte}")
    return {**row_to_dict(result), **input.model_dump()}

@router.delete("/registros/{registro_id}")
async def delete_registro(registro_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_registros WHERE id = $1", registro_id)
        return {"message": "Registro eliminado"}

@router.get("/registros/{registro_id}/estados-disponibles")
async def get_estados_disponibles_registro(registro_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        # Obtener ruta del modelo
        modelo = await conn.fetchrow("SELECT ruta_produccion_id FROM prod_modelos WHERE id = $1", registro['modelo_id']) if registro['modelo_id'] else None
        ruta_id = modelo['ruta_produccion_id'] if modelo and modelo['ruta_produccion_id'] else None
        
        if ruta_id:
            ruta = await conn.fetchrow("SELECT etapas, nombre FROM prod_rutas_produccion WHERE id = $1", ruta_id)
            if ruta and ruta['etapas']:
                etapas = ruta['etapas'] if isinstance(ruta['etapas'], list) else json.loads(ruta['etapas'])
                etapas_sorted = sorted(etapas, key=lambda e: e.get('orden', 0))
                # Solo mostrar etapas con aparece_en_estado=true (default true para compatibilidad)
                estados = [e['nombre'] for e in etapas_sorted if e.get('nombre') and e.get('aparece_en_estado', True)]
                return {
                    "estados": estados,
                    "usa_ruta": True,
                    "ruta_nombre": ruta['nombre'],
                    "estado_actual": registro['estado'],
                    "etapas_completas": etapas_sorted
                }
        
        # Fallback: lista genérica si no hay ruta
        return {"estados": ESTADOS_PRODUCCION, "usa_ruta": False, "estado_actual": registro['estado']}


@router.get("/registros/{registro_id}/analisis-estado")
async def analisis_estado_registro(registro_id: str):
    """Analiza la coherencia entre estado del registro y sus movimientos."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        estado_actual = registro['estado']
        
        # Obtener ruta del modelo
        modelo = await conn.fetchrow("SELECT ruta_produccion_id FROM prod_modelos WHERE id = $1", registro['modelo_id']) if registro['modelo_id'] else None
        ruta_id = modelo['ruta_produccion_id'] if modelo and modelo['ruta_produccion_id'] else None
        
        if not ruta_id:
            return {
                "usa_ruta": False,
                "estado_actual": estado_actual,
                "estado_sugerido": None,
                "siguiente_estado_sugerido": None,
                "movimiento_faltante_por_estado": None,
                "inconsistencias": [],
                "bloqueos": []
            }
        
        ruta = await conn.fetchrow("SELECT etapas, nombre FROM prod_rutas_produccion WHERE id = $1", ruta_id)
        if not ruta or not ruta['etapas']:
            return {
                "usa_ruta": False,
                "estado_actual": estado_actual,
                "estado_sugerido": None,
                "siguiente_estado_sugerido": None,
                "movimiento_faltante_por_estado": None,
                "inconsistencias": [],
                "bloqueos": []
            }
        
        etapas = ruta['etapas'] if isinstance(ruta['etapas'], list) else json.loads(ruta['etapas'])
        etapas_sorted = sorted(etapas, key=lambda e: e.get('orden', 0))
        
        # Obtener movimientos del registro
        movimientos = await conn.fetch(
            "SELECT mp.*, sp.nombre as servicio_nombre FROM prod_movimientos_produccion mp LEFT JOIN prod_servicios_produccion sp ON mp.servicio_id = sp.id WHERE mp.registro_id = $1",
            registro_id
        )
        
        # Mapear movimientos por servicio_id
        movs_por_servicio = {}
        for m in movimientos:
            sid = m['servicio_id']
            if sid not in movs_por_servicio:
                movs_por_servicio[sid] = []
            movs_por_servicio[sid].append(dict(m))
        
        # Encontrar la etapa actual en la ruta
        etapa_actual_idx = None
        for i, et in enumerate(etapas_sorted):
            if et.get('nombre') == estado_actual:
                etapa_actual_idx = i
                break
        
        # Determinar etapas visibles (aparece_en_estado=true)
        etapas_visibles = [e for e in etapas_sorted if e.get('aparece_en_estado', True)]
        
        # --- Calcular estado sugerido basado en movimientos ---
        estado_sugerido = None
        # Recorrer etapas de atrás hacia adelante: la última etapa con movimiento iniciado es la sugerida
        for et in reversed(etapas_sorted):
            sid = et.get('servicio_id')
            if sid and sid in movs_por_servicio:
                movs = movs_por_servicio[sid]
                alguno_iniciado = any(m.get('fecha_inicio') for m in movs)
                if alguno_iniciado and et.get('aparece_en_estado', True):
                    estado_sugerido = et['nombre']
                    break
        
        # --- Calcular siguiente estado sugerido ---
        siguiente_estado_sugerido = None
        if etapa_actual_idx is not None and etapa_actual_idx < len(etapas_sorted) - 1:
            for et in etapas_sorted[etapa_actual_idx + 1:]:
                if et.get('aparece_en_estado', True):
                    siguiente_estado_sugerido = et['nombre']
                    break
        
        # --- Verificar si falta movimiento para el estado actual ---
        movimiento_faltante_por_estado = None
        if etapa_actual_idx is not None:
            etapa_act = etapas_sorted[etapa_actual_idx]
            sid = etapa_act.get('servicio_id')
            if sid and sid not in movs_por_servicio:
                srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", sid)
                movimiento_faltante_por_estado = {
                    "servicio_id": sid,
                    "servicio_nombre": srv['nombre'] if srv else etapa_act['nombre'],
                    "etapa_nombre": etapa_act['nombre']
                }
        
        # --- Inconsistencias ---
        inconsistencias = []
        
        # 1. Estado actual no está en la ruta
        nombres_ruta = [e['nombre'] for e in etapas_sorted]
        if estado_actual not in nombres_ruta:
            inconsistencias.append({
                "tipo": "estado_fuera_ruta",
                "mensaje": f"El estado '{estado_actual}' no existe en la ruta de producción.",
                "severidad": "error"
            })
        
        # 2. Estado avanzado pero etapa anterior tiene problemas
        if etapa_actual_idx is not None:
            for i, et in enumerate(etapas_sorted[:etapa_actual_idx]):
                sid = et.get('servicio_id')
                if not sid:
                    continue
                es_obligatoria = et.get('obligatorio', True)
                if sid in movs_por_servicio:
                    movs = movs_por_servicio[sid]
                    alguno_sin_cerrar = any(m.get('fecha_inicio') and not m.get('fecha_fin') for m in movs)
                    if alguno_sin_cerrar:
                        sev = "warning" if es_obligatoria else "info"
                        inconsistencias.append({
                            "tipo": "etapa_previa_abierta",
                            "mensaje": f"La etapa '{et['nombre']}' tiene movimiento(s) sin cerrar (sin fecha_fin).",
                            "severidad": sev
                        })
                elif es_obligatoria:
                    # Etapa obligatoria previa sin movimiento
                    inconsistencias.append({
                        "tipo": "etapa_obligatoria_sin_movimiento",
                        "mensaje": f"La etapa obligatoria '{et['nombre']}' no tiene movimiento registrado.",
                        "severidad": "warning"
                    })
        
        # 3. Estado sugiere que estamos en etapa X pero ya hay movimientos de etapas posteriores
        if etapa_actual_idx is not None:
            for et in etapas_sorted[etapa_actual_idx + 1:]:
                sid = et.get('servicio_id')
                if sid and sid in movs_por_servicio:
                    movs = movs_por_servicio[sid]
                    alguno_iniciado = any(m.get('fecha_inicio') for m in movs)
                    if alguno_iniciado and et.get('aparece_en_estado', True):
                        inconsistencias.append({
                            "tipo": "movimiento_adelantado",
                            "mensaje": f"Ya existe movimiento de '{et['nombre']}' pero el estado sigue en '{estado_actual}'.",
                            "severidad": "info"
                        })
        
        # --- Bloqueos (solo graves) ---
        bloqueos = []
        
        return {
            "usa_ruta": True,
            "ruta_nombre": ruta['nombre'],
            "estado_actual": estado_actual,
            "estado_sugerido": estado_sugerido,
            "siguiente_estado_sugerido": siguiente_estado_sugerido,
            "movimiento_faltante_por_estado": movimiento_faltante_por_estado,
            "inconsistencias": inconsistencias,
            "bloqueos": bloqueos,
            "etapas": etapas_sorted,
            "movimientos_resumen": [
                {
                    "servicio_id": m['servicio_id'],
                    "servicio_nombre": m['servicio_nombre'],
                    "fecha_inicio": str(m['fecha_inicio']) if m.get('fecha_inicio') else None,
                    "fecha_fin": str(m['fecha_fin']) if m.get('fecha_fin') else None
                } for m in movimientos
            ]
        }

@router.post("/registros/{registro_id}/validar-cambio-estado")
async def validar_cambio_estado(registro_id: str, body: dict):
    """Valida si un cambio de estado es permitido. Retorna bloqueos si los hay.
    Si body incluye forzar=true, se saltan las validaciones de movimientos."""
    nuevo_estado = body.get("nuevo_estado")
    forzar = body.get("forzar", False)
    if not nuevo_estado:
        raise HTTPException(status_code=400, detail="nuevo_estado requerido")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        # Bloqueo por paralización activa
        par_activa = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_paralizacion WHERE registro_id = $1 AND activa = TRUE", registro_id
        )
        if par_activa and par_activa > 0:
            return {
                "permitido": False,
                "bloqueos": [{"mensaje": "El registro esta PARALIZADO. Resuelve la incidencia que paraliza antes de cambiar de estado.", "servicio_id": None, "movimiento_id": None, "etapa": None}],
                "sugerencia_movimiento": None,
                "paralizado": True
            }
        
        modelo = await conn.fetchrow("SELECT ruta_produccion_id FROM prod_modelos WHERE id = $1", registro['modelo_id']) if registro['modelo_id'] else None
        ruta_id = modelo['ruta_produccion_id'] if modelo and modelo['ruta_produccion_id'] else None
        
        if not ruta_id:
            return {"permitido": True, "bloqueos": [], "sugerencia_movimiento": None}
        
        ruta = await conn.fetchrow("SELECT etapas FROM prod_rutas_produccion WHERE id = $1", ruta_id)
        if not ruta or not ruta['etapas']:
            return {"permitido": True, "bloqueos": [], "sugerencia_movimiento": None}
        
        etapas = ruta['etapas'] if isinstance(ruta['etapas'], list) else json.loads(ruta['etapas'])
        etapas_sorted = sorted(etapas, key=lambda e: e.get('orden', 0))
        nombres_ruta = [e['nombre'] for e in etapas_sorted]
        
        # Si se fuerza el cambio O el registro tiene skip_validacion_estado, permitir sin validaciones
        if forzar or registro.get('skip_validacion_estado'):
            return {"permitido": True, "bloqueos": [], "forzado": True, "sugerencia_movimiento": None}
        
        bloqueos = []
        
        # Bloqueo 1: estado fuera de ruta
        if nuevo_estado not in nombres_ruta:
            bloqueos.append({"mensaje": f"El estado '{nuevo_estado}' no pertenece a la ruta de producción asignada.", "servicio_id": None, "movimiento_id": None, "etapa": None})
        
        # Bloqueo 2: saltar etapa obligatoria previa sin movimiento completado
        nuevo_idx = None
        for i, e in enumerate(etapas_sorted):
            if e['nombre'] == nuevo_estado:
                nuevo_idx = i
                break
        
        movimientos = await conn.fetch(
            "SELECT id, servicio_id, fecha_inicio, fecha_fin FROM prod_movimientos_produccion WHERE registro_id = $1",
            registro_id
        )
        movs_por_servicio = {}
        for m in movimientos:
            sid = m['servicio_id']
            if sid not in movs_por_servicio:
                movs_por_servicio[sid] = []
            movs_por_servicio[sid].append(dict(m))
        
        if nuevo_idx is not None:
            # Si es un registro dividido, verificar movimientos del padre para etapas previas
            es_division = bool(registro.get('dividido_desde_registro_id'))
            movs_padre = {}
            if es_division and registro['dividido_desde_registro_id']:
                movs_padre_rows = await conn.fetch(
                    "SELECT servicio_id, fecha_inicio, fecha_fin FROM prod_movimientos_produccion WHERE registro_id = $1",
                    registro['dividido_desde_registro_id']
                )
                for m in movs_padre_rows:
                    sid = m['servicio_id']
                    if sid not in movs_padre:
                        movs_padre[sid] = []
                    movs_padre[sid].append(dict(m))
            
            for et in etapas_sorted[:nuevo_idx]:
                sid = et.get('servicio_id')
                if not sid:
                    continue
                es_obligatoria = et.get('obligatorio', True)
                
                tiene_mov_propio = sid in movs_por_servicio
                tiene_mov_padre = sid in movs_padre
                
                if es_obligatoria and not tiene_mov_propio and not tiene_mov_padre:
                    bloqueos.append({"mensaje": f"La etapa obligatoria '{et['nombre']}' no tiene movimiento registrado.", "servicio_id": sid, "movimiento_id": None, "etapa": et['nombre']})
                elif tiene_mov_propio:
                    alguno_abierto = any(m.get('fecha_inicio') and not m.get('fecha_fin') for m in movs_por_servicio[sid])
                    if alguno_abierto:
                        mov_abierto = next((m for m in movs_por_servicio[sid] if m.get('fecha_inicio') and not m.get('fecha_fin')), None)
                        mov_id = mov_abierto.get('id') if mov_abierto else None
                        if es_obligatoria:
                            bloqueos.append({"mensaje": f"La etapa obligatoria '{et['nombre']}' tiene movimiento iniciado sin cerrar.", "servicio_id": sid, "movimiento_id": mov_id, "etapa": et['nombre']})
                        else:
                            bloqueos.append({"mensaje": f"La etapa '{et['nombre']}' tiene movimiento activo sin cerrar.", "servicio_id": sid, "movimiento_id": mov_id, "etapa": et['nombre']})
        
        # Sugerencia: si el nuevo estado tiene servicio vinculado y no hay movimiento
        sugerencia_movimiento = None
        if nuevo_idx is not None and not bloqueos:
            etapa_nueva = etapas_sorted[nuevo_idx]
            sid = etapa_nueva.get('servicio_id')
            if sid and sid not in movs_por_servicio:
                srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", sid)
                sugerencia_movimiento = {
                    "servicio_id": sid,
                    "servicio_nombre": srv['nombre'] if srv else etapa_nueva['nombre'],
                    "etapa_nombre": etapa_nueva['nombre']
                }
        
        return {
            "permitido": len(bloqueos) == 0,
            "bloqueos": bloqueos,
            "sugerencia_movimiento": sugerencia_movimiento
        }



# ==================== FASE 2: ENDPOINTS TALLAS POR REGISTRO ====================

@router.get("/registros/{registro_id}/tallas")
async def get_registro_tallas(registro_id: str):
    """Obtiene las cantidades reales por talla de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        modelo_id = registro['modelo_id']
        
        # Obtener tallas del modelo (prod_modelo_tallas)
        modelo_tallas = await conn.fetch("""
            SELECT mt.talla_id, tc.nombre as talla_nombre, tc.orden
            FROM prod_modelo_tallas mt
            JOIN prod_tallas_catalogo tc ON mt.talla_id = tc.id
            WHERE mt.modelo_id = $1 AND mt.activo = true
            ORDER BY tc.orden, tc.nombre
        """, modelo_id)
        
        # Obtener cantidades reales ya registradas
        registro_tallas = await conn.fetch(
            "SELECT * FROM prod_registro_tallas WHERE registro_id = $1", registro_id
        )
        tallas_map = {rt['talla_id']: rt for rt in registro_tallas}
        
        result = []
        total_prendas = 0
        for mt in modelo_tallas:
            talla_id = mt['talla_id']
            rt = tallas_map.get(talla_id)
            cantidad_real = int(rt['cantidad_real']) if rt else 0
            total_prendas += cantidad_real
            result.append({
                "talla_id": talla_id,
                "talla_nombre": mt['talla_nombre'],
                "talla_orden": mt['orden'],
                "cantidad_real": cantidad_real,
                "id": rt['id'] if rt else None
            })
        
        return {
            "registro_id": registro_id,
            "modelo_id": modelo_id,
            "tallas": result,
            "total_prendas": total_prendas
        }


@router.post("/registros/{registro_id}/tallas")
async def upsert_registro_tallas(registro_id: str, input: RegistroTallaBulkUpdate):
    """Actualiza (upsert) las cantidades reales por talla de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        modelo_id = registro['modelo_id']
        
        # Validar que todas las tallas pertenecen al modelo
        modelo_tallas = await conn.fetch(
            "SELECT talla_id FROM prod_modelo_tallas WHERE modelo_id = $1 AND activo = true", modelo_id
        )
        valid_tallas = {mt['talla_id'] for mt in modelo_tallas}
        
        updated = []
        for t in input.tallas:
            if t.talla_id not in valid_tallas:
                raise HTTPException(status_code=400, detail=f"Talla {t.talla_id} no pertenece al modelo")
            
            # Upsert: buscar si existe, si no crear
            existing = await conn.fetchrow(
                "SELECT id FROM prod_registro_tallas WHERE registro_id = $1 AND talla_id = $2",
                registro_id, t.talla_id
            )
            
            if existing:
                await conn.execute(
                    "UPDATE prod_registro_tallas SET cantidad_real = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                    t.cantidad_real, existing['id']
                )
                updated.append({"id": existing['id'], "talla_id": t.talla_id, "cantidad_real": t.cantidad_real})
            else:
                new_id = str(uuid.uuid4())
                await conn.execute(
                    """INSERT INTO prod_registro_tallas (id, registro_id, talla_id, cantidad_real)
                       VALUES ($1, $2, $3, $4)""",
                    new_id, registro_id, t.talla_id, t.cantidad_real
                )
                updated.append({"id": new_id, "talla_id": t.talla_id, "cantidad_real": t.cantidad_real})
        
        return {"message": "Tallas actualizadas", "updated": updated}


@router.put("/registros/{registro_id}/tallas/{talla_id}")
async def update_single_registro_talla(registro_id: str, talla_id: str, input: RegistroTallaUpdate):
    """Actualiza una sola talla de un registro (para autosave)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        modelo_id = registro['modelo_id']
        
        # Validar talla pertenece al modelo
        modelo_talla = await conn.fetchrow(
            "SELECT talla_id FROM prod_modelo_tallas WHERE modelo_id = $1 AND talla_id = $2 AND activo = true",
            modelo_id, talla_id
        )
        if not modelo_talla:
            raise HTTPException(status_code=400, detail="Talla no pertenece al modelo")
        
        # Upsert
        existing = await conn.fetchrow(
            "SELECT id FROM prod_registro_tallas WHERE registro_id = $1 AND talla_id = $2",
            registro_id, talla_id
        )
        
        if existing:
            await conn.execute(
                "UPDATE prod_registro_tallas SET cantidad_real = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                input.cantidad_real, existing['id']
            )
            return {"id": existing['id'], "talla_id": talla_id, "cantidad_real": input.cantidad_real}
        else:
            new_id = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO prod_registro_tallas (id, registro_id, talla_id, cantidad_real)
                   VALUES ($1, $2, $3, $4)""",
                new_id, registro_id, talla_id, input.cantidad_real
            )
            return {"id": new_id, "talla_id": talla_id, "cantidad_real": input.cantidad_real}


# ==================== FASE 2: ENDPOINTS REQUERIMIENTO MP (EXPLOSIÓN BOM) ====================

def calcular_estado_requerimiento(cantidad_requerida: float, cantidad_reservada: float, cantidad_consumida: float) -> str:
    """Calcula el estado de una línea de requerimiento"""
    if cantidad_requerida <= 0:
        return 'PENDIENTE'
    if cantidad_consumida >= cantidad_requerida:
        return 'COMPLETO'
    if cantidad_reservada > 0 or cantidad_consumida > 0:
        return 'PARCIAL'
    return 'PENDIENTE'


@router.post("/registros/{registro_id}/generar-requerimiento")
async def generar_requerimiento_mp(registro_id: str, bom_id: str = Query(None)):
    """Genera el requerimiento de MP a partir de la explosión del BOM.
    Si bom_id se proporciona, usa ese BOM específico.
    Si no, auto-selecciona el mejor BOM (APROBADO > BORRADOR, versión más reciente)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Obtener registro
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        modelo_id = registro['modelo_id']
        
        # Obtener cantidades reales por talla
        tallas_registro = await conn.fetch(
            "SELECT talla_id, cantidad_real FROM prod_registro_tallas WHERE registro_id = $1",
            registro_id
        )
        tallas_map = {t['talla_id']: int(t['cantidad_real']) for t in tallas_registro}
        total_prendas = sum(tallas_map.values())
        
        if total_prendas <= 0:
            raise HTTPException(status_code=400, detail="Ingresa cantidades reales por talla antes de generar el requerimiento")
        
        # Determinar qué BOM usar
        if bom_id:
            bom_cab = await conn.fetchrow("SELECT * FROM prod_bom_cabecera WHERE id = $1", bom_id)
            if not bom_cab:
                raise HTTPException(status_code=404, detail="BOM no encontrado")
        else:
            # Auto-seleccionar mejor BOM: APROBADO primero, luego BORRADOR, versión más reciente
            bom_cab = await conn.fetchrow("""
                SELECT * FROM prod_bom_cabecera
                WHERE modelo_id = $1 AND estado != 'INACTIVO'
                ORDER BY CASE estado WHEN 'APROBADO' THEN 1 WHEN 'BORRADOR' THEN 2 ELSE 3 END, version DESC
                LIMIT 1
            """, modelo_id)
        
        # Obtener BOM activo del modelo, filtrando por bom_id si existe
        if bom_cab:
            bom_lineas = await conn.fetch("""
                SELECT bl.*, i.nombre as item_nombre, i.codigo as item_codigo, i.unidad_medida
                FROM prod_modelo_bom_linea bl
                JOIN prod_inventario i ON bl.inventario_id = i.id
                WHERE bl.bom_id = $1 AND bl.activo = true
                  AND COALESCE(bl.tipo_componente, 'TELA') IN ('TELA', 'AVIO', 'EMPAQUE', 'OTRO')
            """, bom_cab['id'])
        else:
            # Fallback: líneas sin bom_id asignado (datos legacy)
            bom_lineas = await conn.fetch("""
                SELECT bl.*, i.nombre as item_nombre, i.codigo as item_codigo, i.unidad_medida
                FROM prod_modelo_bom_linea bl
                JOIN prod_inventario i ON bl.inventario_id = i.id
                WHERE bl.modelo_id = $1 AND bl.activo = true AND bl.bom_id IS NULL
            """, modelo_id)
        
        if not bom_lineas:
            raise HTTPException(status_code=400, detail="El modelo no tiene BOM definido")
        
        created = 0
        updated = 0
        empresa_id = registro.get('empresa_id') or 7
        
        for bom in bom_lineas:
            item_id = bom['inventario_id']
            cantidad_base = float(bom['cantidad_base'])
            talla_id = bom['talla_id']  # Puede ser NULL
            
            # Calcular cantidad requerida
            if talla_id is None:
                # Línea general: aplica a todas las prendas
                cantidad_requerida = total_prendas * cantidad_base
            else:
                # Línea específica por talla
                qty_talla = tallas_map.get(talla_id, 0)
                cantidad_requerida = qty_talla * cantidad_base
            
            # Buscar si ya existe requerimiento para este (registro, item, talla)
            if talla_id:
                existing = await conn.fetchrow("""
                    SELECT * FROM prod_registro_requerimiento_mp
                    WHERE registro_id = $1 AND item_id = $2 AND talla_id = $3
                """, registro_id, item_id, talla_id)
            else:
                existing = await conn.fetchrow("""
                    SELECT * FROM prod_registro_requerimiento_mp
                    WHERE registro_id = $1 AND item_id = $2 AND talla_id IS NULL
                """, registro_id, item_id)
            
            if existing:
                # Actualizar solo cantidad_requerida, NO resetear reservada/consumida
                cantidad_reservada = float(existing['cantidad_reservada'])
                cantidad_consumida = float(existing['cantidad_consumida'])
                nuevo_estado = calcular_estado_requerimiento(cantidad_requerida, cantidad_reservada, cantidad_consumida)
                
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_requerida = $1, estado = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                """, cantidad_requerida, nuevo_estado, existing['id'])
                updated += 1
            else:
                # Crear nuevo requerimiento
                new_id = str(uuid.uuid4())
                estado = 'PENDIENTE' if cantidad_requerida > 0 else 'COMPLETO'
                await conn.execute("""
                    INSERT INTO prod_registro_requerimiento_mp
                    (id, registro_id, item_id, talla_id, cantidad_requerida, cantidad_reservada, cantidad_consumida, estado, empresa_id)
                    VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7)
                """, new_id, registro_id, item_id, talla_id, cantidad_requerida, estado, empresa_id)
                created += 1
        
        return {
            "message": "Requerimiento generado",
            "total_prendas": total_prendas,
            "lineas_creadas": created,
            "lineas_actualizadas": updated,
            "bom_usado": {
                "id": bom_cab['id'],
                "codigo": bom_cab['codigo'],
                "version": bom_cab['version'],
                "estado": bom_cab['estado'],
            } if bom_cab else None
        }


@router.get("/registros/{registro_id}/requerimiento")
async def get_requerimiento_mp(registro_id: str):
    """Obtiene el requerimiento de MP de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        rows = await conn.fetch("""
            SELECT r.*, i.codigo as item_codigo, i.nombre as item_nombre, 
                   i.unidad_medida as item_unidad, i.control_por_rollos,
                   tc.nombre as talla_nombre
            FROM prod_registro_requerimiento_mp r
            JOIN prod_inventario i ON r.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON r.talla_id = tc.id
            WHERE r.registro_id = $1
            ORDER BY i.nombre, tc.orden NULLS FIRST
        """, registro_id)
        
        result = []
        for r in rows:
            d = row_to_dict(r)
            cantidad_requerida = float(d['cantidad_requerida'])
            cantidad_reservada = float(d['cantidad_reservada'])
            cantidad_consumida = float(d['cantidad_consumida'])
            d['pendiente_reservar'] = max(0, cantidad_requerida - cantidad_reservada)
            d['pendiente_consumir'] = max(0, cantidad_reservada - cantidad_consumida)
            result.append(d)
        
        # Calcular totales
        total_requerido = sum(float(r['cantidad_requerida']) for r in result)
        total_reservado = sum(float(r['cantidad_reservada']) for r in result)
        total_consumido = sum(float(r['cantidad_consumida']) for r in result)
        
        return {
            "registro_id": registro_id,
            "lineas": result,
            "resumen": {
                "total_lineas": len(result),
                "total_requerido": total_requerido,
                "total_reservado": total_reservado,
                "total_consumido": total_consumido,
                "pendiente_reservar": max(0, total_requerido - total_reservado),
                "pendiente_consumir": max(0, total_reservado - total_consumido)
            }
        }


@router.get("/registros/{registro_id}/materiales")
async def get_materiales_consolidado(registro_id: str):
    """Vista consolidada: requerimiento + reservas + salidas de un registro en una sola respuesta."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        existe = await conn.fetchval("SELECT 1 FROM prod_registros WHERE id = $1", registro_id)
        if not existe:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        # 1) Requerimiento
        req_rows = await conn.fetch("""
            SELECT r.*, i.codigo as item_codigo, i.nombre as item_nombre,
                   i.unidad_medida as item_unidad, i.stock_actual, i.control_por_rollos,
                   tc.nombre as talla_nombre
            FROM prod_registro_requerimiento_mp r
            JOIN prod_inventario i ON r.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON r.talla_id = tc.id
            WHERE r.registro_id = $1
            ORDER BY i.nombre, tc.orden NULLS FIRST
        """, registro_id)
        
        # 2) Reservas activas con detalle de lineas (un solo query)
        reservas_raw = await conn.fetch("""
            SELECT r.id as reserva_id, r.estado, r.created_at as fecha,
                   rl.id as linea_id, rl.item_id, rl.talla_id, rl.cantidad_reservada, rl.cantidad_liberada,
                   i.codigo as item_codigo, i.nombre as item_nombre, i.unidad_medida as item_unidad,
                   tc.nombre as talla_nombre
            FROM prod_inventario_reservas r
            LEFT JOIN prod_inventario_reservas_linea rl ON rl.reserva_id = r.id
            LEFT JOIN prod_inventario i ON rl.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON rl.talla_id = tc.id
            WHERE r.registro_id = $1
            ORDER BY r.created_at DESC
        """, registro_id)
        
        reservas_map = {}
        for rr in reservas_raw:
            rid = rr['reserva_id']
            if rid not in reservas_map:
                reservas_map[rid] = {"id": rid, "estado": rr['estado'],
                    "fecha": str(rr['fecha']) if rr['fecha'] else None, "lineas": []}
            if rr['linea_id']:
                reservas_map[rid]["lineas"].append({
                    "id": rr['linea_id'], "item_id": rr['item_id'], "talla_id": rr['talla_id'],
                    "cantidad_reservada": float(rr['cantidad_reservada'] or 0),
                    "cantidad_liberada": float(rr['cantidad_liberada'] or 0),
                    "item_codigo": rr['item_codigo'], "item_nombre": rr['item_nombre'],
                    "item_unidad": rr['item_unidad'], "talla_nombre": rr['talla_nombre'],
                    "cantidad_activa": max(0, float(rr['cantidad_reservada'] or 0) - float(rr['cantidad_liberada'] or 0))
                })
        reservas_list = list(reservas_map.values())
        
        # 3) Salidas relacionadas
        salidas = await conn.fetch("""
            SELECT s.*, i.codigo as item_codigo, i.nombre as item_nombre, i.unidad_medida as item_unidad
            FROM prod_inventario_salidas s
            JOIN prod_inventario i ON s.item_id = i.id
            WHERE s.registro_id = $1
            ORDER BY s.fecha DESC
        """, registro_id)
        
        # 4) Disponibilidad por item - batch en vez de N queries individuales
        item_ids = list(set(r['item_id'] for r in req_rows))
        disponibilidad = {}
        if item_ids:
            disp_rows = await conn.fetch("""
                SELECT i.id as item_id, i.stock_actual,
                    COALESCE(i.stock_actual, 0) - COALESCE((
                        SELECT SUM(rl.cantidad_reservada - rl.cantidad_liberada)
                        FROM prod_inventario_reservas_linea rl
                        JOIN prod_inventario_reservas rv ON rl.reserva_id = rv.id
                        WHERE rl.item_id = i.id AND rv.estado = 'ACTIVA'
                    ), 0) as disponible
                FROM prod_inventario i
                WHERE i.id = ANY($1)
            """, item_ids)
            for dr in disp_rows:
                disponibilidad[dr['item_id']] = {
                    'stock_actual': float(dr['stock_actual'] or 0),
                    'disponible': float(dr['disponible'] or 0)
                }
        
        # Armar resultado
        lineas = []
        for r in req_rows:
            d = row_to_dict(r)
            req = float(d['cantidad_requerida'])
            res_qty = float(d['cantidad_reservada'])
            con = float(d['cantidad_consumida'])
            item_disp = disponibilidad.get(d['item_id'], {})
            d['pendiente'] = max(0, req - con)
            d['disponible'] = item_disp.get('disponible', 0)
            d['stock_actual'] = item_disp.get('stock_actual', float(d.get('stock_actual') or 0))
            # Para items con control_por_rollos, incluir rollos disponibles
            if d.get('control_por_rollos'):
                rollos = await conn.fetch("""
                    SELECT r.id, r.numero_rollo, r.metraje_disponible, r.tono, r.ancho,
                           ing.fecha as fecha_ingreso
                    FROM prod_inventario_rollos r
                    JOIN prod_inventario_ingresos ing ON r.ingreso_id = ing.id
                    WHERE r.item_id = $1 AND r.metraje_disponible > 0
                    ORDER BY ing.fecha ASC
                """, d['item_id'])
                d['rollos_disponibles'] = [dict(ro) for ro in rollos]
                for ro in d['rollos_disponibles']:
                    ro['metraje_disponible'] = float(ro['metraje_disponible'])
                    ro['fecha_ingreso'] = str(ro['fecha_ingreso']) if ro.get('fecha_ingreso') else None
                    ro['ancho'] = float(ro['ancho']) if ro.get('ancho') else None
            lineas.append(d)
        
        total_req = sum(float(l['cantidad_requerida']) for l in lineas)
        total_res = sum(float(l['cantidad_reservada']) for l in lineas)
        total_con = sum(float(l['cantidad_consumida']) for l in lineas)
        
        return {
            "registro_id": registro_id,
            "tiene_requerimiento": len(lineas) > 0,
            "lineas": lineas,
            "resumen": {
                "total_lineas": len(lineas),
                "total_requerido": total_req,
                "total_reservado": total_res,
                "total_consumido": total_con,
                "total_pendiente": max(0, total_req - total_con),
            },
            "reservas": reservas_list,
            "salidas": [row_to_dict(s) for s in salidas],
        }



# ==================== FASE 2: ENDPOINTS RESERVAS ====================

async def get_disponibilidad_item(conn, item_id: str) -> dict:
    """Calcula la disponibilidad real de un item (stock - reservas activas)"""
    item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
    if not item:
        return None
    
    stock_actual = float(item['stock_actual'])
    
    # Sumar reservas activas (cantidad_reservada - cantidad_liberada)
    total_reservado = await conn.fetchval("""
        SELECT COALESCE(SUM(rl.cantidad_reservada - rl.cantidad_liberada), 0)
        FROM prod_inventario_reservas_linea rl
        JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
        WHERE rl.item_id = $1 AND r.estado = 'ACTIVA'
    """, item_id)
    
    total_reservado = float(total_reservado or 0)
    disponible = max(0, stock_actual - total_reservado)
    
    return {
        "item_id": item_id,
        "item_codigo": item['codigo'],
        "item_nombre": item['nombre'],
        "stock_actual": stock_actual,
        "total_reservado": total_reservado,
        "disponible": disponible,
        "control_por_rollos": item['control_por_rollos']
    }


@router.get("/inventario/{item_id}/disponibilidad")
async def get_disponibilidad_inventario(item_id: str):
    """Obtiene la disponibilidad real de un item (stock - reservas activas)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await get_disponibilidad_item(conn, item_id)
        if not result:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        return result


@router.post("/registros/{registro_id}/reservas")
async def crear_reserva(registro_id: str, input: ReservaCreateInput):
    """Crea una reserva para un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Validar registro
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        # FASE 2C: Validar que OP no esté cerrada/anulada
        if registro['estado'] in ('CERRADA', 'ANULADA'):
            raise HTTPException(
                status_code=400, 
                detail=f"OP {registro['estado'].lower()}: no se puede crear reservas en una orden {registro['estado'].lower()}"
            )
        
        if not input.lineas:
            raise HTTPException(status_code=400, detail="Debe incluir al menos una línea de reserva")
        
        # Validar cada línea
        errores = []
        for idx, linea in enumerate(input.lineas):
            # Buscar requerimiento
            if linea.talla_id:
                req = await conn.fetchrow("""
                    SELECT * FROM prod_registro_requerimiento_mp
                    WHERE registro_id = $1 AND item_id = $2 AND talla_id = $3
                """, registro_id, linea.item_id, linea.talla_id)
            else:
                req = await conn.fetchrow("""
                    SELECT * FROM prod_registro_requerimiento_mp
                    WHERE registro_id = $1 AND item_id = $2 AND talla_id IS NULL
                """, registro_id, linea.item_id)
            
            if not req:
                errores.append(f"Línea {idx+1}: No existe requerimiento para item_id={linea.item_id}, talla_id={linea.talla_id}")
                continue
            
            # OPCIÓN 1: Ya NO limitamos al pendiente_reservar - se puede reservar más si hay stock disponible
            # Solo validamos disponibilidad global
            disp = await get_disponibilidad_item(conn, linea.item_id)
            if not disp:
                errores.append(f"Línea {idx+1}: Item no encontrado")
                continue
            
            if linea.cantidad > disp['disponible']:
                errores.append(f"Línea {idx+1}: Cantidad ({linea.cantidad}) excede disponible ({disp['disponible']})")
        
        if errores:
            raise HTTPException(status_code=400, detail={"errores": errores})
        
        # Crear cabecera de reserva
        reserva_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO prod_inventario_reservas (id, registro_id, estado, empresa_id)
            VALUES ($1, $2, 'ACTIVA', $3)
        """, reserva_id, registro_id, registro['empresa_id'])
        
        # Crear líneas y actualizar requerimiento
        lineas_creadas = []
        for linea in input.lineas:
            linea_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO prod_inventario_reservas_linea
                (id, reserva_id, item_id, talla_id, cantidad_reservada, cantidad_liberada, empresa_id)
                VALUES ($1, $2, $3, $4, $5, 0, $6)
            """, linea_id, reserva_id, linea.item_id, linea.talla_id, linea.cantidad, registro['empresa_id'])
            
            # Actualizar cantidad_reservada en requerimiento
            if linea.talla_id:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = cantidad_reservada + $1, updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, linea.cantidad, registro_id, linea.item_id, linea.talla_id)
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = cantidad_reservada + $1, updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, linea.cantidad, registro_id, linea.item_id)
            
            lineas_creadas.append({
                "id": linea_id,
                "item_id": linea.item_id,
                "talla_id": linea.talla_id,
                "cantidad_reservada": linea.cantidad
            })
        
        # Recalcular estados de requerimiento
        await conn.execute("""
            UPDATE prod_registro_requerimiento_mp
            SET estado = CASE
                WHEN cantidad_consumida >= cantidad_requerida THEN 'COMPLETO'
                WHEN cantidad_reservada > 0 OR cantidad_consumida > 0 THEN 'PARCIAL'
                ELSE 'PENDIENTE'
            END
            WHERE registro_id = $1
        """, registro_id)
        
        return {
            "message": "Reserva creada",
            "reserva_id": reserva_id,
            "lineas": lineas_creadas
        }


@router.get("/registros/{registro_id}/reservas")
async def get_reservas_registro(registro_id: str):
    """Lista las reservas de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        # Obtener cabeceras de reserva
        reservas = await conn.fetch("""
            SELECT * FROM prod_inventario_reservas
            WHERE registro_id = $1
            ORDER BY fecha DESC
        """, registro_id)
        
        result = []
        for res in reservas:
            d = row_to_dict(res)
            
            # Obtener líneas de la reserva
            lineas = await conn.fetch("""
                SELECT rl.*, i.codigo as item_codigo, i.nombre as item_nombre,
                       i.unidad_medida as item_unidad, tc.nombre as talla_nombre
                FROM prod_inventario_reservas_linea rl
                JOIN prod_inventario i ON rl.item_id = i.id
                LEFT JOIN prod_tallas_catalogo tc ON rl.talla_id = tc.id
                WHERE rl.reserva_id = $1
            """, res['id'])
            
            d['lineas'] = []
            for lin in lineas:
                ld = row_to_dict(lin)
                ld['cantidad_activa'] = float(ld['cantidad_reservada']) - float(ld['cantidad_liberada'])
                d['lineas'].append(ld)
            
            result.append(d)
        
        return {"registro_id": registro_id, "reservas": result}


@router.delete("/reservas/{reserva_id}")
async def anular_reserva(reserva_id: str):
    """Anula una reserva completa, liberando todo el stock reservado."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        reserva = await conn.fetchrow("SELECT * FROM prod_inventario_reservas WHERE id = $1", reserva_id)
        if not reserva:
            raise HTTPException(status_code=404, detail="Reserva no encontrada")
        if reserva['estado'] != 'ACTIVA':
            raise HTTPException(status_code=400, detail=f"La reserva ya está {reserva['estado']}")
        
        registro_id = reserva['registro_id']
        
        # Obtener líneas activas de la reserva
        lineas = await conn.fetch("""
            SELECT * FROM prod_inventario_reservas_linea WHERE reserva_id = $1
        """, reserva_id)
        
        # Liberar cada línea y actualizar requerimiento
        for lin in lineas:
            cantidad_activa = float(lin['cantidad_reservada']) - float(lin['cantidad_liberada'])
            if cantidad_activa > 0:
                # Marcar como liberada
                await conn.execute("""
                    UPDATE prod_inventario_reservas_linea
                    SET cantidad_liberada = cantidad_reservada, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                """, lin['id'])
                
                # Devolver al requerimiento
                if lin['talla_id']:
                    await conn.execute("""
                        UPDATE prod_registro_requerimiento_mp
                        SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                        WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                    """, cantidad_activa, registro_id, lin['item_id'], lin['talla_id'])
                else:
                    await conn.execute("""
                        UPDATE prod_registro_requerimiento_mp
                        SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                        WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                    """, cantidad_activa, registro_id, lin['item_id'])
        
        # Marcar reserva como anulada
        await conn.execute("""
            UPDATE prod_inventario_reservas SET estado = 'ANULADA', updated_at = CURRENT_TIMESTAMP WHERE id = $1
        """, reserva_id)
        
        return {"message": "Reserva anulada", "reserva_id": reserva_id, "lineas_liberadas": len(lineas)}



@router.post("/registros/{registro_id}/liberar-reservas")
async def liberar_reservas(registro_id: str, input: LiberarReservaInput):
    """Libera parcial o totalmente reservas de un registro"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        registro = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        # FASE 2C: Validar que OP no esté cerrada/anulada (la liberación manual es bloqueada, la automática usa otra función)
        if registro['estado'] in ('CERRADA', 'ANULADA'):
            raise HTTPException(
                status_code=400, 
                detail=f"OP {registro['estado'].lower()}: las reservas ya fueron liberadas automáticamente al cerrar/anular"
            )
        
        if not input.lineas:
            raise HTTPException(status_code=400, detail="Debe incluir al menos una línea a liberar")
        
        liberadas = []
        for linea in input.lineas:
            # Buscar líneas de reserva activas para este item/talla
            if linea.talla_id:
                reserva_lineas = await conn.fetch("""
                    SELECT rl.* FROM prod_inventario_reservas_linea rl
                    JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
                    WHERE r.registro_id = $1 AND r.estado = 'ACTIVA'
                      AND rl.item_id = $2 AND rl.talla_id = $3
                      AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
                """, registro_id, linea.item_id, linea.talla_id)
            else:
                reserva_lineas = await conn.fetch("""
                    SELECT rl.* FROM prod_inventario_reservas_linea rl
                    JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
                    WHERE r.registro_id = $1 AND r.estado = 'ACTIVA'
                      AND rl.item_id = $2 AND rl.talla_id IS NULL
                      AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
                """, registro_id, linea.item_id)
            
            cantidad_a_liberar = linea.cantidad
            for rl in reserva_lineas:
                if cantidad_a_liberar <= 0:
                    break
                
                activa = float(rl['cantidad_reservada']) - float(rl['cantidad_liberada'])
                liberar = min(activa, cantidad_a_liberar)
                
                await conn.execute("""
                    UPDATE prod_inventario_reservas_linea
                    SET cantidad_liberada = cantidad_liberada + $1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                """, liberar, rl['id'])
                
                cantidad_a_liberar -= liberar
            
            # Actualizar requerimiento: bajar cantidad_reservada
            if linea.talla_id:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, linea.cantidad, registro_id, linea.item_id, linea.talla_id)
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, linea.cantidad, registro_id, linea.item_id)
            
            liberadas.append({
                "item_id": linea.item_id,
                "talla_id": linea.talla_id,
                "cantidad_liberada": linea.cantidad
            })
        
        # Recalcular estados
        await conn.execute("""
            UPDATE prod_registro_requerimiento_mp
            SET estado = CASE
                WHEN cantidad_consumida >= cantidad_requerida THEN 'COMPLETO'
                WHEN cantidad_reservada > 0 OR cantidad_consumida > 0 THEN 'PARCIAL'
                ELSE 'PENDIENTE'
            END
            WHERE registro_id = $1
        """, registro_id)
        
        return {"message": "Reservas liberadas", "liberadas": liberadas}


# ==================== FASE 2C: CIERRE/ANULACIÓN OP ====================

async def liberar_reservas_pendientes_auto(conn, registro_id: str):
    """
    Libera automáticamente todas las reservas pendientes de un registro.
    Usado al cerrar o anular una OP.
    Retorna resumen de liberaciones.
    """
    items_liberados = []
    total_liberado = 0.0
    
    # Obtener todas las reservas activas del registro
    reservas = await conn.fetch("""
        SELECT id FROM prod_inventario_reservas
        WHERE registro_id = $1 AND estado = 'ACTIVA'
    """, registro_id)
    
    for reserva in reservas:
        # Obtener líneas con cantidad pendiente
        lineas = await conn.fetch("""
            SELECT rl.*, i.nombre as item_nombre
            FROM prod_inventario_reservas_linea rl
            JOIN prod_inventario i ON rl.item_id = i.id
            WHERE rl.reserva_id = $1 
              AND (rl.cantidad_reservada - rl.cantidad_liberada) > 0
        """, reserva['id'])
        
        for linea in lineas:
            liberable = float(linea['cantidad_reservada']) - float(linea['cantidad_liberada'])
            if liberable <= 0:
                continue
            
            # Actualizar línea de reserva: marcar como liberada
            await conn.execute("""
                UPDATE prod_inventario_reservas_linea
                SET cantidad_liberada = cantidad_reservada, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            """, linea['id'])
            
            # Actualizar requerimiento: bajar cantidad_reservada
            if linea['talla_id']:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id = $4
                """, liberable, registro_id, linea['item_id'], linea['talla_id'])
            else:
                await conn.execute("""
                    UPDATE prod_registro_requerimiento_mp
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1), updated_at = CURRENT_TIMESTAMP
                    WHERE registro_id = $2 AND item_id = $3 AND talla_id IS NULL
                """, liberable, registro_id, linea['item_id'])
            
            items_liberados.append({
                "item_id": linea['item_id'],
                "item_nombre": linea['item_nombre'],
                "talla_id": linea['talla_id'],
                "cantidad": liberable
            })
            total_liberado += liberable
        
        # Marcar cabecera de reserva como CERRADA
        await conn.execute("""
            UPDATE prod_inventario_reservas
            SET estado = 'CERRADA', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, reserva['id'])
    
    # Recalcular estados de requerimiento
    await conn.execute("""
        UPDATE prod_registro_requerimiento_mp
        SET estado = CASE
            WHEN cantidad_consumida >= cantidad_requerida AND cantidad_requerida > 0 THEN 'COMPLETO'
            WHEN cantidad_reservada > 0 OR cantidad_consumida > 0 THEN 'PARCIAL'
            ELSE 'PENDIENTE'
        END
        WHERE registro_id = $1
    """, registro_id)
    
    return {
        "total_liberado": total_liberado,
        "items_liberados": items_liberados
    }


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
        
        import uuid
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
