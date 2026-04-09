from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import asyncpg
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from uuid import uuid4

from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
import json
import io
from passlib.context import CryptContext
from jose import JWTError, jwt
from models import ReorderRequest

# Import all routers
from routes.auth import router as auth_router
from routes.catalogos import router as catalogos_router
from routes.inventario_main import router as inventario_main_router
from routes.modelos import router as modelos_router
from routes.registros_main import router as registros_main_router
from routes.movimientos import router as movimientos_router
from routes.stats_reportes import router as stats_reportes_router
from routes.costos import router as costos_router
from routes.cierre import router as cierre_legacy_router
from routes.inventario import router as inventario_router
from routes.rollos import router as rollos_router
from routes.ordenes import router as ordenes_router
from routes.consumo import router as consumo_router
from routes.servicios import router as servicios_router
# cierre_v2 deprecado - toda la logica se consolido en cierre.py (cierre_legacy_router)
from routes.reportes import router as reportes_router
from routes.integracion_finanzas import router as integracion_finanzas_router
from routes.bom import router as bom_router
from routes.control_produccion import router as control_produccion_router
from routes.reportes_produccion import router as reportes_produccion_router
from routes.trazabilidad import router as trazabilidad_router, init_trazabilidad_tables
from routes.transferencias_linea import router as transferencias_linea_router, init_transferencias_tables
from routes.auditoria import router as auditoria_router, init_audit_tables
from routes.conversacion import router as conversacion_router
from routes.distribucion_pt import router as distribucion_pt_router, init_distribucion_pt_tables
from routes.kardex_pt import router as kardex_pt_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# PostgreSQL connection - Use shared pool from db.py
from db import get_pool, close_pool, safe_acquire

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'tu-clave-secreta-muy-segura-cambiar-en-produccion-2024')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8760  # 1 año - uso interno, sin expiración práctica

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer(auto_error=False)

# Pool is now managed by db.py - removed local pool variable


# ==================== DDL HELPERS (TABLAS NUEVAS) ====================

async def ensure_bom_tables():
    """Crea tablas nuevas necesarias para BOM (sin modificar tablas existentes).

    Nota: no se crean FKs porque el resto del proyecto no las usa.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Tabla relación Modelo ↔ Tallas
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS prod_modelo_tallas (
                id VARCHAR PRIMARY KEY,
                modelo_id VARCHAR NOT NULL,
                talla_id VARCHAR NOT NULL,
                activo BOOLEAN DEFAULT TRUE,
                orden INT DEFAULT 10,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_modelo_tallas_modelo ON prod_modelo_tallas(modelo_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_modelo_tallas_talla ON prod_modelo_tallas(talla_id)"
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_modelo_talla_activo
            ON prod_modelo_tallas(modelo_id, talla_id)
            WHERE activo = TRUE
            """
        )

        # Tabla BOM por modelo (talla_id NULL = general, talla_id definido = por talla)
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS prod_modelo_bom_linea (
                id VARCHAR PRIMARY KEY,
                modelo_id VARCHAR NOT NULL,
                inventario_id VARCHAR NOT NULL,
                talla_id VARCHAR NULL,
                unidad_base VARCHAR DEFAULT 'PRENDA',
                cantidad_base NUMERIC(14,4) NOT NULL,
                orden INT DEFAULT 10,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bom_modelo_id ON prod_modelo_bom_linea(modelo_id)"
        )
        # Si la tabla ya existía de antes, aseguramos columnas nuevas sin romper datos
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS orden INT DEFAULT 10")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS bom_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS tipo_componente VARCHAR DEFAULT 'TELA'")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS merma_pct NUMERIC(5,2) DEFAULT 0")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS cantidad_total NUMERIC(14,4) NULL")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS es_opcional BOOLEAN DEFAULT FALSE")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS etapa_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelo_bom_linea ADD COLUMN IF NOT EXISTS observaciones TEXT NULL")

        # Tabla cabecera BOM
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_bom_cabecera (
                id VARCHAR PRIMARY KEY,
                modelo_id VARCHAR NOT NULL,
                codigo VARCHAR,
                version INT NOT NULL DEFAULT 1,
                estado VARCHAR NOT NULL DEFAULT 'BORRADOR',
                vigente_desde TIMESTAMP NULL,
                vigente_hasta TIMESTAMP NULL,
                observaciones TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_bom_cab_modelo ON prod_bom_cabecera(modelo_id)")
        await conn.execute("ALTER TABLE prod_bom_cabecera ADD COLUMN IF NOT EXISTS nombre VARCHAR NULL")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_bom_linea_bom_id ON prod_modelo_bom_linea(bom_id)")

        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bom_inventario_id ON prod_modelo_bom_linea(inventario_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bom_talla_id ON prod_modelo_bom_linea(talla_id)"
        )
        # Old constraint was too restrictive - needs to include bom_id for multiple versions
        await conn.execute("DROP INDEX IF EXISTS uq_bom_linea_activo")
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_bom_linea_activo_v2
            ON prod_modelo_bom_linea(bom_id, inventario_id, COALESCE(talla_id, '__NULL__'))
            WHERE activo = TRUE
            """
        )


    # Asegurar columnas nuevas en prod_registros
    async with pool.acquire() as conn:
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS observaciones TEXT")
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS skip_validacion_estado BOOLEAN DEFAULT FALSE")

        # Tabla de motivos de incidencia (catálogo administrable)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_motivos_incidencia (
                id VARCHAR PRIMARY KEY,
                nombre VARCHAR NOT NULL UNIQUE,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        # Seed defaults si tabla vacía
        count = await conn.fetchval("SELECT COUNT(*) FROM prod_motivos_incidencia")
        if count == 0:
            defaults = ['Falta Material', 'Falta Avíos', 'Retraso Taller', 'Calidad', 'Cambio Prioridad', 'Sin Capacidad', 'Reprogramación', 'Otro']
            for nombre in defaults:
                await conn.execute(
                    "INSERT INTO prod_motivos_incidencia (id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    str(uuid.uuid4()), nombre
                )

        # Agregar columna paraliza a incidencias existentes
        await conn.execute("ALTER TABLE prod_incidencia ADD COLUMN IF NOT EXISTS paraliza BOOLEAN DEFAULT FALSE")
        await conn.execute("ALTER TABLE prod_incidencia ADD COLUMN IF NOT EXISTS paralizacion_id VARCHAR")
        await conn.execute("ALTER TABLE prod_incidencia ADD COLUMN IF NOT EXISTS comentario_resolucion TEXT")
        # Expandir columna tipo de varchar(30) a VARCHAR sin limite
        await conn.execute("ALTER TABLE prod_incidencia ALTER COLUMN tipo TYPE VARCHAR")
        await conn.execute("ALTER TABLE prod_incidencia ALTER COLUMN usuario TYPE VARCHAR")

        # Tabla de conversacion/hilo por registro
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_conversacion (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                mensaje_padre_id VARCHAR,
                autor VARCHAR NOT NULL,
                mensaje TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        await conn.execute("ALTER TABLE prod_conversacion ADD COLUMN IF NOT EXISTS estado VARCHAR DEFAULT 'normal'")
        await conn.execute("ALTER TABLE prod_conversacion ADD COLUMN IF NOT EXISTS fijado BOOLEAN DEFAULT FALSE")

        # Avance porcentaje en servicios y movimientos
        await conn.execute("ALTER TABLE prod_servicios_produccion ADD COLUMN IF NOT EXISTS usa_avance_porcentaje BOOLEAN DEFAULT FALSE")
        await conn.execute("ALTER TABLE prod_movimientos_produccion ADD COLUMN IF NOT EXISTS avance_porcentaje INTEGER")
        await conn.execute("ALTER TABLE prod_movimientos_produccion ADD COLUMN IF NOT EXISTS avance_updated_at TIMESTAMP")
        # Historial de avances
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS produccion.prod_avance_historial (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                movimiento_id VARCHAR NOT NULL,
                avance_porcentaje INTEGER NOT NULL,
                usuario VARCHAR,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)


# ==================== FASE 2: Tablas de Reservas y Requerimiento ====================
    return pool
async def ensure_fase2_tables():
    """Crea las tablas necesarias para Fase 2: Reservas + Requerimiento MP"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1) prod_registro_tallas: Cantidades reales por talla (normalizado)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_registro_tallas (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                talla_id VARCHAR NOT NULL,
                cantidad_real INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_registro_tallas_registro ON prod_registro_tallas(registro_id)"
        )
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_registro_talla ON prod_registro_tallas(registro_id, talla_id)"
        )

        # 2) prod_registro_requerimiento_mp: Resultado de explosión BOM
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_registro_requerimiento_mp (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                item_id VARCHAR NOT NULL,
                talla_id VARCHAR NULL,
                cantidad_requerida NUMERIC(14,4) NOT NULL DEFAULT 0,
                cantidad_reservada NUMERIC(14,4) NOT NULL DEFAULT 0,
                cantidad_consumida NUMERIC(14,4) NOT NULL DEFAULT 0,
                estado VARCHAR NOT NULL DEFAULT 'PENDIENTE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_req_mp_registro ON prod_registro_requerimiento_mp(registro_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_req_mp_item ON prod_registro_requerimiento_mp(item_id)"
        )
        # Unique index con COALESCE para manejar talla_id NULL
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_req_mp_registro_item_talla
            ON prod_registro_requerimiento_mp(registro_id, item_id, COALESCE(talla_id, '__NULL__'))
        """)

        # 3) prod_inventario_reservas: Cabecera de reservas
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_inventario_reservas (
                id VARCHAR PRIMARY KEY,
                registro_id VARCHAR NOT NULL,
                estado VARCHAR NOT NULL DEFAULT 'ACTIVA',
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reservas_registro ON prod_inventario_reservas(registro_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reservas_estado ON prod_inventario_reservas(estado)"
        )

        # 4) prod_inventario_reservas_linea: Líneas de reservas
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS prod_inventario_reservas_linea (
                id VARCHAR PRIMARY KEY,
                reserva_id VARCHAR NOT NULL,
                item_id VARCHAR NOT NULL,
                talla_id VARCHAR NULL,
                cantidad_reservada NUMERIC(14,4) NOT NULL DEFAULT 0,
                cantidad_liberada NUMERIC(14,4) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reservas_linea_reserva ON prod_inventario_reservas_linea(reserva_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reservas_linea_item ON prod_inventario_reservas_linea(item_id)"
        )

        # 5) Agregar talla_id a prod_inventario_salidas si no existe
        await conn.execute(
            "ALTER TABLE prod_inventario_salidas ADD COLUMN IF NOT EXISTS talla_id VARCHAR NULL"
        )

        # 6) Agregar ignorar_alerta_stock a prod_inventario si no existe
        await conn.execute(
            "ALTER TABLE prod_inventario ADD COLUMN IF NOT EXISTS ignorar_alerta_stock BOOLEAN DEFAULT FALSE"
        )

        # 7) Línea de negocio en modelos, registros, ingresos y salidas
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS linea_negocio_id INTEGER NULL")
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS linea_negocio_id INTEGER NULL")
        await conn.execute("ALTER TABLE prod_inventario_ingresos ADD COLUMN IF NOT EXISTS linea_negocio_id INTEGER NULL")
        await conn.execute("ALTER TABLE prod_inventario_salidas ADD COLUMN IF NOT EXISTS linea_negocio_id INTEGER NULL")

        # 8) Jerarquía Base → Modelo (variante) → Registro
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS base_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS hilo_especifico_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS muestra_modelo_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_modelos ADD COLUMN IF NOT EXISTS muestra_base_id VARCHAR NULL")



app = FastAPI()

# Handler global para desconexiones de BD remota
@app.exception_handler(asyncpg.exceptions.ConnectionDoesNotExistError)
async def db_connection_error_handler(request, exc):
    import logging
    logging.warning(f"BD remota desconectada en {request.url.path}: {exc}")
    import db as _db
    try:
        if _db.pool and not _db.pool._closed:
            await _db.pool.close()
    except Exception:
        pass
    _db.pool = None
    return JSONResponse(status_code=503, content={"detail": "Conexión con la base de datos perdida. Intente de nuevo."})

@app.exception_handler(asyncpg.exceptions.InterfaceError)
async def db_interface_error_handler(request, exc):
    import logging
    logging.warning(f"Error interfaz BD en {request.url.path}: {exc}")
    import db as _db
    try:
        if _db.pool and not _db.pool._closed:
            await _db.pool.close()
    except Exception:
        pass
    _db.pool = None
    return JSONResponse(status_code=503, content={"detail": "Error de conexión con la base de datos. Intente de nuevo."})

api_router = APIRouter(prefix="/api")

# ==================== AUTENTICACIÓN ====================

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
    """Obtiene el usuario actual si hay token, sino retorna None"""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except Exception:
        return None

def check_permission(user: dict, tabla: str, accion: str) -> bool:
    """Verifica si el usuario tiene permiso para una acción en una tabla"""
    if not user:
        return False
    
    rol = user.get('rol', 'lectura')
    
    # Admin tiene todos los permisos
    if rol == 'admin':
        return True
    
    # Lectura solo puede ver
    if rol == 'lectura':
        return accion == 'ver'
    
    # Usuario: verificar permisos personalizados
    permisos = user.get('permisos', {})
    if isinstance(permisos, str):
        permisos = json.loads(permisos) if permisos else {}
    
    tabla_permisos = permisos.get(tabla, {})
    return tabla_permisos.get(accion, False)

def require_permission(tabla: str, accion: str):
    """Decorador para requerir permisos en endpoints"""
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        if not check_permission(current_user, tabla, accion):
            raise HTTPException(status_code=403, detail=f"No tienes permiso para {accion} en {tabla}")
        return current_user
    return permission_checker

# ==================== MODELOS PYDANTIC ====================

# Modelos de Usuario
class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    nombre_completo: Optional[str] = None
    rol: str = "usuario"
    permisos: dict = {}

class UserUpdate(BaseModel):
    email: Optional[str] = None
    nombre_completo: Optional[str] = None
    rol: Optional[str] = None
    permisos: Optional[dict] = None
    activo: Optional[bool] = None

class UserChangePassword(BaseModel):
    current_password: str
    new_password: str

class MarcaBase(BaseModel):
    nombre: str
    orden: int = 0

class MarcaCreate(MarcaBase):
    pass

class Marca(MarcaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TipoBase(BaseModel):
    nombre: str
    marca_ids: List[str] = []
    orden: int = 0

class TipoCreate(TipoBase):
    pass

class Tipo(TipoBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EntalleBase(BaseModel):
    nombre: str
    tipo_ids: List[str] = []
    orden: int = 0

class EntalleCreate(EntalleBase):
    pass

class Entalle(EntalleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TelaBase(BaseModel):
    nombre: str
    entalle_ids: List[str] = []
    orden: int = 0

class TelaCreate(TelaBase):
    pass

class Tela(TelaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HiloBase(BaseModel):
    nombre: str
    tela_ids: List[str] = []
    orden: int = 0

class HiloCreate(HiloBase):
    pass

class Hilo(HiloBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TallaBase(BaseModel):
    nombre: str
    orden: int = 0

class TallaCreate(TallaBase):
    pass

class Talla(TallaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ColorGeneralBase(BaseModel):
    nombre: str
    orden: int = 0

class ColorGeneralCreate(ColorGeneralBase):
    pass

class ColorGeneral(ColorGeneralBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ColorBase(BaseModel):
    nombre: str
    codigo_hex: str = ""
    color_general_id: Optional[str] = None
    orden: int = 0

class ColorCreate(ColorBase):
    pass

class Color(ColorBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Hilos Específicos (catálogo independiente vinculado a registros)
class HiloEspecificoBase(BaseModel):
    nombre: str
    codigo: str = ""
    color: str = ""
    descripcion: str = ""
    orden: int = 0

class HiloEspecificoCreate(HiloEspecificoBase):
    pass

class HiloEspecifico(HiloEspecificoBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EtapaRuta(BaseModel):
    nombre: str
    servicio_id: Optional[str] = None
    orden: float = 0
    obligatorio: bool = True
    aparece_en_estado: bool = True
    es_cierre: bool = False

class RutaProduccionBase(BaseModel):
    nombre: str
    descripcion: str = ""
    etapas: List[EtapaRuta] = []

class RutaProduccionCreate(RutaProduccionBase):
    pass

class RutaProduccion(RutaProduccionBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ModeloBase(BaseModel):
    nombre: str
    marca_id: str
    tipo_id: str
    entalle_id: str
    tela_id: str
    hilo_id: str
    ruta_produccion_id: Optional[str] = None
    servicios_ids: List[str] = []
    pt_item_id: Optional[str] = None
    linea_negocio_id: Optional[int] = None
    base_id: Optional[str] = None
    hilo_especifico_id: Optional[str] = None
    muestra_modelo_id: Optional[str] = None
    muestra_base_id: Optional[str] = None

class ModeloCreate(ModeloBase):
    pass

class Modelo(ModeloBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TallaCantidadItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    talla_id: str
    nombre: Optional[str] = ""
    talla_nombre: Optional[str] = ""
    cantidad: int = 0


# ==================== BOM / RECETA ====================

class ModeloTallaBase(BaseModel):
    talla_id: str
    orden: int = 10
    activo: bool = True

class ModeloTallaCreate(ModeloTallaBase):
    pass

class ModeloTallaUpdate(BaseModel):
    orden: Optional[int] = None
    activo: Optional[bool] = None

class ModeloTallaOut(BaseModel):
    id: str
    modelo_id: str
    talla_id: str
    talla_nombre: Optional[str] = None
    orden: int = 10
    activo: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ModeloBomLineaBase(BaseModel):
    inventario_id: str
    talla_id: Optional[str] = None  # NULL = general
    cantidad_base: float
    activo: bool = True

class ModeloBomLineaCreate(ModeloBomLineaBase):
    pass

class ModeloBomLineaUpdate(BaseModel):
    inventario_id: Optional[str] = None
    talla_id: Optional[str] = None
    cantidad_base: Optional[float] = None
    activo: Optional[bool] = None

class ModeloBomLineaOut(BaseModel):
    id: str
    modelo_id: str
    inventario_id: str
    inventario_nombre: Optional[str] = None
    inventario_codigo: Optional[str] = None
    talla_id: Optional[str] = None
    talla_nombre: Optional[str] = None
    unidad_base: Optional[str] = None
    cantidad_base: float
    orden: Optional[int] = None
    activo: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    talla_nombre: str = ""
    cantidad: int = 0

class ColorDistribucion(BaseModel):
    color_id: str
    color_nombre: str = ""
    cantidad: int = 0

class TallaConColores(BaseModel):
    talla_id: str
    talla_nombre: str = ""
    cantidad_total: int = 0
    colores: List[ColorDistribucion] = []

class RegistroBase(BaseModel):
    n_corte: str
    modelo_id: str
    curva: str = ""
    estado: str = "Para Corte"
    urgente: bool = False
    hilo_especifico_id: Optional[str] = None
    pt_item_id: Optional[str] = None
    empresa_id: Optional[int] = 7
    observaciones: Optional[str] = None
    fecha_entrega_final: Optional[str] = None
    linea_negocio_id: Optional[int] = None

class RegistroCreate(RegistroBase):
    tallas: List[TallaCantidadItem] = []
    distribucion_colores: List[TallaConColores] = []

class Registro(RegistroBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha_creacion: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tallas: List[TallaCantidadItem] = []
    distribucion_colores: List[TallaConColores] = []

ESTADOS_PRODUCCION = [
    "Para Corte", "Corte", "Para Costura", "Costura", "Para Atraque", "Atraque",
    "Para Lavandería", "Muestra Lavanderia", "Lavandería", "Para Acabado",
    "Acabado", "Almacén PT", "Tienda"
]

class ServicioBase(BaseModel):
    nombre: str
    descripcion: str = ""
    tarifa: float = 0
    orden: Optional[int] = None
    usa_avance_porcentaje: bool = False

class ServicioCreate(ServicioBase):
    pass

class Servicio(ServicioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PersonaServicio(BaseModel):
    servicio_id: str
    tarifa: float = 0

class PersonaBase(BaseModel):
    nombre: str
    tipo: str = "externo"
    telefono: str = ""
    email: str = ""
    direccion: str = ""
    servicios: List[PersonaServicio] = []
    activo: bool = True
    tipo_persona: str = "EXTERNO"
    unidad_interna_id: Optional[int] = None

class PersonaCreate(PersonaBase):
    pass

class Persona(PersonaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MovimientoBase(BaseModel):
    registro_id: str
    servicio_id: str
    persona_id: str
    cantidad_enviada: int = 0
    cantidad_recibida: int = 0
    tarifa_aplicada: float = 0
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    fecha_esperada_movimiento: Optional[str] = None
    responsable_movimiento: Optional[str] = None
    observaciones: str = ""
    avance_porcentaje: Optional[int] = None

class MovimientoCreate(MovimientoBase):
    pass

class Movimiento(MovimientoBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    diferencia: int = 0
    costo_calculado: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ItemInventarioBase(BaseModel):
    codigo: str
    nombre: str
    descripcion: str = ""
    categoria: str = "Otros"
    unidad_medida: str = "unidad"
    stock_minimo: int = 0
    control_por_rollos: bool = False
    linea_negocio_id: Optional[int] = None

class ItemInventarioCreate(ItemInventarioBase):
    pass

class ItemInventario(ItemInventarioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_actual: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class IngresoInventarioBase(BaseModel):
    item_id: str
    cantidad: float
    costo_unitario: float = 0.0
    proveedor: str = ""
    numero_documento: str = ""
    observaciones: str = ""

class IngresoInventarioCreate(IngresoInventarioBase):
    rollos: List[dict] = []
    empresa_id: int = 7
    linea_negocio_id: Optional[int] = None

class IngresoInventario(IngresoInventarioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cantidad_disponible: float = 0

class SalidaInventarioBase(BaseModel):
    item_id: str
    cantidad: float
    registro_id: Optional[str] = None
    talla_id: Optional[str] = None
    observaciones: str = ""
    rollo_id: Optional[str] = None

class SalidaInventarioCreate(SalidaInventarioBase):
    linea_negocio_id: Optional[int] = None

class SalidaInventario(SalidaInventarioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    costo_total: float = 0.0
    detalle_fifo: List[dict] = []


# ==================== FASE 2: Modelos Pydantic ====================

class RegistroTallaBase(BaseModel):
    talla_id: str
    cantidad_real: int = 0

class RegistroTallaCreate(RegistroTallaBase):
    pass

class RegistroTallaUpdate(BaseModel):
    cantidad_real: int

class RegistroTallaBulkUpdate(BaseModel):
    tallas: List[RegistroTallaBase]

class RequerimientoMPOut(BaseModel):
    id: str
    registro_id: str
    item_id: str
    item_codigo: Optional[str] = None
    item_nombre: Optional[str] = None
    item_unidad: Optional[str] = None
    control_por_rollos: bool = False
    talla_id: Optional[str] = None
    talla_nombre: Optional[str] = None
    cantidad_requerida: float
    cantidad_reservada: float
    cantidad_consumida: float
    pendiente_reservar: float = 0
    pendiente_consumir: float = 0
    estado: str

class ReservaLineaInput(BaseModel):
    item_id: str
    talla_id: Optional[str] = None
    cantidad: float

class ReservaCreateInput(BaseModel):
    lineas: List[ReservaLineaInput]

class LiberarReservaLineaInput(BaseModel):
    item_id: str
    talla_id: Optional[str] = None
    cantidad: float

class LiberarReservaInput(BaseModel):
    lineas: List[LiberarReservaLineaInput]

class DisponibilidadItemOut(BaseModel):
    item_id: str
    item_codigo: Optional[str] = None
    item_nombre: Optional[str] = None
    stock_actual: float
    total_reservado: float
    disponible: float
    control_por_rollos: bool


class AjusteInventarioBase(BaseModel):
    item_id: str
    tipo: str
    cantidad: float
    motivo: str = ""
    observaciones: str = ""
    rollo_id: Optional[str] = None

class AjusteInventarioCreate(AjusteInventarioBase):
    pass

class AjusteInventario(AjusteInventarioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MermaBase(BaseModel):
    registro_id: str
    movimiento_id: str
    servicio_id: str
    persona_id: str
    cantidad: int = 0
    motivo: str = ""

class MermaCreate(MermaBase):
    pass

class Merma(MermaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GuiaRemisionBase(BaseModel):
    movimiento_id: str
    registro_id: str
    servicio_id: str
    persona_id: str
    cantidad: int = 0
    observaciones: str = ""

class GuiaRemisionCreate(GuiaRemisionBase):
    pass

class GuiaRemision(GuiaRemisionBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_guia: str = ""
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== HELPERS ====================

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

# ==================== HISTORIAL DE ACTIVIDAD ====================

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
    """Registra una actividad en el historial"""
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
    """Elimina campos sensibles de los datos para el historial"""
    if not datos:
        return datos
    datos_limpio = dict(datos)
    campos_sensibles = ['password', 'password_hash', 'hashed_password', 'token', 'access_token']
    for campo in campos_sensibles:
        if campo in datos_limpio:
            datos_limpio[campo] = '***'
    return datos_limpio

# ==================== STARTUP/SHUTDOWN ====================

@app.on_event("startup")
async def startup():
    await get_pool()
    await ensure_bom_tables()
    await ensure_fase2_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("ALTER TABLE prod_modelos DROP COLUMN IF EXISTS materiales")
        # Columnas para división de lote
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS dividido_desde_registro_id VARCHAR NULL")
        await conn.execute("ALTER TABLE prod_registros ADD COLUMN IF NOT EXISTS division_numero INT DEFAULT 0")
        # Migración: extender prod_registro_cierre con campos de auditoría y congelamiento
        for alter_sql in [
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS merma_qty NUMERIC DEFAULT 0",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS otros_costos NUMERIC DEFAULT 0",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS costo_unitario_final NUMERIC DEFAULT 0",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS cerrado_por VARCHAR",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS observacion_cierre TEXT",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS estado_cierre VARCHAR DEFAULT 'CERRADO'",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS snapshot_json JSONB",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS reabierto_por VARCHAR",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS reabierto_at TIMESTAMP",
            "ALTER TABLE prod_registro_cierre ADD COLUMN IF NOT EXISTS motivo_reapertura TEXT",
        ]:
            await conn.execute(alter_sql)
        # Fix: estandarizar empresa_id = 7 en todas las tablas de produccion
        for tabla in [
            'prod_inventario', 'prod_inventario_reservas', 'prod_inventario_reservas_linea',
            'prod_inventario_salidas', 'prod_registro_requerimiento_mp'
        ]:
            await conn.execute(f"UPDATE {tabla} SET empresa_id = 7 WHERE empresa_id != 7")
    # Tablas de trazabilidad unificada (fallados, arreglos)
    await init_trazabilidad_tables()
    # Tablas de transferencias internas entre lineas de negocio
    await init_transferencias_tables()
    # Tabla de auditoria
    await init_audit_tables()
    # Tablas de distribucion PT y conciliacion Odoo
    await init_distribucion_pt_tables()
    # Indices de performance para queries frecuentes
    pool2 = await get_pool()
    async with pool2.acquire() as conn:
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_movimientos_registro_id ON prod_movimientos_produccion(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_mermas_registro_id ON prod_mermas(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_fallados_registro_id ON prod_fallados(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_arreglos_registro_id ON prod_arreglos(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_registro_arreglos_registro_id ON prod_registro_arreglos(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_registro_arreglos_estado ON prod_registro_arreglos(estado)",
            "CREATE INDEX IF NOT EXISTS idx_incidencia_registro_id ON prod_incidencia(registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_registros_estado ON prod_registros(estado)",
            "CREATE INDEX IF NOT EXISTS idx_registros_fecha ON prod_registros(fecha_creacion DESC)",
            "CREATE INDEX IF NOT EXISTS idx_registros_modelo ON prod_registros(modelo_id)",
            "CREATE INDEX IF NOT EXISTS idx_registros_dividido ON prod_registros(dividido_desde_registro_id)",
            "CREATE INDEX IF NOT EXISTS idx_paralizacion_registro ON prod_paralizacion(registro_id, activa)",
            "CREATE INDEX IF NOT EXISTS idx_movimientos_fecha_esperada ON prod_movimientos_produccion(fecha_esperada_movimiento)",
            "CREATE INDEX IF NOT EXISTS idx_salidas_registro ON prod_inventario_salidas(registro_id)",
        ]:
            try:
                await conn.execute(idx_sql)
            except Exception:
                pass

@app.on_event("shutdown")
async def shutdown():
    await close_pool()

# ==================== CORS & ROUTER ====================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inventario_main_router)
app.include_router(catalogos_router)
app.include_router(auth_router)
app.include_router(modelos_router)
app.include_router(registros_main_router)
app.include_router(rollos_router)
app.include_router(ordenes_router)
app.include_router(consumo_router)
app.include_router(servicios_router)
app.include_router(movimientos_router)
app.include_router(stats_reportes_router)
app.include_router(api_router)
app.include_router(costos_router)
app.include_router(cierre_legacy_router)
app.include_router(inventario_router)
app.include_router(reportes_router)
app.include_router(integracion_finanzas_router)
app.include_router(bom_router)
app.include_router(control_produccion_router)
app.include_router(reportes_produccion_router)
app.include_router(trazabilidad_router)
app.include_router(transferencias_linea_router)
app.include_router(auditoria_router)
app.include_router(conversacion_router)
app.include_router(distribucion_pt_router)
app.include_router(kardex_pt_router)