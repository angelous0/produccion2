# Authentication dependencies and helpers
import os
import json
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from jose import JWTError, jwt
from db import get_pool

SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'tu-clave-secreta-muy-segura-cambiar-en-produccion-2024')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM prod_usuarios WHERE id = $1 AND activo = true", user_id)
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
        return dict(user)

async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except:
        return None

def check_permission(user: dict, tabla: str, accion: str) -> bool:
    if not user:
        return False
    rol = user.get('rol', 'lectura')
    if rol == 'admin':
        return True
    if rol == 'lectura':
        return accion == 'ver'
    permisos = user.get('permisos', {})
    if isinstance(permisos, str):
        permisos = json.loads(permisos) if permisos else {}
    tabla_permisos = permisos.get(tabla, {})
    return tabla_permisos.get(accion, False)

def require_permission(tabla: str, accion: str):
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        if not check_permission(current_user, tabla, accion):
            raise HTTPException(status_code=403, detail=f"No tienes permiso para {accion} en {tabla}")
        return current_user
    return permission_checker

def verificar_permiso(user: dict, tabla: str, accion: str) -> bool:
    if user['rol'] == 'admin':
        return True
    if user['rol'] == 'lectura':
        return accion == 'ver'
    permisos = user.get('permisos', {})
    if isinstance(permisos, str):
        permisos = json.loads(permisos) if permisos else {}
    permisos_tabla = permisos.get(tabla, {})
    return permisos_tabla.get(accion, False)

def require_permiso(tabla: str, accion: str):
    async def check_perm(current_user: dict = Depends(get_current_user)):
        if not verificar_permiso(current_user, tabla, accion):
            raise HTTPException(status_code=403, detail=f"No tienes permiso para {accion} en {tabla}")
        return current_user
    return check_perm
