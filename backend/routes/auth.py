"""Router for authentication, users, permissions, and activity log endpoints."""
import json
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from db import get_pool
from auth_utils import (
    get_current_user, get_current_user_optional, 
    verify_password, get_password_hash, create_access_token,
    verificar_permiso, require_permiso, check_permission, require_permission,
    SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_HOURS
)
from models import UserLogin, UserCreate, UserUpdate, UserChangePassword, AdminSetPassword
from helpers import registrar_actividad, limpiar_datos_sensibles, row_to_dict, parse_jsonb

router = APIRouter(prefix="/api")

@router.post("/auth/login")
async def login(credentials: UserLogin):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT * FROM prod_usuarios WHERE username = $1 AND activo = true",
            credentials.username
        )
        if not user or not verify_password(credentials.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
        
        # Crear token
        access_token = create_access_token(data={"sub": user['id']})
        
        user_dict = row_to_dict(user)
        user_dict.pop('password_hash', None)
        user_dict['permisos'] = parse_jsonb(user_dict.get('permisos'))
        
        # Registrar actividad de login
        await registrar_actividad(
            pool,
            usuario_id=user['id'],
            usuario_nombre=user['username'],
            tipo_accion="login",
            descripcion="Inicio de sesión exitoso"
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_dict
        }

@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = dict(current_user)
    user.pop('password_hash', None)
    user['permisos'] = parse_jsonb(user.get('permisos'))
    return user

@router.put("/auth/change-password")
async def change_password(data: UserChangePassword, current_user: dict = Depends(get_current_user)):
    if not verify_password(data.current_password, current_user['password_hash']):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        new_hash = get_password_hash(data.new_password)
        await conn.execute(
            "UPDATE prod_usuarios SET password_hash = $1, updated_at = NOW() WHERE id = $2",
            new_hash, current_user['id']
        )
    
    # Registrar actividad
    await registrar_actividad(
        pool,
        usuario_id=current_user['id'],
        usuario_nombre=current_user['username'],
        tipo_accion="cambio_password",
        tabla_afectada="usuarios",
        registro_id=current_user['id'],
        registro_nombre=current_user['username'],
        descripcion="Cambió su propia contraseña"
    )
    
    return {"message": "Contraseña actualizada correctamente"}

# ==================== ENDPOINTS USUARIOS (ADMIN) ====================

@router.get("/usuarios")
async def get_usuarios(current_user: dict = Depends(get_current_user)):
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores pueden ver usuarios")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_usuarios ORDER BY created_at DESC")
        result = []
        for r in rows:
            user = row_to_dict(r)
            user.pop('password_hash', None)
            user['permisos'] = parse_jsonb(user.get('permisos'))
            result.append(user)
        return result

@router.post("/usuarios")
async def create_usuario(input: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores pueden crear usuarios")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar que no exista
        existing = await conn.fetchrow("SELECT id FROM prod_usuarios WHERE username = $1", input.username)
        if existing:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
        
        if input.email:
            existing_email = await conn.fetchrow("SELECT id FROM prod_usuarios WHERE email = $1", input.email)
            if existing_email:
                raise HTTPException(status_code=400, detail="El email ya está registrado")
        
        user_id = str(uuid.uuid4())
        password_hash = get_password_hash(input.password)
        
        await conn.execute(
            """INSERT INTO prod_usuarios (id, username, email, password_hash, nombre_completo, rol, permisos, activo, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())""",
            user_id, input.username, input.email, password_hash, input.nombre_completo, 
            input.rol, json.dumps(input.permisos)
        )
        
        # Registrar actividad
        await registrar_actividad(
            pool,
            usuario_id=current_user['id'],
            usuario_nombre=current_user['username'],
            tipo_accion="crear",
            tabla_afectada="usuarios",
            registro_id=user_id,
            registro_nombre=input.username,
            descripcion=f"Creó usuario '{input.username}' con rol '{input.rol}'",
            datos_nuevos=limpiar_datos_sensibles({"username": input.username, "email": input.email, "nombre_completo": input.nombre_completo, "rol": input.rol})
        )
        
        return {"id": user_id, "username": input.username, "message": "Usuario creado correctamente"}

@router.put("/usuarios/{user_id}")
async def update_usuario(user_id: str, input: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores pueden editar usuarios")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM prod_usuarios WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
        # Guardar datos anteriores
        datos_anteriores = limpiar_datos_sensibles({
            "email": user['email'],
            "nombre_completo": user['nombre_completo'],
            "rol": user['rol'],
            "activo": user['activo'],
            "permisos": parse_jsonb(user.get('permisos'))
        })
        
        # Construir actualización dinámica
        updates = []
        params = []
        param_count = 0
        cambios = {}
        
        if input.email is not None:
            param_count += 1
            updates.append(f"email = ${param_count}")
            params.append(input.email)
            cambios['email'] = input.email
        if input.nombre_completo is not None:
            param_count += 1
            updates.append(f"nombre_completo = ${param_count}")
            params.append(input.nombre_completo)
            cambios['nombre_completo'] = input.nombre_completo
        if input.rol is not None:
            param_count += 1
            updates.append(f"rol = ${param_count}")
            params.append(input.rol)
            cambios['rol'] = input.rol
        if input.permisos is not None:
            param_count += 1
            updates.append(f"permisos = ${param_count}")
            params.append(json.dumps(input.permisos))
            cambios['permisos'] = input.permisos
        if input.activo is not None:
            param_count += 1
            updates.append(f"activo = ${param_count}")
            params.append(input.activo)
            cambios['activo'] = input.activo
        
        if updates:
            param_count += 1
            updates.append("updated_at = NOW()")
            params.append(user_id)
            query = f"UPDATE prod_usuarios SET {', '.join(updates)} WHERE id = ${param_count}"
            await conn.execute(query, *params)
            
            # Registrar actividad
            descripcion = f"Editó usuario '{user['username']}'"
            if 'activo' in cambios:
                descripcion = f"{'Activó' if cambios['activo'] else 'Desactivó'} usuario '{user['username']}'"
            elif 'permisos' in cambios:
                descripcion = f"Modificó permisos de '{user['username']}'"
            elif 'rol' in cambios:
                descripcion = f"Cambió rol de '{user['username']}' a '{cambios['rol']}'"
            
            await registrar_actividad(
                pool,
                usuario_id=current_user['id'],
                usuario_nombre=current_user['username'],
                tipo_accion="editar",
                tabla_afectada="usuarios",
                registro_id=user_id,
                registro_nombre=user['username'],
                descripcion=descripcion,
                datos_anteriores=datos_anteriores,
                datos_nuevos=limpiar_datos_sensibles(cambios)
            )
        
        return {"message": "Usuario actualizado correctamente"}

@router.delete("/usuarios/{user_id}")
async def delete_usuario(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores pueden eliminar usuarios")
    
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Obtener datos del usuario antes de eliminar
        user = await conn.fetchrow("SELECT * FROM prod_usuarios WHERE id = $1", user_id)
        if user:
            datos_anteriores = limpiar_datos_sensibles({
                "username": user['username'],
                "email": user['email'],
                "nombre_completo": user['nombre_completo'],
                "rol": user['rol']
            })
            
            await conn.execute("DELETE FROM prod_usuarios WHERE id = $1", user_id)
            
            # Registrar actividad
            await registrar_actividad(
                pool,
                usuario_id=current_user['id'],
                usuario_nombre=current_user['username'],
                tipo_accion="eliminar",
                tabla_afectada="usuarios",
                registro_id=user_id,
                registro_nombre=user['username'],
                descripcion=f"Eliminó usuario '{user['username']}'",
                datos_anteriores=datos_anteriores
            )
    return {"message": "Usuario eliminado"}

@router.put("/usuarios/{user_id}/set-password")
async def set_password_usuario(user_id: str, data: AdminSetPassword, current_user: dict = Depends(get_current_user)):
    """Admin establece una contraseña específica para un usuario"""
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores pueden cambiar contraseñas")
    
    if len(data.new_password) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT username FROM prod_usuarios WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
        new_hash = get_password_hash(data.new_password)
        await conn.execute("UPDATE prod_usuarios SET password_hash = $1, updated_at = NOW() WHERE id = $2", new_hash, user_id)
        
        # Registrar actividad
        await registrar_actividad(
            pool,
            usuario_id=current_user['id'],
            usuario_nombre=current_user['username'],
            tipo_accion="cambio_password_admin",
            tabla_afectada="usuarios",
            registro_id=user_id,
            registro_nombre=user['username'],
            descripcion=f"Cambió contraseña de '{user['username']}'"
        )
        
        return {"message": "Contraseña actualizada correctamente"}

@router.put("/usuarios/{user_id}/reset-password")
async def reset_password_usuario(user_id: str, current_user: dict = Depends(get_current_user)):
    """Resetea la contraseña a username + '123'"""
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores pueden resetear contraseñas")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT username FROM prod_usuarios WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
        # Nueva contraseña = username + "123"
        new_password = user['username'] + "123"
        new_hash = get_password_hash(new_password)
        await conn.execute("UPDATE prod_usuarios SET password_hash = $1, updated_at = NOW() WHERE id = $2", new_hash, user_id)
        
        return {"message": f"Contraseña reseteada. Nueva contraseña: {new_password}"}

@router.get("/permisos/estructura")
async def get_estructura_permisos():
    """Retorna la estructura de permisos disponibles agrupados por categoría"""
    # Obtener servicios de producción para permisos operativos
    pool = await get_pool()
    async with pool.acquire() as conn:
        servicios = await conn.fetch(
            "SELECT id, nombre FROM prod_servicios_produccion ORDER BY nombre"
        )
        servicios_list = [{"id": s["id"], "nombre": s["nombre"]} for s in servicios]

    return {
        "categorias": [
            {
                "nombre": "Produccion",
                "icono": "Play",
                "tablas": [
                    {"key": "registros", "nombre": "Registros", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "movimientos_produccion", "nombre": "Movimientos de Produccion", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "guias_remision", "nombre": "Guias de Remision", "acciones": ["ver", "crear", "editar", "eliminar"]},
                ]
            },
            {
                "nombre": "Inventario",
                "icono": "Package",
                "tablas": [
                    {"key": "inventario", "nombre": "Items de Inventario", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "inventario_ingresos", "nombre": "Ingresos", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "inventario_salidas", "nombre": "Salidas", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "inventario_ajustes", "nombre": "Ajustes", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "inventario_rollos", "nombre": "Rollos de Tela", "acciones": ["ver", "crear", "editar"]},
                ]
            },
            {
                "nombre": "Maestros",
                "icono": "Database",
                "tablas": [
                    {"key": "marcas", "nombre": "Marcas", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "tipos", "nombre": "Tipos", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "entalles", "nombre": "Entalles", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "telas", "nombre": "Telas", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "hilos", "nombre": "Hilos", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "hilos_especificos", "nombre": "Hilos Especificos", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "tallas", "nombre": "Tallas", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "colores", "nombre": "Colores", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "colores_generales", "nombre": "Colores Generales", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "modelos", "nombre": "Modelos", "acciones": ["ver", "crear", "editar", "eliminar"]},
                ]
            },
            {
                "nombre": "Configuracion",
                "icono": "Settings",
                "tablas": [
                    {"key": "servicios_produccion", "nombre": "Servicios", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "personas_produccion", "nombre": "Personas", "acciones": ["ver", "crear", "editar", "eliminar"]},
                    {"key": "rutas_produccion", "nombre": "Rutas de Produccion", "acciones": ["ver", "crear", "editar", "eliminar"]},
                ]
            },
            {
                "nombre": "Calidad",
                "icono": "AlertTriangle",
                "tablas": [
                    {"key": "merma", "nombre": "Merma", "acciones": ["ver", "crear", "editar", "eliminar"]},
                ]
            },
            {
                "nombre": "Reportes",
                "icono": "BarChart",
                "tablas": [
                    {"key": "kardex", "nombre": "Kardex", "acciones": ["ver"]},
                    {"key": "reporte_productividad", "nombre": "Productividad", "acciones": ["ver"]},
                    {"key": "reporte_movimientos", "nombre": "Reporte Movimientos", "acciones": ["ver"]},
                ]
            },
        ],
        "permisos_operativos": {
            "servicios_disponibles": servicios_list,
            # Nombres deben coincidir con los de las rutas de producción
            # (prod_rutas_produccion.etapas → campo 'nombre'). La comparación
            # en frontend (usePermissions.canChangeToState) ya normaliza sin
            # acentos por compatibilidad con registros antiguos.
            "estados_disponibles": [
                "Para Corte", "Corte", "Para Estampado", "Estampado",
                "Para Costura", "Costura", "Bordado",
                "Para Atraque", "Atraque", "Para Lavandería", "Muestra Lavandería", "Lavandería",
                "Para Acabado", "Acabado",
                "Almacén PT", "Tienda",
            ],
            "acciones_produccion": [
                {"key": "crear_movimientos", "nombre": "Crear movimientos de produccion"},
                {"key": "editar_movimientos", "nombre": "Editar/eliminar movimientos"},
                {"key": "cambiar_estados", "nombre": "Cambiar estados de registros"},
                {"key": "registrar_incidencias", "nombre": "Registrar incidencias/paralizaciones"},
                {"key": "resolver_incidencias", "nombre": "Resolver incidencias/paralizaciones"},
                {"key": "dividir_lotes", "nombre": "Dividir lotes"},
                {"key": "cerrar_lotes", "nombre": "Cerrar/finalizar lotes"},
            ],
            "acciones_inventario": [
                {"key": "crear_items", "nombre": "Crear items de inventario"},
                {"key": "registrar_ingresos", "nombre": "Registrar ingresos"},
                {"key": "dar_salida_mp", "nombre": "Dar salida de materia prima"},
                {"key": "reservar_materiales", "nombre": "Reservar materiales"},
                {"key": "ajustes_stock", "nombre": "Ajustes de stock"},
                {"key": "gestionar_bom", "nombre": "Gestionar BOM de modelos"},
            ],
        }
    }

# ==================== ENDPOINTS HISTORIAL DE ACTIVIDAD ====================

@router.get("/actividad")
async def get_actividad(
    usuario_id: str = None,
    tipo_accion: str = None,
    tabla_afectada: str = None,
    fecha_desde: str = None,
    fecha_hasta: str = None,
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene el historial de actividad con filtros"""
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores pueden ver el historial")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM prod_actividad_historial WHERE 1=1"
        params = []
        param_count = 0
        
        if usuario_id:
            param_count += 1
            query += f" AND usuario_id = ${param_count}"
            params.append(usuario_id)
        
        if tipo_accion:
            param_count += 1
            query += f" AND tipo_accion = ${param_count}"
            params.append(tipo_accion)
        
        if tabla_afectada:
            param_count += 1
            query += f" AND tabla_afectada = ${param_count}"
            params.append(tabla_afectada)
        
        if fecha_desde:
            param_count += 1
            query += f" AND created_at >= ${param_count}::timestamp"
            params.append(fecha_desde)
        
        if fecha_hasta:
            param_count += 1
            query += f" AND created_at <= ${param_count}::timestamp + interval '1 day'"
            params.append(fecha_hasta)
        
        # Contar total
        count_query = query.replace("SELECT *", "SELECT COUNT(*)")
        total = await conn.fetchval(count_query, *params)
        
        # Obtener registros con paginación
        query += f" ORDER BY created_at DESC LIMIT {limit} OFFSET {offset}"
        rows = await conn.fetch(query, *params)
        
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['datos_anteriores'] = parse_jsonb(d.get('datos_anteriores'))
            d['datos_nuevos'] = parse_jsonb(d.get('datos_nuevos'))
            result.append(d)
        
        return {
            "total": total,
            "items": result,
            "limit": limit,
            "offset": offset
        }

@router.get("/actividad/tipos")
async def get_tipos_actividad(current_user: dict = Depends(get_current_user)):
    """Retorna los tipos de actividad disponibles"""
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    return [
        {"value": "login", "label": "Inicio de Sesión", "icon": "LogIn", "color": "text-green-500"},
        {"value": "crear", "label": "Crear", "icon": "Plus", "color": "text-blue-500"},
        {"value": "editar", "label": "Editar", "icon": "Pencil", "color": "text-yellow-500"},
        {"value": "eliminar", "label": "Eliminar", "icon": "Trash2", "color": "text-red-500"},
        {"value": "cambio_password", "label": "Cambio de Contraseña", "icon": "Key", "color": "text-purple-500"},
        {"value": "cambio_password_admin", "label": "Cambio Contraseña (Admin)", "icon": "Shield", "color": "text-orange-500"},
    ]

@router.get("/actividad/tablas")
async def get_tablas_actividad(current_user: dict = Depends(get_current_user)):
    """Retorna las tablas que tienen actividad registrada"""
    if current_user['rol'] != 'admin':
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT tabla_afectada FROM prod_actividad_historial WHERE tabla_afectada IS NOT NULL ORDER BY tabla_afectada"
        )
        return [r['tabla_afectada'] for r in rows]

# ==================== ENDPOINTS MARCA ====================
