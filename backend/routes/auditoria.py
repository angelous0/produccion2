"""
Modulo de Auditoria - Registro centralizado de cambios
- Helper audit_log() para insertar logs desde cualquier endpoint
- Endpoints GET para consulta con filtros y paginacion
- Solo admin puede ver los logs
"""
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional

import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth_utils import get_current_user

logger = logging.getLogger("auditoria")

router = APIRouter(prefix="/api", tags=["auditoria"])


# ==================== MIGRACION ====================

async def init_audit_tables():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS produccion.audit_log (
                id SERIAL PRIMARY KEY,
                usuario VARCHAR NOT NULL,
                accion VARCHAR NOT NULL,
                modulo VARCHAR NOT NULL,
                tabla VARCHAR NOT NULL,
                registro_id VARCHAR,
                datos_antes JSONB,
                datos_despues JSONB,
                ip VARCHAR,
                user_agent VARCHAR,
                observacion TEXT,
                empresa_id INT DEFAULT 7,
                linea_negocio_id INT,
                resultado VARCHAR DEFAULT 'OK',
                referencia VARCHAR,
                fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_fecha ON produccion.audit_log(fecha_hora DESC)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_modulo ON produccion.audit_log(modulo, accion)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_registro ON produccion.audit_log(registro_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_usuario ON produccion.audit_log(usuario)")


# ==================== HELPER CENTRALIZADO ====================

async def audit_log(
    conn,
    usuario: str,
    accion: str,
    modulo: str,
    tabla: str,
    registro_id: str = None,
    datos_antes: dict = None,
    datos_despues: dict = None,
    observacion: str = None,
    empresa_id: int = 7,
    linea_negocio_id: int = None,
    resultado: str = "OK",
    referencia: str = None,
    ip: str = None,
    user_agent: str = None,
):
    """
    Inserta un registro de auditoria.
    - Si se llama dentro de conn.transaction(), es atomico con la operacion.
    - Si se llama fuera, es best-effort (no bloquea la operacion del usuario).
    """
    try:
        # Serializar datos a JSON, limpiando tipos no serializables
        antes_json = json.dumps(datos_antes, default=str) if datos_antes else None
        despues_json = json.dumps(datos_despues, default=str) if datos_despues else None
        ahora = datetime.now(timezone.utc).replace(tzinfo=None)

        await conn.execute("""
            INSERT INTO produccion.audit_log
            (usuario, accion, modulo, tabla, registro_id, datos_antes, datos_despues,
             observacion, empresa_id, linea_negocio_id, resultado, referencia, ip, user_agent, fecha_hora)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        """, usuario, accion, modulo, tabla, registro_id,
            antes_json, despues_json, observacion,
            empresa_id, linea_negocio_id, resultado, referencia, ip, user_agent, ahora)
    except Exception as e:
        logger.error(f"AUDIT_LOG_ERROR: accion={accion}, modulo={modulo}, tabla={tabla}, registro_id={registro_id}, error={str(e)}")
        raise


async def audit_log_safe(
    conn, usuario, accion, modulo, tabla, registro_id=None,
    datos_antes=None, datos_despues=None, observacion=None,
    empresa_id=7, linea_negocio_id=None, resultado="OK",
    referencia=None, ip=None, user_agent=None,
):
    """
    Version best-effort: no lanza excepcion si falla el insert.
    Usar para operaciones no criticas (crear registro, editar).
    """
    try:
        await audit_log(
            conn, usuario, accion, modulo, tabla, registro_id,
            datos_antes, datos_despues, observacion,
            empresa_id, linea_negocio_id, resultado, referencia, ip, user_agent,
        )
    except Exception as e:
        logger.error(f"AUDIT_LOG_SAFE_FAIL: accion={accion}, modulo={modulo}, error={str(e)}")


def get_usuario(user: dict) -> str:
    return user.get("username", user.get("nombre_completo", user.get("nombre", "sistema")))


# ==================== ENDPOINTS DE CONSULTA ====================

@router.get("/auditoria")
async def listar_audit_logs(
    usuario: str = "",
    modulo: str = "",
    accion: str = "",
    tabla: str = "",
    registro_id: str = "",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    resultado: str = "",
    linea_negocio_id: str = "",
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user=Depends(get_current_user),
):
    """Lista logs de auditoria con filtros. Solo admin."""
    if user.get("rol") not in ("admin", "superadmin", None):
        raise HTTPException(status_code=403, detail="Acceso restringido a administradores")

    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = []
        params = []
        idx = 1

        if usuario:
            conditions.append(f"a.usuario ILIKE ${idx}")
            params.append(f"%{usuario}%")
            idx += 1
        if modulo:
            conditions.append(f"a.modulo = ${idx}")
            params.append(modulo)
            idx += 1
        if accion:
            conditions.append(f"a.accion = ${idx}")
            params.append(accion)
            idx += 1
        if tabla:
            conditions.append(f"a.tabla = ${idx}")
            params.append(tabla)
            idx += 1
        if registro_id:
            conditions.append(f"a.registro_id = ${idx}")
            params.append(registro_id)
            idx += 1
        if resultado:
            conditions.append(f"a.resultado = ${idx}")
            params.append(resultado)
            idx += 1
        if fecha_desde:
            conditions.append(f"a.fecha_hora >= ${idx}")
            params.append(datetime.strptime(fecha_desde, '%Y-%m-%d'))
            idx += 1
        if fecha_hasta:
            conditions.append(f"a.fecha_hora < ${idx}")
            params.append(datetime.strptime(fecha_hasta, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            idx += 1
        if linea_negocio_id:
            conditions.append(f"a.linea_negocio_id = ${idx}")
            params.append(int(linea_negocio_id))
            idx += 1

        where = " AND ".join(conditions) if conditions else "TRUE"

        total = await conn.fetchval(f"""
            SELECT COUNT(*) FROM produccion.audit_log a WHERE {where}
        """, *params)

        rows = await conn.fetch(f"""
            SELECT a.* FROM produccion.audit_log a
            WHERE {where}
            ORDER BY a.fecha_hora DESC
            LIMIT ${idx} OFFSET ${idx + 1}
        """, *params, limit, offset)

        items = []
        for r in rows:
            d = dict(r)
            d['fecha_hora'] = d['fecha_hora'].isoformat() if d.get('fecha_hora') else None
            # Parsear JSONB a dict para el frontend
            if d.get('datos_antes') and isinstance(d['datos_antes'], str):
                try:
                    d['datos_antes'] = json.loads(d['datos_antes'])
                except (json.JSONDecodeError, TypeError):
                    pass
            if d.get('datos_despues') and isinstance(d['datos_despues'], str):
                try:
                    d['datos_despues'] = json.loads(d['datos_despues'])
                except (json.JSONDecodeError, TypeError):
                    pass
            items.append(d)

        # Obtener valores unicos para filtros del frontend
        modulos_unicos = await conn.fetch("SELECT DISTINCT modulo FROM produccion.audit_log ORDER BY modulo")
        acciones_unicas = await conn.fetch("SELECT DISTINCT accion FROM produccion.audit_log ORDER BY accion")
        usuarios_unicos = await conn.fetch("SELECT DISTINCT usuario FROM produccion.audit_log ORDER BY usuario")
        lineas_unicas = await conn.fetch("""
            SELECT DISTINCT a.linea_negocio_id, ln.nombre
            FROM produccion.audit_log a
            LEFT JOIN finanzas2.cont_linea_negocio ln ON a.linea_negocio_id = ln.id
            WHERE a.linea_negocio_id IS NOT NULL
            ORDER BY ln.nombre
        """)

        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
            "filtros_disponibles": {
                "modulos": [r['modulo'] for r in modulos_unicos],
                "acciones": [r['accion'] for r in acciones_unicas],
                "usuarios": [r['usuario'] for r in usuarios_unicos],
                "lineas": [{"id": r['linea_negocio_id'], "nombre": r['nombre'] or f"Linea {r['linea_negocio_id']}"} for r in lineas_unicas],
            }
        }


@router.get("/auditoria/registro/{registro_id}")
async def audit_por_registro(
    registro_id: str,
    user=Depends(get_current_user),
):
    """Historial de auditoria de un registro especifico."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM produccion.audit_log
            WHERE registro_id = $1
            ORDER BY fecha_hora DESC
        """, registro_id)

        items = []
        for r in rows:
            d = dict(r)
            d['fecha_hora'] = d['fecha_hora'].isoformat() if d.get('fecha_hora') else None
            items.append(d)

        return {"items": items, "total": len(items)}
