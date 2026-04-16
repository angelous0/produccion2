"""Router for production registros: CRUD, estados, tallas."""
import json
import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from db import get_pool
from auth_utils import get_current_user, require_permiso as require_permission
from models import (
    RegistroCreate, Registro, RegistroTallaUpdate, RegistroTallaBulkUpdate,
    ESTADOS_PRODUCCION,
)
from helpers import row_to_dict, parse_jsonb, registrar_actividad, validar_registro_activo
from routes.auditoria import audit_log_safe, get_usuario
from typing import Optional, List
from pydantic import BaseModel

router = APIRouter(prefix="/api")

@router.get("/estados")
async def get_estados():
    return {"estados": ESTADOS_PRODUCCION}

@router.get("/registros/filtros-modelo")
async def get_filtros_modelo(
    marca_id: str = "",
    tipo_id: str = "",
    entalle_id: str = "",
    tela_id: str = "",
):
    """Devuelve opciones disponibles para cada filtro, en cascada.
    Si seleccionas marca, solo muestra tipos/entalles/telas que existen en modelos con esa marca, etc."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Construir WHERE según selecciones actuales
        conditions = []
        params = []
        idx = 1

        marcas_list = [x.strip() for x in marca_id.split(",") if x.strip()] if marca_id else []
        tipos_list = [x.strip() for x in tipo_id.split(",") if x.strip()] if tipo_id else []
        entalles_list = [x.strip() for x in entalle_id.split(",") if x.strip()] if entalle_id else []
        telas_list = [x.strip() for x in tela_id.split(",") if x.strip()] if tela_id else []

        def add_filter(field, values):
            nonlocal idx
            if values:
                ph = ", ".join(f"${idx + i}" for i in range(len(values)))
                conditions.append(f"{field} IN ({ph})")
                params.extend(values)
                idx += len(values)

        # Para cada categoría, calcular opciones disponibles filtrando por las OTRAS selecciones
        # Marcas: filtrar por tipo + entalle + tela
        conds_marca = []
        p_marca = []
        ix = 1
        if tipos_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(tipos_list)))
            conds_marca.append(f"m.tipo_id IN ({ph})")
            p_marca.extend(tipos_list); ix += len(tipos_list)
        if entalles_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(entalles_list)))
            conds_marca.append(f"m.entalle_id IN ({ph})")
            p_marca.extend(entalles_list); ix += len(entalles_list)
        if telas_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(telas_list)))
            conds_marca.append(f"m.tela_id IN ({ph})")
            p_marca.extend(telas_list); ix += len(telas_list)
        w_marca = " AND ".join(conds_marca) if conds_marca else "TRUE"
        marcas_rows = await conn.fetch(f"""
            SELECT DISTINCT ma.id, ma.nombre FROM prod_modelos m
            JOIN prod_marcas ma ON m.marca_id = ma.id
            WHERE {w_marca} ORDER BY ma.nombre
        """, *p_marca)

        # Tipos: filtrar por marca + entalle + tela
        conds_tipo = []
        p_tipo = []
        ix = 1
        if marcas_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(marcas_list)))
            conds_tipo.append(f"m.marca_id IN ({ph})")
            p_tipo.extend(marcas_list); ix += len(marcas_list)
        if entalles_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(entalles_list)))
            conds_tipo.append(f"m.entalle_id IN ({ph})")
            p_tipo.extend(entalles_list); ix += len(entalles_list)
        if telas_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(telas_list)))
            conds_tipo.append(f"m.tela_id IN ({ph})")
            p_tipo.extend(telas_list); ix += len(telas_list)
        w_tipo = " AND ".join(conds_tipo) if conds_tipo else "TRUE"
        tipos_rows = await conn.fetch(f"""
            SELECT DISTINCT t.id, t.nombre FROM prod_modelos m
            JOIN prod_tipos t ON m.tipo_id = t.id
            WHERE {w_tipo} ORDER BY t.nombre
        """, *p_tipo)

        # Entalles: filtrar por marca + tipo + tela
        conds_ent = []
        p_ent = []
        ix = 1
        if marcas_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(marcas_list)))
            conds_ent.append(f"m.marca_id IN ({ph})")
            p_ent.extend(marcas_list); ix += len(marcas_list)
        if tipos_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(tipos_list)))
            conds_ent.append(f"m.tipo_id IN ({ph})")
            p_ent.extend(tipos_list); ix += len(tipos_list)
        if telas_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(telas_list)))
            conds_ent.append(f"m.tela_id IN ({ph})")
            p_ent.extend(telas_list); ix += len(telas_list)
        w_ent = " AND ".join(conds_ent) if conds_ent else "TRUE"
        entalles_rows = await conn.fetch(f"""
            SELECT DISTINCT e.id, e.nombre FROM prod_modelos m
            JOIN prod_entalles e ON m.entalle_id = e.id
            WHERE {w_ent} ORDER BY e.nombre
        """, *p_ent)

        # Telas: filtrar por marca + tipo + entalle
        conds_tela = []
        p_tela = []
        ix = 1
        if marcas_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(marcas_list)))
            conds_tela.append(f"m.marca_id IN ({ph})")
            p_tela.extend(marcas_list); ix += len(marcas_list)
        if tipos_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(tipos_list)))
            conds_tela.append(f"m.tipo_id IN ({ph})")
            p_tela.extend(tipos_list); ix += len(tipos_list)
        if entalles_list:
            ph = ", ".join(f"${ix + i}" for i in range(len(entalles_list)))
            conds_tela.append(f"m.entalle_id IN ({ph})")
            p_tela.extend(entalles_list); ix += len(entalles_list)
        w_tela = " AND ".join(conds_tela) if conds_tela else "TRUE"
        telas_rows = await conn.fetch(f"""
            SELECT DISTINCT te.id, te.nombre FROM prod_modelos m
            JOIN prod_telas te ON m.tela_id = te.id
            WHERE {w_tela} ORDER BY te.nombre
        """, *p_tela)

        return {
            "marcas": [{"id": str(r['id']), "nombre": r['nombre']} for r in marcas_rows],
            "tipos": [{"id": str(r['id']), "nombre": r['nombre']} for r in tipos_rows],
            "entalles": [{"id": str(r['id']), "nombre": r['nombre']} for r in entalles_rows],
            "telas": [{"id": str(r['id']), "nombre": r['nombre']} for r in telas_rows],
        }

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
    marca_id: str = "",
    tipo_id: str = "",
    entalle_id: str = "",
    tela_id: str = "",
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

        if marca_id:
            ids = [x.strip() for x in marca_id.split(",") if x.strip()]
            if ids:
                placeholders = ", ".join(f"${param_idx + i}" for i in range(len(ids)))
                conditions.append(f"m.marca_id IN ({placeholders})")
                params.extend(ids)
                param_idx += len(ids)

        if tipo_id:
            ids = [x.strip() for x in tipo_id.split(",") if x.strip()]
            if ids:
                placeholders = ", ".join(f"${param_idx + i}" for i in range(len(ids)))
                conditions.append(f"m.tipo_id IN ({placeholders})")
                params.extend(ids)
                param_idx += len(ids)

        if entalle_id:
            ids = [x.strip() for x in entalle_id.split(",") if x.strip()]
            if ids:
                placeholders = ", ".join(f"${param_idx + i}" for i in range(len(ids)))
                conditions.append(f"m.entalle_id IN ({placeholders})")
                params.extend(ids)
                param_idx += len(ids)

        if tela_id:
            ids = [x.strip() for x in tela_id.split(",") if x.strip()]
            if ids:
                placeholders = ", ".join(f"${param_idx + i}" for i in range(len(ids)))
                conditions.append(f"m.tela_id IN ({placeholders})")
                params.extend(ids)
                param_idx += len(ids)

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
                GREATEST(
                    r.fecha_creacion,
                    COALESCE((SELECT MAX(mp.created_at) FROM prod_movimientos_produccion mp WHERE mp.registro_id = r.id), r.fecha_creacion),
                    COALESCE((SELECT MAX(i.created_at) FROM prod_incidencia i WHERE i.registro_id = r.id), r.fecha_creacion)
                ) as ultima_actividad,
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
            if d.get('fecha_inicio_real'):
                d['fecha_inicio_real'] = str(d['fecha_inicio_real'])
            # Paralización activa
            par_json = d.pop('paralizacion_json', None)
            if par_json and isinstance(par_json, str):
                import json as json_mod
                par_json = json_mod.loads(par_json)
            d['paralizacion_activa'] = par_json
            # Modelo manual: COALESCE nombres
            mm = parse_jsonb(d.get('modelo_manual')) if d.get('modelo_manual') else None
            d['modelo_manual'] = mm
            if mm:
                d['es_modelo_manual'] = True
                if not d.get('modelo_nombre'):
                    d['modelo_nombre'] = mm.get('nombre_modelo') or 'Manual'
                if not d.get('marca_nombre'):
                    d['marca_nombre'] = mm.get('marca_texto') or d.get('marca_nombre')
                if not d.get('tipo_nombre'):
                    d['tipo_nombre'] = mm.get('tipo_texto') or d.get('tipo_nombre')
                if not d.get('tela_nombre'):
                    d['tela_nombre'] = mm.get('tela_texto') or d.get('tela_nombre')
                if not d.get('entalle_nombre'):
                    d['entalle_nombre'] = mm.get('entalle_texto') or d.get('entalle_nombre')
            else:
                d['es_modelo_manual'] = False
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
        if d.get('fecha_inicio_real'):
            d['fecha_inicio_real'] = str(d['fecha_inicio_real'])
        d['modelo_manual'] = parse_jsonb(d.get('modelo_manual')) if d.get('modelo_manual') else None
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
        fecha_ef = None
        if registro.fecha_entrega_final:
            try:
                fecha_ef = date.fromisoformat(registro.fecha_entrega_final)
            except Exception:
                fecha_ef = None
        fecha_ir = None
        if registro.fecha_inicio_real:
            try:
                fecha_ir = date.fromisoformat(registro.fecha_inicio_real)
            except Exception:
                fecha_ir = None
        if not fecha_ir:
            fecha_ir = registro.fecha_creacion.date() if hasattr(registro.fecha_creacion, 'date') else registro.fecha_creacion
        modelo_manual_json = json.dumps(registro.modelo_manual.model_dump()) if registro.modelo_manual else None
        # Verificar modo migración → si activo, no descontar inventario
        modo_mig_row = await conn.fetchval(
            "SELECT valor FROM prod_configuracion WHERE clave = 'modo_migracion'"
        )
        descuento_inventario = not (modo_mig_row == 'true')
        await conn.execute(
            """INSERT INTO prod_registros (id, n_corte, modelo_id, curva, estado, urgente, hilo_especifico_id, tallas, distribucion_colores, fecha_creacion, pt_item_id, empresa_id, observaciones, linea_negocio_id, fecha_entrega_final, fecha_inicio_real, modelo_manual, descuento_inventario)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)""",
            registro.id, registro.n_corte, registro.modelo_id, registro.curva, registro.estado, registro.urgente,
            registro.hilo_especifico_id, tallas_json, dist_json, registro.fecha_creacion.replace(tzinfo=None),
            registro.pt_item_id, registro.empresa_id, registro.observaciones, registro.linea_negocio_id, fecha_ef, fecha_ir,
            modelo_manual_json, descuento_inventario
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
async def toggle_skip_validacion(registro_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """Activa o desactiva la validación de estados para un registro. Registra en auditoría."""
    skip = body.get("skip_validacion_estado", False)
    motivo = body.get("motivo", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE prod_registros SET skip_validacion_estado = $1 WHERE id = $2",
            skip, registro_id
        )
        usuario = get_usuario(current_user)
        accion = "ACTIVAR_SKIP_VALIDACION" if skip else "DESACTIVAR_SKIP_VALIDACION"
        await audit_log_safe(conn, usuario, accion, "produccion", "prod_registros", registro_id,
            datos_despues={"skip_validacion_estado": skip, "motivo": motivo or "Sin motivo especificado"})
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
        fecha_ir = None
        if input.fecha_inicio_real:
            try:
                fecha_ir = date.fromisoformat(input.fecha_inicio_real)
            except Exception:
                fecha_ir = None
        modelo_manual_json = json.dumps(input.modelo_manual.model_dump()) if input.modelo_manual else None
        await conn.execute(
            """UPDATE prod_registros SET n_corte=$1, modelo_id=$2, curva=$3, estado=$4, urgente=$5, hilo_especifico_id=$6, tallas=$7, distribucion_colores=$8, pt_item_id=$9, observaciones=$10, linea_negocio_id=$11, fecha_entrega_final=$13, fecha_inicio_real=$14, modelo_manual=$15 WHERE id=$12""",
            input.n_corte, input.modelo_id, input.curva, input.estado, input.urgente, input.hilo_especifico_id, tallas_json, dist_json, input.pt_item_id, input.observaciones, input.linea_negocio_id, registro_id, fecha_ef, fecha_ir, modelo_manual_json
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
async def delete_registro(registro_id: str, _u=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Eliminar datos relacionados en cascada
        await conn.execute("DELETE FROM prod_conversacion WHERE registro_id = $1", registro_id)
        await conn.execute("DELETE FROM prod_incidencia WHERE registro_id = $1", registro_id)
        await conn.execute("DELETE FROM prod_registro_cierre WHERE registro_id = $1", registro_id)
        await conn.execute("DELETE FROM prod_movimientos_produccion WHERE registro_id = $1", registro_id)
        await conn.execute("DELETE FROM prod_inventario_salidas WHERE registro_id = $1", registro_id)
        # Reservas: primero líneas, luego cabeceras
        reserva_ids = await conn.fetch(
            "SELECT id FROM prod_inventario_reservas WHERE registro_id = $1", registro_id)
        for r in reserva_ids:
            await conn.execute("DELETE FROM prod_inventario_reservas_linea WHERE reserva_id = $1", r["id"])
        await conn.execute("DELETE FROM prod_inventario_reservas WHERE registro_id = $1", registro_id)
        await conn.execute("DELETE FROM prod_registro_requerimiento_mp WHERE registro_id = $1", registro_id)
        await conn.execute("DELETE FROM prod_registro_tallas WHERE registro_id = $1", registro_id)
        await conn.execute("DELETE FROM prod_registros WHERE id = $1", registro_id)
        return {"message": "Registro y datos relacionados eliminados"}

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
async def validar_cambio_estado(registro_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """Valida si un cambio de estado es permitido. Retorna bloqueos si los hay.
    Si body incluye forzar=true, se saltan las validaciones de movimientos.
    Si es retroceso, requiere motivo_retroceso.
    Si hay discrepancia de cantidad, retorna advertencia."""
    nuevo_estado = body.get("nuevo_estado")
    forzar = body.get("forzar", False)
    motivo_forzar = body.get("motivo_forzar", "")
    motivo_retroceso = body.get("motivo_retroceso", "")
    confirmar_retroceso = body.get("confirmar_retroceso", False)
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

        # Determinar índices actual y nuevo
        estado_actual = registro.get('estado', '')
        actual_idx = None
        nuevo_idx = None
        for i, e in enumerate(etapas_sorted):
            if e['nombre'] == estado_actual:
                actual_idx = i
            if e['nombre'] == nuevo_estado:
                nuevo_idx = i

        es_retroceso = (actual_idx is not None and nuevo_idx is not None and nuevo_idx < actual_idx)

        # Si se fuerza el cambio O el registro tiene skip_validacion_estado, permitir sin validaciones
        if forzar or registro.get('skip_validacion_estado'):
            # Registrar en auditoría cuando se fuerza
            usuario = get_usuario(current_user)
            detalle = motivo_forzar or motivo_retroceso or "Sin motivo especificado"
            tipo_accion = "FORZAR_RETROCESO_ESTADO" if es_retroceso else "FORZAR_CAMBIO_ESTADO"
            await audit_log_safe(conn, usuario, tipo_accion, "produccion", "prod_registros", registro_id,
                datos_antes={"estado": estado_actual},
                datos_despues={"estado": nuevo_estado, "motivo": detalle, "forzado": True})
            return {"permitido": True, "bloqueos": [], "forzado": True, "sugerencia_movimiento": None}

        bloqueos = []
        advertencias = []

        # Detección de retroceso: requiere confirmación y motivo
        if es_retroceso and not confirmar_retroceso:
            return {
                "permitido": False,
                "es_retroceso": True,
                "estado_actual": estado_actual,
                "nuevo_estado": nuevo_estado,
                "bloqueos": [],
                "advertencias": [f"Estás retrocediendo de '{estado_actual}' a '{nuevo_estado}'. Esto no es lo habitual en el flujo de producción."],
                "requiere_motivo": True,
                "sugerencia_movimiento": None
            }

        # Si es retroceso confirmado, registrar en auditoría
        if es_retroceso and confirmar_retroceso:
            if not motivo_retroceso.strip():
                return {
                    "permitido": False,
                    "es_retroceso": True,
                    "bloqueos": [{"mensaje": "Debes indicar un motivo para retroceder de estado.", "servicio_id": None, "movimiento_id": None, "etapa": None}],
                    "sugerencia_movimiento": None
                }
            usuario = get_usuario(current_user)
            await audit_log_safe(conn, usuario, "RETROCESO_ESTADO", "produccion", "prod_registros", registro_id,
                datos_antes={"estado": estado_actual},
                datos_despues={"estado": nuevo_estado, "motivo_retroceso": motivo_retroceso})
            return {"permitido": True, "bloqueos": [], "sugerencia_movimiento": None, "retroceso_confirmado": True}

        # Bloqueo 1: estado fuera de ruta
        if nuevo_estado not in nombres_ruta:
            bloqueos.append({"mensaje": f"El estado '{nuevo_estado}' no pertenece a la ruta de producción asignada.", "servicio_id": None, "movimiento_id": None, "etapa": None})

        # Bloqueo 2: saltar etapa obligatoria previa sin movimiento completado
        movimientos = await conn.fetch(
            "SELECT id, servicio_id, fecha_inicio, fecha_fin, cantidad_enviada, cantidad_recibida FROM prod_movimientos_produccion WHERE registro_id = $1",
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

        # Validación de cantidad: comparar prendas originales vs último movimiento recibido
        if not bloqueos and nuevo_idx is not None and actual_idx is not None and nuevo_idx > actual_idx:
            # Obtener cantidad total de prendas del registro
            total_prendas = await conn.fetchval(
                "SELECT COALESCE(SUM(cantidad_real), 0) FROM prod_registro_tallas WHERE registro_id = $1", registro_id
            )
            # Buscar el último movimiento completado (con fecha_fin) y su cantidad recibida
            ultimo_mov = await conn.fetchrow(
                """SELECT cantidad_enviada, cantidad_recibida, servicio_id
                   FROM prod_movimientos_produccion
                   WHERE registro_id = $1 AND fecha_fin IS NOT NULL
                   ORDER BY fecha_fin DESC LIMIT 1""",
                registro_id
            )
            if ultimo_mov and total_prendas > 0:
                cant_recibida = ultimo_mov['cantidad_recibida'] or ultimo_mov['cantidad_enviada'] or 0
                if cant_recibida > 0 and cant_recibida < total_prendas:
                    diferencia = total_prendas - cant_recibida
                    advertencias.append(
                        f"El último movimiento completado registró {cant_recibida} prendas recibidas de {total_prendas} totales. "
                        f"Hay una diferencia de {diferencia} prendas sin justificar (posible merma)."
                    )

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
            "advertencias": advertencias,
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
async def upsert_registro_tallas(registro_id: str, input: RegistroTallaBulkUpdate, _u=Depends(get_current_user)):
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
async def update_single_registro_talla(registro_id: str, talla_id: str, input: RegistroTallaUpdate, _u=Depends(get_current_user)):
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


