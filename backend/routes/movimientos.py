"""Router for production movements, mermas and guias de remision."""
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from db import get_pool
from auth_utils import get_current_user
from models import MovimientoCreate, Movimiento, MermaCreate, GuiaRemisionCreate
from helpers import row_to_dict, parse_jsonb, registrar_actividad
from routes.auditoria import audit_log_safe, get_usuario
from typing import Optional, List
from pydantic import BaseModel

router = APIRouter(prefix="/api")

@router.get("/movimientos-produccion")
async def get_movimientos(
    registro_id: str = None,
    servicio_id: str = None,
    persona_id: str = None,
    fecha_desde: str = None,
    fecha_hasta: str = None,
    estado: str = None,
    search: str = "",
    limit: int = 50,
    offset: int = 0,
    all: str = "",
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = []
        params = []
        param_idx = 1

        if registro_id:
            conditions.append(f"mp.registro_id = ${param_idx}")
            params.append(registro_id)
            param_idx += 1
        if servicio_id:
            conditions.append(f"mp.servicio_id = ${param_idx}")
            params.append(servicio_id)
            param_idx += 1
        if persona_id:
            conditions.append(f"mp.persona_id = ${param_idx}")
            params.append(persona_id)
            param_idx += 1
        if fecha_desde:
            conditions.append(f"mp.fecha_inicio >= ${param_idx}::date")
            params.append(fecha_desde)
            param_idx += 1
        if fecha_hasta:
            conditions.append(f"mp.fecha_inicio <= ${param_idx}::date")
            params.append(fecha_hasta)
            param_idx += 1
        if estado:
            conditions.append(f"r.estado = ${param_idx}")
            params.append(estado)
            param_idx += 1
        if search:
            conditions.append(f"(r.n_corte ILIKE ${param_idx} OR s.nombre ILIKE ${param_idx} OR p.nombre ILIKE ${param_idx})")
            params.append(f"%{search}%")
            param_idx += 1

        where_clause = " AND ".join(conditions) if conditions else "TRUE"

        base_from = """
            FROM prod_movimientos_produccion mp
            LEFT JOIN prod_servicios_produccion s ON mp.servicio_id = s.id
            LEFT JOIN prod_personas_produccion p ON mp.persona_id = p.id
            LEFT JOIN prod_registros r ON mp.registro_id = r.id
        """

        # Count total
        count_row = await conn.fetchrow(f"SELECT COUNT(*) as total {base_from} WHERE {where_clause}", *params)
        total = count_row['total']

        # Build query with JOINs (eliminates N+1)
        query = f"""
            SELECT mp.*,
                s.nombre as servicio_nombre,
                p.nombre as persona_nombre,
                p.tipo_persona as persona_tipo,
                p.unidad_interna_id as persona_unidad_interna_id,
                r.n_corte as registro_n_corte,
                r.estado as registro_estado
            {base_from}
            WHERE {where_clause}
            ORDER BY mp.created_at DESC
        """

        if all != "true":
            query += f" LIMIT ${param_idx} OFFSET ${param_idx + 1}"
            params.extend([limit, offset])

        rows = await conn.fetch(query, *params)
        result = []
        for r in rows:
            d = row_to_dict(r)
            if d.get('fecha_inicio'):
                d['fecha_inicio'] = str(d['fecha_inicio'])
            if d.get('fecha_fin'):
                d['fecha_fin'] = str(d['fecha_fin'])
            if d.get('fecha_esperada_movimiento'):
                d['fecha_esperada_movimiento'] = str(d['fecha_esperada_movimiento'])
            d['detalle_costos'] = parse_jsonb(d.get('detalle_costos')) if d.get('detalle_costos') else None
            result.append(d)

        if all == "true":
            return result
        return {"items": result, "total": total, "limit": limit, "offset": offset}

@router.post("/movimientos-produccion")
async def create_movimiento(input: MovimientoCreate, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT id FROM prod_registros WHERE id = $1", input.registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        # Bloqueo por paralización activa
        par_activa = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_paralizacion WHERE registro_id = $1 AND activa = TRUE", input.registro_id
        )
        if par_activa and par_activa > 0:
            raise HTTPException(status_code=400, detail="Registro PARALIZADO. Resuelve la incidencia antes de crear movimientos.")
        srv = await conn.fetchrow("SELECT id FROM prod_servicios_produccion WHERE id = $1", input.servicio_id)
        if not srv:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        per = await conn.fetchrow("SELECT servicios FROM prod_personas_produccion WHERE id = $1", input.persona_id)
        if not per:
            raise HTTPException(status_code=404, detail="Persona no encontrada")
        
        # Usar tarifa_aplicada del frontend si viene, sino calcular desde persona-servicio
        tarifa = input.tarifa_aplicada or 0
        if not tarifa:
            servicios = parse_jsonb(per['servicios'])
            for s in servicios:
                sid = s if isinstance(s, str) else s.get('servicio_id')
                if sid == input.servicio_id:
                    tarifa = s.get('tarifa', 0) if isinstance(s, dict) else 0
                    break
        
        diferencia = input.cantidad_enviada - input.cantidad_recibida

        # Si hay líneas de detalle, el costo es la suma de subtotales
        detalle_costos = input.detalle_costos or []
        if detalle_costos:
            costo_calculado = sum(
                (linea.get('cantidad', 0) or 0) * (linea.get('precio_unitario', 0) or 0)
                for linea in detalle_costos
            )
        else:
            costo_calculado = input.cantidad_recibida * tarifa

        detalle_costos_json = json.dumps(detalle_costos) if detalle_costos else None

        movimiento = Movimiento(**input.model_dump())
        movimiento.diferencia = diferencia
        movimiento.costo_calculado = costo_calculado

        fecha_inicio = None
        fecha_fin = None
        if input.fecha_inicio:
            try:
                fecha_inicio = datetime.strptime(input.fecha_inicio, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass
        if input.fecha_fin:
            try:
                fecha_fin = datetime.strptime(input.fecha_fin, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass

        fecha_esperada = None
        if input.fecha_esperada_movimiento:
            try:
                fecha_esperada = datetime.strptime(input.fecha_esperada_movimiento, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass

        await conn.execute(
            """INSERT INTO prod_movimientos_produccion (id, registro_id, servicio_id, persona_id, cantidad_enviada, cantidad_recibida, diferencia, costo_calculado, tarifa_aplicada, fecha_inicio, fecha_fin, fecha_esperada_movimiento, responsable_movimiento, observaciones, avance_porcentaje, avance_updated_at, created_at, detalle_costos)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)""",
            movimiento.id, movimiento.registro_id, movimiento.servicio_id, movimiento.persona_id,
            movimiento.cantidad_enviada, movimiento.cantidad_recibida, diferencia, costo_calculado,
            tarifa, fecha_inicio, fecha_fin, fecha_esperada, input.responsable_movimiento or None,
            movimiento.observaciones, input.avance_porcentaje,
            datetime.now() if input.avance_porcentaje is not None else None,
            movimiento.created_at.replace(tzinfo=None), detalle_costos_json
        )
        
        # Crear merma si hay diferencia
        if diferencia > 0:
            merma_id = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO prod_mermas (id, registro_id, movimiento_id, servicio_id, persona_id, cantidad, motivo, fecha)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
                merma_id, input.registro_id, movimiento.id, input.servicio_id, input.persona_id,
                diferencia, "Diferencia automática", datetime.now()
            )
        
        servicio_row = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", input.servicio_id)
        servicio_nombre = servicio_row['nombre'] if servicio_row else input.servicio_id
        await audit_log_safe(conn, get_usuario(current_user), "CREATE", "produccion", "prod_movimientos_produccion", movimiento.id,
            datos_despues={"servicio": servicio_nombre,
                           "cantidad_enviada": input.cantidad_enviada, "cantidad_recibida": input.cantidad_recibida,
                           "diferencia": diferencia, "registro_id": input.registro_id},
            referencia=input.registro_id)
    await registrar_actividad(pool, current_user['id'], current_user.get('username', ''), "crear",
        tabla_afectada="registros", registro_id=input.registro_id,
        descripcion=f"Creo movimiento en {servicio_nombre}: {input.cantidad_enviada} env / {input.cantidad_recibida} rec")
    return movimiento

@router.put("/movimientos-produccion/{movimiento_id}")
async def update_movimiento(movimiento_id: str, input: MovimientoCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_movimientos_produccion WHERE id = $1", movimiento_id)
        if not result:
            raise HTTPException(status_code=404, detail="Movimiento no encontrado")
        # Bloqueo por paralización activa
        par_activa = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_paralizacion WHERE registro_id = $1 AND activa = TRUE", input.registro_id
        )
        if par_activa and par_activa > 0:
            raise HTTPException(status_code=400, detail="Registro PARALIZADO. Resuelve la incidencia antes de editar movimientos.")
        
        # Usar tarifa_aplicada del frontend si viene, sino calcular desde persona-servicio
        tarifa = input.tarifa_aplicada or 0
        if not tarifa:
            per = await conn.fetchrow("SELECT servicios FROM prod_personas_produccion WHERE id = $1", input.persona_id)
            servicios = parse_jsonb(per['servicios']) if per else []
            for s in servicios:
                sid = s if isinstance(s, str) else s.get('servicio_id')
                if sid == input.servicio_id:
                    tarifa = s.get('tarifa', 0) if isinstance(s, dict) else 0
                    break
        
        diferencia = input.cantidad_enviada - input.cantidad_recibida

        # Si hay líneas de detalle, el costo es la suma de subtotales
        detalle_costos = input.detalle_costos or []
        if detalle_costos:
            costo_calculado = sum(
                (linea.get('cantidad', 0) or 0) * (linea.get('precio_unitario', 0) or 0)
                for linea in detalle_costos
            )
        else:
            costo_calculado = input.cantidad_recibida * tarifa

        detalle_costos_json = json.dumps(detalle_costos) if detalle_costos else None

        # Eliminar mermas anteriores
        await conn.execute("DELETE FROM prod_mermas WHERE movimiento_id = $1", movimiento_id)

        fecha_inicio = None
        fecha_fin = None
        if input.fecha_inicio:
            try:
                fecha_inicio = datetime.strptime(input.fecha_inicio, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass
        if input.fecha_fin:
            try:
                fecha_fin = datetime.strptime(input.fecha_fin, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass

        fecha_esperada = None
        if input.fecha_esperada_movimiento:
            try:
                fecha_esperada = datetime.strptime(input.fecha_esperada_movimiento, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass

        await conn.execute(
            """UPDATE prod_movimientos_produccion SET registro_id=$1, servicio_id=$2, persona_id=$3, cantidad_enviada=$4, cantidad_recibida=$5, diferencia=$6, costo_calculado=$7, tarifa_aplicada=$8, fecha_inicio=$9, fecha_fin=$10, fecha_esperada_movimiento=$11, responsable_movimiento=$12, observaciones=$13, avance_porcentaje=$14, avance_updated_at=CASE WHEN $14 IS DISTINCT FROM avance_porcentaje THEN NOW() ELSE avance_updated_at END, detalle_costos=$16 WHERE id=$15""",
            input.registro_id, input.servicio_id, input.persona_id, input.cantidad_enviada, input.cantidad_recibida,
            diferencia, costo_calculado, tarifa, fecha_inicio, fecha_fin, fecha_esperada, input.responsable_movimiento or None, input.observaciones, input.avance_porcentaje, movimiento_id, detalle_costos_json
        )
        
        # Crear nueva merma si hay diferencia
        if diferencia > 0:
            merma_id = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO prod_mermas (id, registro_id, movimiento_id, servicio_id, persona_id, cantidad, motivo, fecha)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
                merma_id, input.registro_id, movimiento_id, input.servicio_id, input.persona_id,
                diferencia, "Diferencia automática", datetime.now()
            )
        
        return {**row_to_dict(result), **input.model_dump(), "diferencia": diferencia, "costo_calculado": costo_calculado, "tarifa_aplicada": tarifa}

@router.delete("/movimientos-produccion/{movimiento_id}")
async def delete_movimiento(movimiento_id: str, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        mov = await conn.fetchrow("SELECT servicio_id, registro_id, cantidad_enviada, cantidad_recibida FROM prod_movimientos_produccion WHERE id = $1", movimiento_id)
        await conn.execute("DELETE FROM prod_mermas WHERE movimiento_id = $1", movimiento_id)
        await conn.execute("DELETE FROM prod_movimientos_produccion WHERE id = $1", movimiento_id)
        if mov:
            servicio_row = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", mov['servicio_id'])
            servicio_nombre = servicio_row['nombre'] if servicio_row else str(mov['servicio_id'])
            await audit_log_safe(conn, get_usuario(current_user), "DELETE", "produccion", "prod_movimientos_produccion", movimiento_id,
                datos_antes={"servicio": servicio_nombre,
                             "cantidad_enviada": float(mov['cantidad_enviada'] or 0), "cantidad_recibida": float(mov['cantidad_recibida'] or 0),
                             "registro_id": mov['registro_id']},
                referencia=mov['registro_id'])
    if mov:
        await registrar_actividad(pool, current_user['id'], current_user.get('username', ''), "eliminar",
            tabla_afectada="registros", registro_id=mov['registro_id'],
            descripcion=f"Elimino movimiento de {servicio_nombre}")
    return {"message": "Movimiento eliminado"}

# ==================== COPIAR MOVIMIENTOS ====================

@router.post("/registros/{registro_id}/copiar-movimientos")
async def copiar_movimientos(registro_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """Copia movimientos desde otro registro al registro destino."""
    pool = await get_pool()
    registro_origen_id = body.get("registro_origen_id")
    movimiento_ids = body.get("movimiento_ids", [])
    cantidad_destino = body.get("cantidad_destino", 0)

    if not registro_origen_id or not movimiento_ids:
        raise HTTPException(status_code=400, detail="registro_origen_id y movimiento_ids son requeridos")

    async with pool.acquire() as conn:
        dest = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not dest:
            raise HTTPException(status_code=404, detail="Registro destino no encontrado")
        origen = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_origen_id)
        if not origen:
            raise HTTPException(status_code=404, detail="Registro origen no encontrado")

        # Obtener movimientos del origen
        movs = await conn.fetch("""
            SELECT * FROM prod_movimientos_produccion
            WHERE id = ANY($1) AND registro_id = $2
        """, movimiento_ids, registro_origen_id)

        if not movs:
            raise HTTPException(status_code=400, detail="No se encontraron movimientos para copiar")

        # Calcular cantidad del origen para proporción
        cantidad_origen = float(body.get("cantidad_origen", 0))
        ratio = (float(cantidad_destino) / cantidad_origen) if cantidad_origen > 0 and cantidad_destino > 0 else 1.0

        creados = 0
        for mov in movs:
            new_id = str(uuid.uuid4())
            cant_enviada = int(round(float(mov['cantidad_enviada'] or 0) * ratio))
            cant_recibida = int(round(float(mov['cantidad_recibida'] or 0) * ratio))
            tarifa = float(mov['tarifa_aplicada'] or 0)
            diferencia = cant_enviada - cant_recibida

            # Ajustar detalle_costos proporcionalmente
            detalle_raw = mov['detalle_costos']
            detalle_costos = []
            if detalle_raw:
                if isinstance(detalle_raw, str):
                    detalle_costos = json.loads(detalle_raw)
                else:
                    detalle_costos = list(detalle_raw)
                for linea in detalle_costos:
                    linea['cantidad'] = round(float(linea.get('cantidad', 0)) * ratio, 2)

            if detalle_costos:
                costo_calculado = sum(
                    (l.get('cantidad', 0) or 0) * (l.get('precio_unitario', 0) or 0) for l in detalle_costos
                )
            else:
                costo_calculado = cant_recibida * tarifa

            detalle_json = json.dumps(detalle_costos) if detalle_costos else None

            await conn.execute("""
                INSERT INTO prod_movimientos_produccion
                (id, registro_id, servicio_id, persona_id, cantidad_enviada, cantidad_recibida,
                 diferencia, costo_calculado, tarifa_aplicada, fecha_inicio, fecha_fin,
                 fecha_esperada_movimiento, responsable_movimiento, observaciones,
                 avance_porcentaje, avance_updated_at, created_at, detalle_costos)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
            """, new_id, registro_id, mov['servicio_id'], mov['persona_id'],
                cant_enviada, cant_recibida, diferencia, costo_calculado, tarifa,
                mov['fecha_inicio'], mov['fecha_fin'], mov['fecha_esperada_movimiento'],
                mov['responsable_movimiento'],
                f"Copiado desde Corte #{origen['n_corte']}",
                mov['avance_porcentaje'],
                datetime.now() if mov['avance_porcentaje'] is not None else None,
                datetime.now(timezone.utc).replace(tzinfo=None), detalle_json)
            creados += 1

        return {"message": f"Se copiaron {creados} movimientos desde Corte #{origen['n_corte']}", "creados": creados}


# ==================== ENDPOINTS MERMAS ====================

@router.get("/mermas")
async def get_mermas(registro_id: str = None, servicio_id: str = None, persona_id: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM prod_mermas WHERE 1=1"
        params = []
        if registro_id:
            params.append(registro_id)
            query += f" AND registro_id = ${len(params)}"
        if servicio_id:
            params.append(servicio_id)
            query += f" AND servicio_id = ${len(params)}"
        if persona_id:
            params.append(persona_id)
            query += f" AND persona_id = ${len(params)}"
        query += " ORDER BY fecha DESC"
        rows = await conn.fetch(query, *params)
        result = []
        for r in rows:
            d = row_to_dict(r)
            srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", d.get('servicio_id'))
            per = await conn.fetchrow("SELECT nombre FROM prod_personas_produccion WHERE id = $1", d.get('persona_id'))
            reg = await conn.fetchrow("SELECT n_corte FROM prod_registros WHERE id = $1", d.get('registro_id'))
            d['servicio_nombre'] = srv['nombre'] if srv else None
            d['persona_nombre'] = per['nombre'] if per else None
            d['registro_n_corte'] = reg['n_corte'] if reg else None
            result.append(d)
        return result

@router.post("/mermas")
async def create_merma(input: MermaCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        merma = Merma(**input.model_dump())
        await conn.execute(
            """INSERT INTO prod_mermas (id, registro_id, movimiento_id, servicio_id, persona_id, cantidad, motivo, fecha)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            merma.id, merma.registro_id, merma.movimiento_id, merma.servicio_id, merma.persona_id,
            merma.cantidad, merma.motivo, merma.fecha.replace(tzinfo=None)
        )
        return merma

@router.put("/mermas/{merma_id}")
async def update_merma(merma_id: str, input: MermaCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_mermas WHERE id = $1", merma_id)
        if not result:
            raise HTTPException(status_code=404, detail="Merma no encontrada")
        await conn.execute(
            """UPDATE prod_mermas SET registro_id=$1, movimiento_id=$2, servicio_id=$3, persona_id=$4, cantidad=$5, motivo=$6 WHERE id=$7""",
            input.registro_id, input.movimiento_id, input.servicio_id, input.persona_id, input.cantidad, input.motivo, merma_id
        )
        return {**row_to_dict(result), **input.model_dump()}

@router.delete("/mermas/{merma_id}")
async def delete_merma(merma_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_mermas WHERE id = $1", merma_id)
        return {"message": "Merma eliminada"}

# ==================== ENDPOINTS GUIAS REMISION ====================

@router.get("/guias-remision")
async def get_guias_remision(registro_id: str = None, persona_id: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM prod_guias_remision WHERE 1=1"
        params = []
        if registro_id:
            params.append(registro_id)
            query += f" AND registro_id = ${len(params)}"
        if persona_id:
            params.append(persona_id)
            query += f" AND persona_id = ${len(params)}"
        query += " ORDER BY fecha DESC"
        rows = await conn.fetch(query, *params)
        result = []
        for r in rows:
            d = row_to_dict(r)
            srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", d.get('servicio_id'))
            per = await conn.fetchrow("SELECT nombre, telefono, direccion FROM prod_personas_produccion WHERE id = $1", d.get('persona_id'))
            reg = await conn.fetchrow("SELECT n_corte, modelo_id FROM prod_registros WHERE id = $1", d.get('registro_id'))
            d['servicio_nombre'] = srv['nombre'] if srv else None
            d['persona_nombre'] = per['nombre'] if per else None
            d['persona_telefono'] = per['telefono'] if per else None
            d['persona_direccion'] = per['direccion'] if per else None
            d['registro_n_corte'] = reg['n_corte'] if reg else None
            if reg and reg['modelo_id']:
                modelo = await conn.fetchrow("SELECT nombre FROM prod_modelos WHERE id = $1", reg['modelo_id'])
                d['modelo_nombre'] = modelo['nombre'] if modelo else None
            result.append(d)
        return result

@router.get("/guias-remision/{guia_id}")
async def get_guia_remision(guia_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        guia = await conn.fetchrow("SELECT * FROM prod_guias_remision WHERE id = $1", guia_id)
        if not guia:
            raise HTTPException(status_code=404, detail="Guía no encontrada")
        d = row_to_dict(guia)
        srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", d.get('servicio_id'))
        per = await conn.fetchrow("SELECT * FROM prod_personas_produccion WHERE id = $1", d.get('persona_id'))
        reg = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", d.get('registro_id'))
        d['servicio_nombre'] = srv['nombre'] if srv else None
        if per:
            d['persona_nombre'] = per['nombre']
            d['persona_telefono'] = per['telefono']
            d['persona_direccion'] = per['direccion']
        if reg:
            d['registro_n_corte'] = reg['n_corte']
            d['tallas'] = parse_jsonb(reg['tallas'])
            d['distribucion_colores'] = parse_jsonb(reg['distribucion_colores'])
            if reg['modelo_id']:
                modelo = await conn.fetchrow("SELECT nombre FROM prod_modelos WHERE id = $1", reg['modelo_id'])
                d['modelo_nombre'] = modelo['nombre'] if modelo else None
        return d

@router.post("/guias-remision")
async def create_guia_remision(input: GuiaRemisionCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        guia = GuiaRemision(**input.model_dump())
        # Generar número de guía
        ultima = await conn.fetchrow("SELECT numero_guia FROM prod_guias_remision WHERE numero_guia != '' ORDER BY numero_guia DESC LIMIT 1")
        if ultima and ultima['numero_guia']:
            try:
                num = int(ultima['numero_guia'].replace('GR-', '')) + 1
            except (ValueError, TypeError):
                num = 1
        else:
            num = 1
        guia.numero_guia = f"GR-{num:06d}"
        
        await conn.execute(
            """INSERT INTO prod_guias_remision (id, numero_guia, movimiento_id, registro_id, servicio_id, persona_id, cantidad, observaciones, fecha)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            guia.id, guia.numero_guia, guia.movimiento_id, guia.registro_id, guia.servicio_id,
            guia.persona_id, guia.cantidad, guia.observaciones, guia.fecha.replace(tzinfo=None)
        )
        return guia

@router.post("/guias-remision/from-movimiento/{movimiento_id}")
async def create_guia_from_movimiento(movimiento_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        mov = await conn.fetchrow("SELECT * FROM prod_movimientos_produccion WHERE id = $1", movimiento_id)
        if not mov:
            raise HTTPException(status_code=404, detail="Movimiento no encontrado")
        
        # Ver si ya existe guía para este movimiento
        guia_existente = await conn.fetchrow("SELECT * FROM prod_guias_remision WHERE movimiento_id = $1", movimiento_id)
        
        if guia_existente:
            # Actualizar guía existente
            await conn.execute(
                """UPDATE prod_guias_remision SET servicio_id=$1, persona_id=$2, cantidad=$3, fecha=$4 WHERE id=$5""",
                mov['servicio_id'], mov['persona_id'], mov['cantidad_enviada'], datetime.now(), guia_existente['id']
            )
            updated = await conn.fetchrow("SELECT * FROM prod_guias_remision WHERE id = $1", guia_existente['id'])
            updated_dict = row_to_dict(updated)
            # Enriquecer con nombres
            srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", updated_dict.get('servicio_id'))
            per = await conn.fetchrow("SELECT nombre, telefono, direccion FROM prod_personas_produccion WHERE id = $1", updated_dict.get('persona_id'))
            reg = await conn.fetchrow("SELECT n_corte, modelo_id FROM prod_registros WHERE id = $1", updated_dict.get('registro_id'))
            updated_dict['servicio_nombre'] = srv['nombre'] if srv else None
            updated_dict['persona_nombre'] = per['nombre'] if per else None
            updated_dict['persona_telefono'] = per['telefono'] if per else None
            updated_dict['persona_direccion'] = per['direccion'] if per else None
            updated_dict['registro_n_corte'] = reg['n_corte'] if reg else None
            if reg and reg['modelo_id']:
                modelo = await conn.fetchrow("SELECT nombre FROM prod_modelos WHERE id = $1", reg['modelo_id'])
                updated_dict['modelo_nombre'] = modelo['nombre'] if modelo else None
            return {"message": "Guía actualizada", "guia": updated_dict, "updated": True}
        
        # Crear nueva guía
        guia_id = str(uuid.uuid4())
        ultima = await conn.fetchrow("SELECT numero_guia FROM prod_guias_remision WHERE numero_guia != '' ORDER BY numero_guia DESC LIMIT 1")
        if ultima and ultima['numero_guia']:
            try:
                num = int(ultima['numero_guia'].replace('GR-', '')) + 1
            except (ValueError, TypeError):
                num = 1
        else:
            num = 1
        numero_guia = f"GR-{num:06d}"
        
        await conn.execute(
            """INSERT INTO prod_guias_remision (id, numero_guia, movimiento_id, registro_id, servicio_id, persona_id, cantidad, observaciones, fecha)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            guia_id, numero_guia, movimiento_id, mov['registro_id'], mov['servicio_id'],
            mov['persona_id'], mov['cantidad_enviada'], "", datetime.now()
        )
        guia = await conn.fetchrow("SELECT * FROM prod_guias_remision WHERE id = $1", guia_id)
        guia_dict = row_to_dict(guia)
        # Enriquecer con nombres
        srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", guia_dict.get('servicio_id'))
        per = await conn.fetchrow("SELECT nombre, telefono, direccion FROM prod_personas_produccion WHERE id = $1", guia_dict.get('persona_id'))
        reg = await conn.fetchrow("SELECT n_corte, modelo_id FROM prod_registros WHERE id = $1", guia_dict.get('registro_id'))
        guia_dict['servicio_nombre'] = srv['nombre'] if srv else None
        guia_dict['persona_nombre'] = per['nombre'] if per else None
        guia_dict['persona_telefono'] = per['telefono'] if per else None
        guia_dict['persona_direccion'] = per['direccion'] if per else None
        guia_dict['registro_n_corte'] = reg['n_corte'] if reg else None
        if reg and reg['modelo_id']:
            modelo = await conn.fetchrow("SELECT nombre FROM prod_modelos WHERE id = $1", reg['modelo_id'])
            guia_dict['modelo_nombre'] = modelo['nombre'] if modelo else None
        return {"message": "Guía creada", "guia": guia_dict, "updated": False}

@router.delete("/guias-remision/{guia_id}")
async def delete_guia_remision(guia_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_guias_remision WHERE id = $1", guia_id)
        return {"message": "Guía eliminada"}

# ==================== ENDPOINTS ESTADISTICAS ====================

