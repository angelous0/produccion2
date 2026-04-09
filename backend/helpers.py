"""Shared helper functions used across routers."""
import json
import uuid
import asyncpg as asyncpg_ext
from db import get_pool


_muestra_pool = None
async def get_muestra_pool():
    global _muestra_pool
    if _muestra_pool is None:
        _muestra_pool = await asyncpg_ext.create_pool(
            host="72.60.241.216", port=9090, database="datos",
            user="admin", password="admin", min_size=1, max_size=3
        )
    return _muestra_pool


def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def parse_jsonb(val):
    if val is None:
        return []
    if isinstance(val, str):
        return json.loads(val)
    return val


async def registrar_actividad(
    pool,
    usuario_id: str,
    usuario_nombre: str,
    tipo_accion: str,
    tabla_afectada: str = None,
    registro_id: str = None,
    registro_nombre: str = None,
    descripcion: str = None,
    datos_anteriores: dict = None,
    datos_nuevos: dict = None,
    ip_address: str = None
):
    actividad_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO prod_actividad_historial 
               (id, usuario_id, usuario_nombre, tipo_accion, tabla_afectada, registro_id, registro_nombre, descripcion, datos_anteriores, datos_nuevos, ip_address, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())""",
            actividad_id, usuario_id, usuario_nombre, tipo_accion, tabla_afectada,
            registro_id, registro_nombre, descripcion,
            json.dumps(datos_anteriores) if datos_anteriores else None,
            json.dumps(datos_nuevos) if datos_nuevos else None,
            ip_address
        )


def limpiar_datos_sensibles(datos: dict) -> dict:
    if not datos:
        return datos
    datos_limpio = dict(datos)
    campos_sensibles = ['password', 'password_hash', 'hashed_password', 'token', 'access_token']
    for campo in campos_sensibles:
        if campo in datos_limpio:
            datos_limpio[campo] = '***'
    return datos_limpio
