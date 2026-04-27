from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import asyncpg
import os
from pathlib import Path
from jose import jwt, JWTError
from db import get_pool


# Import all routers
from routes.auth import router as auth_router
from routes.catalogos import router as catalogos_router
from routes.inventario_main import router as inventario_main_router
from routes.modelos import router as modelos_router
from routes.registros_main import router as registros_main_router
from routes.registros_materiales import router as registros_materiales_router
from routes.registros_operaciones import router as registros_operaciones_router
from routes.movimientos import router as movimientos_router
from routes.stats_reportes import router as stats_reportes_router
from routes.costos import router as costos_router
from routes.cierre import router as cierre_legacy_router
from routes.rollos import router as rollos_router
from routes.ordenes import router as ordenes_router
from routes.consumo import router as consumo_router
from routes.servicios import router as servicios_router
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
from routes.import_excel import router as import_excel_router
from routes.salidas_libres import router as salidas_libres_router
from routes.muestras import router as muestras_router
from routes.odoo_enriq import router as odoo_enriq_router

# DDL startup migrations
from migrations.startup_ddl import (
    ensure_bom_tables, ensure_fase2_tables,
    ensure_startup_migrations, ensure_startup_indices,
    ensure_salidas_libres_tables, ensure_clasificacion_tables,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# PostgreSQL connection - Use shared pool from db.py
from db import get_pool, close_pool, safe_acquire

# Auth — auth_utils es la fuente única de verdad para JWT y permisos
import auth_utils  # noqa: F401 — asegura que SECRET_KEY se valide al iniciar

# Modelos Pydantic: definidos en models.py (fuente única de verdad)
# Helpers (row_to_dict, parse_jsonb, registrar_actividad): definidos en helpers.py



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


# ==================== STARTUP/SHUTDOWN ====================

@app.on_event("startup")
async def startup():
    await get_pool()
    # DDL: tablas BOM y Fase 2
    await ensure_bom_tables()
    await ensure_fase2_tables()
    # Migraciones ligeras (ALTER TABLE, seeds)
    await ensure_startup_migrations()
    # Tablas de módulos específicos
    await init_trazabilidad_tables()
    await init_transferencias_tables()
    await init_audit_tables()
    await init_distribucion_pt_tables()
    await ensure_salidas_libres_tables()
    await ensure_clasificacion_tables()
    # Índices de performance
    await ensure_startup_indices()
    # Scheduler in-process: sync diario con Odoo a las 23:00 Lima
    from scheduler import start_scheduler
    start_scheduler()

@app.on_event("shutdown")
async def shutdown():
    from scheduler import stop_scheduler
    stop_scheduler()
    await close_pool()

# ==================== CORS & ROUTER ====================

_cors_origins_raw = os.environ.get("CORS_ORIGINS", "*")
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

# allow_origins=["*"] + allow_credentials=True is invalid per CORS spec — browsers
# reject credentialed responses when the reflected origin is the literal "*".
# Use allow_origin_regex=r".*" so Starlette reflects the actual request origin
# instead of "*", satisfying both credentials and wildcard-origin requirements.
if _cors_origins == ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ==================== READ-ONLY ROLE ENFORCEMENT ====================
# Defensa en profundidad: bloquea toda mutación (POST/PUT/PATCH/DELETE) para usuarios
# con rol 'lectura', incluso si el frontend permitiera enviar la request.
# Se valida contra el JWT: decodifica, busca el usuario en BD, revisa el rol.
#
# Whitelist de paths que sí se permiten (mutaciones propias de la cuenta):
#   - /api/auth/*  → login, cambio de contraseña, refresh
_JWT_SECRET = os.environ.get('JWT_SECRET_KEY')
_JWT_ALG = "HS256"
_READ_ONLY_WRITE_WHITELIST_PREFIXES = (
    "/api/auth/",  # login, change-password, refresh
)
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def block_writes_for_readonly(request: Request, call_next):
    # Solo interceptar métodos mutantes
    if request.method not in _MUTATING_METHODS:
        return await call_next(request)

    path = request.url.path
    # Whitelisted paths pasan directo
    if any(path.startswith(p) for p in _READ_ONLY_WRITE_WHITELIST_PREFIXES):
        return await call_next(request)

    # Solo aplicar a rutas /api/*
    if not path.startswith("/api/"):
        return await call_next(request)

    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        # Sin token → las dependencias de autenticación del endpoint se encargan
        return await call_next(request)

    token = auth_header.split(None, 1)[1].strip()
    if not _JWT_SECRET:
        return await call_next(request)
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            return await call_next(request)
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT rol, activo FROM prod_usuarios WHERE id = $1", user_id
            )
        if row and row["activo"] and row["rol"] == "lectura":
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Acceso de solo lectura: tu usuario no puede modificar datos."
                },
            )
    except JWTError:
        # Token inválido → que el endpoint responda 401 como siempre
        pass
    except Exception:
        # Fallo de BD u otro — no bloqueamos, dejamos que la ruta maneje
        pass

    return await call_next(request)


app.include_router(inventario_main_router)
app.include_router(catalogos_router)
app.include_router(auth_router)
app.include_router(modelos_router)
app.include_router(import_excel_router)
app.include_router(registros_main_router)
app.include_router(registros_materiales_router)
app.include_router(registros_operaciones_router)
app.include_router(rollos_router)
app.include_router(ordenes_router)
app.include_router(consumo_router)
app.include_router(servicios_router)
app.include_router(movimientos_router)
app.include_router(stats_reportes_router)
app.include_router(costos_router)
app.include_router(cierre_legacy_router)
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
app.include_router(salidas_libres_router)
app.include_router(muestras_router)
app.include_router(odoo_enriq_router)

# ==================== HEALTH CHECK ====================

@app.get("/api/health")
async def health_check():
    try:
        async with safe_acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}
