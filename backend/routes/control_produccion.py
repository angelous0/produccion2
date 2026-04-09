from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, timezone, timedelta
import uuid

router = APIRouter(prefix="/api", tags=["Control Producción"])

TZ_LIMA = timezone(timedelta(hours=-5))

# ========== MODELS ==========

class IncidenciaCreate(BaseModel):
    registro_id: str
    movimiento_id: Optional[str] = None
    motivo_id: str
    comentario: str = ""
    usuario: str = ""
    paraliza: bool = False

class IncidenciaUpdate(BaseModel):
    estado: str  # ABIERTA, RESUELTA
    comentario_resolucion: Optional[str] = None

class MotivoCreate(BaseModel):
    nombre: str

# ========== HELPERS ==========

def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, (datetime, date)):
            d[k] = v.isoformat()
    return d

# ========== MOTIVOS DE INCIDENCIA (Catálogo) ==========

@router.get("/motivos-incidencia")
async def get_motivos_incidencia():
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_motivos_incidencia WHERE activo = TRUE ORDER BY nombre")
        return [row_to_dict(r) for r in rows]

@router.post("/motivos-incidencia")
async def create_motivo_incidencia(input: MotivoCreate):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT id FROM prod_motivos_incidencia WHERE nombre ILIKE $1", input.nombre.strip())
        if exists:
            raise HTTPException(status_code=400, detail="Ya existe un motivo con ese nombre")
        motivo_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO prod_motivos_incidencia (id, nombre) VALUES ($1, $2)",
            motivo_id, input.nombre.strip()
        )
        row = await conn.fetchrow("SELECT * FROM prod_motivos_incidencia WHERE id = $1", motivo_id)
        return row_to_dict(row)

@router.delete("/motivos-incidencia/{motivo_id}")
async def delete_motivo_incidencia(motivo_id: str):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE prod_motivos_incidencia SET activo = FALSE WHERE id = $1", motivo_id)
        return {"ok": True}

@router.put("/motivos-incidencia/{motivo_id}")
async def update_motivo_incidencia(motivo_id: str, input: MotivoCreate):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT id FROM prod_motivos_incidencia WHERE nombre ILIKE $1 AND id != $2",
            input.nombre.strip(), motivo_id
        )
        if exists:
            raise HTTPException(status_code=400, detail="Ya existe un motivo con ese nombre")
        await conn.execute(
            "UPDATE prod_motivos_incidencia SET nombre = $1 WHERE id = $2",
            input.nombre.strip(), motivo_id
        )
        row = await conn.fetchrow("SELECT * FROM prod_motivos_incidencia WHERE id = $1", motivo_id)
        return row_to_dict(row)

# ========== INCIDENCIAS (Unificadas con Paralizaciones) ==========

@router.get("/incidencias/{registro_id}")
async def get_incidencias(registro_id: str):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT i.*, m.nombre as motivo_nombre,
                      p.activa as paralizacion_activa, p.fecha_inicio as paralizacion_inicio, p.fecha_fin as paralizacion_fin
               FROM prod_incidencia i
               LEFT JOIN prod_motivos_incidencia m ON i.tipo = m.id
               LEFT JOIN prod_paralizacion p ON i.paralizacion_id = p.id
               WHERE i.registro_id = $1
               ORDER BY i.fecha_hora DESC""",
            registro_id
        )
        result = []
        for r in rows:
            d = row_to_dict(r)
            # Fallback: si tipo no es UUID (datos viejos), usar tipo como motivo_nombre
            if not d.get('motivo_nombre') and d.get('tipo'):
                d['motivo_nombre'] = d['tipo']
            if d.get('movimiento_id'):
                mov = await conn.fetchrow(
                    """SELECT s.nombre as servicio_nombre FROM prod_movimientos_produccion m 
                       JOIN prod_servicios_produccion s ON s.id = m.servicio_id 
                       WHERE m.id = $1""", d['movimiento_id'])
                d['movimiento_servicio'] = mov['servicio_nombre'] if mov else None
            result.append(d)
        return result

@router.post("/incidencias")
async def create_incidencia(input: IncidenciaCreate):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        inc_id = str(uuid.uuid4())
        now = datetime.now(TZ_LIMA).replace(tzinfo=None)
        paralizacion_id = None

        # Get motivo nombre
        motivo_row = await conn.fetchrow("SELECT nombre FROM prod_motivos_incidencia WHERE id = $1", input.motivo_id)
        motivo_nombre = motivo_row['nombre'] if motivo_row else 'Incidencia'

        # Si paraliza, crear paralización automáticamente
        if input.paraliza:
            active = await conn.fetchrow(
                "SELECT id FROM prod_paralizacion WHERE registro_id = $1 AND activa = TRUE AND movimiento_id IS NULL",
                input.registro_id
            )
            if active:
                raise HTTPException(status_code=400, detail="Ya existe una paralización activa para este registro")

            paralizacion_id = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO prod_paralizacion (id, registro_id, movimiento_id, fecha_inicio, motivo, comentario, activa, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$7)""",
                paralizacion_id, input.registro_id, input.movimiento_id, now, motivo_nombre, input.comentario, now
            )
            await conn.execute(
                "UPDATE prod_registros SET estado_operativo = 'PARALIZADA' WHERE id = $1",
                input.registro_id
            )

        await conn.execute(
            """INSERT INTO prod_incidencia (id, registro_id, movimiento_id, fecha_hora, usuario, tipo, comentario, estado, paraliza, paralizacion_id, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'ABIERTA',$8,$9,$10,$10)""",
            inc_id, input.registro_id, input.movimiento_id, now, input.usuario, input.motivo_id, input.comentario, input.paraliza, paralizacion_id, now
        )

        # Auto-publicar en conversación del registro
        msg_texto = f"INCIDENCIA: {motivo_nombre}"
        if input.comentario:
            msg_texto += f"\n{input.comentario}"
        if input.paraliza:
            msg_texto += "\nPARALIZA PRODUCCION"
        conv_id = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO prod_conversacion (id, registro_id, mensaje_padre_id, autor, mensaje, estado, fijado, created_at)
               VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)""",
            conv_id, input.registro_id, input.usuario or 'Sistema',
            msg_texto, 'importante' if input.paraliza else 'pendiente',
            input.paraliza, now
        )

        row = await conn.fetchrow("SELECT * FROM prod_incidencia WHERE id = $1", inc_id)
        return row_to_dict(row)

@router.put("/incidencias/{incidencia_id}")
async def update_incidencia(incidencia_id: str, input: IncidenciaUpdate):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM prod_incidencia WHERE id = $1", incidencia_id)
        if not row:
            raise HTTPException(status_code=404, detail="Incidencia no encontrada")

        now = datetime.now(TZ_LIMA).replace(tzinfo=None)
        await conn.execute(
            "UPDATE prod_incidencia SET estado = $1, updated_at = $2, comentario_resolucion = $3 WHERE id = $4",
            input.estado, now, input.comentario_resolucion, incidencia_id
        )

        # Si se resuelve y tenía paralización activa, levantarla automáticamente
        if input.estado == 'RESUELTA' and row.get('paralizacion_id'):
            par = await conn.fetchrow("SELECT * FROM prod_paralizacion WHERE id = $1", row['paralizacion_id'])
            if par and par['activa']:
                await conn.execute(
                    "UPDATE prod_paralizacion SET activa = FALSE, fecha_fin = $1, updated_at = $1 WHERE id = $2",
                    now, row['paralizacion_id']
                )
                # Recalculate estado_operativo
                registro_id = row['registro_id']
                other_active = await conn.fetchval(
                    "SELECT COUNT(*) FROM prod_paralizacion WHERE registro_id = $1 AND activa = TRUE",
                    registro_id
                )
                if not other_active or other_active == 0:
                    mov_vencido = await conn.fetchval(
                        "SELECT COUNT(*) FROM prod_movimientos_produccion WHERE registro_id = $1 AND fecha_esperada_movimiento < CURRENT_DATE",
                        registro_id
                    )
                    reg = await conn.fetchrow("SELECT fecha_entrega_final, estado FROM prod_registros WHERE id = $1", registro_id)
                    if mov_vencido and mov_vencido > 0:
                        new_estado = 'EN_RIESGO'
                    elif reg and reg['fecha_entrega_final'] and reg['fecha_entrega_final'] < date.today() and reg['estado'] != 'Almacén PT':
                        new_estado = 'EN_RIESGO'
                    else:
                        new_estado = 'NORMAL'
                    await conn.execute("UPDATE prod_registros SET estado_operativo = $1 WHERE id = $2", new_estado, registro_id)

            # Auto-publicar resolución en conversación
            motivo_row = await conn.fetchrow("SELECT nombre FROM prod_motivos_incidencia WHERE id = $1", row['tipo'])
            motivo_nombre = motivo_row['nombre'] if motivo_row else 'Incidencia'
            resolucion_texto = f"INCIDENCIA RESUELTA: {motivo_nombre}"
            if input.comentario_resolucion:
                resolucion_texto += f"\nResolución: {input.comentario_resolucion}"
            conv_id = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO prod_conversacion (id, registro_id, mensaje_padre_id, autor, mensaje, estado, fijado, created_at)
                   VALUES ($1, $2, NULL, $3, $4, 'resuelto', FALSE, $5)""",
                conv_id, row['registro_id'], 'Sistema',
                resolucion_texto, now
            )

        updated = await conn.fetchrow("SELECT * FROM prod_incidencia WHERE id = $1", incidencia_id)
        return row_to_dict(updated)

@router.delete("/incidencias/{incidencia_id}")
async def delete_incidencia(incidencia_id: str):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM prod_incidencia WHERE id = $1", incidencia_id)
        if row and row.get('paralizacion_id'):
            await conn.execute("DELETE FROM prod_paralizacion WHERE id = $1", row['paralizacion_id'])
        await conn.execute("DELETE FROM prod_incidencia WHERE id = $1", incidencia_id)
        return {"ok": True}

# ========== PARALIZACIONES (kept for backwards compat) ==========

@router.get("/paralizaciones/{registro_id}")
async def get_paralizaciones(registro_id: str):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM prod_paralizacion WHERE registro_id = $1 ORDER BY fecha_inicio DESC",
            registro_id
        )
        return [row_to_dict(r) for r in rows]

@router.put("/paralizaciones/{paralizacion_id}/levantar")
async def levantar_paralizacion(paralizacion_id: str):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM prod_paralizacion WHERE id = $1", paralizacion_id)
        if not row:
            raise HTTPException(status_code=404, detail="Paralización no encontrada")
        if not row['activa']:
            raise HTTPException(status_code=400, detail="Ya fue levantada")
        now = datetime.now(TZ_LIMA).replace(tzinfo=None)
        await conn.execute(
            "UPDATE prod_paralizacion SET activa = FALSE, fecha_fin = $1, updated_at = $1 WHERE id = $2",
            now, paralizacion_id
        )
        registro_id = row['registro_id']
        other_active = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_paralizacion WHERE registro_id = $1 AND activa = TRUE",
            registro_id
        )
        if not other_active or other_active == 0:
            mov_vencido = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_movimientos_produccion WHERE registro_id = $1 AND fecha_esperada_movimiento < CURRENT_DATE",
                registro_id
            )
            reg = await conn.fetchrow("SELECT fecha_entrega_final, estado FROM prod_registros WHERE id = $1", registro_id)
            if mov_vencido and mov_vencido > 0:
                new_estado = 'EN_RIESGO'
            elif reg and reg['fecha_entrega_final'] and reg['fecha_entrega_final'] < date.today() and reg['estado'] != 'Almacén PT':
                new_estado = 'EN_RIESGO'
            else:
                new_estado = 'NORMAL'
            await conn.execute("UPDATE prod_registros SET estado_operativo = $1 WHERE id = $2", new_estado, registro_id)
        updated = await conn.fetchrow("SELECT * FROM prod_paralizacion WHERE id = $1", paralizacion_id)
        return row_to_dict(updated)

# ========== UPDATE REGISTRO CONTROL ==========

@router.put("/registros/{registro_id}/control")
async def update_registro_control(registro_id: str, data: dict):
    from server import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        reg = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        if not reg:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        sets = []
        params = []
        idx = 1
        if 'fecha_entrega_final' in data:
            val = data['fecha_entrega_final']
            if val:
                try:
                    parsed = datetime.strptime(val, '%Y-%m-%d').date()
                    params.append(parsed)
                except (ValueError, TypeError):
                    params.append(None)
            else:
                params.append(None)
            sets.append(f"fecha_entrega_final = ${idx}")
            idx += 1
        if not sets:
            return {"message": "Nada que actualizar"}
        params.append(registro_id)
        query = f"UPDATE prod_registros SET {', '.join(sets)} WHERE id = ${idx}"
        await conn.execute(query, *params)
        active_par = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_paralizacion WHERE registro_id = $1 AND activa = TRUE", registro_id
        )
        updated_reg = await conn.fetchrow("SELECT * FROM prod_registros WHERE id = $1", registro_id)
        new_estado = 'NORMAL'
        if active_par and active_par > 0:
            new_estado = 'PARALIZADA'
        elif updated_reg['estado'] != 'Almacén PT':
            mov_vencido = await conn.fetchval(
                "SELECT COUNT(*) FROM prod_movimientos_produccion WHERE registro_id = $1 AND fecha_esperada_movimiento < CURRENT_DATE",
                registro_id
            )
            if mov_vencido and mov_vencido > 0:
                new_estado = 'EN_RIESGO'
            elif updated_reg['fecha_entrega_final'] and updated_reg['fecha_entrega_final'] < date.today():
                new_estado = 'EN_RIESGO'
        await conn.execute("UPDATE prod_registros SET estado_operativo = $1 WHERE id = $2", new_estado, registro_id)
        return {"message": "Actualizado", "estado_operativo": new_estado}
