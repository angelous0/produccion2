from fastapi import FastAPI
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import asyncpg
import os
from pathlib import Path


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

@app.on_event("shutdown")
async def shutdown():
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

# ==================== HEALTH CHECK ====================

@app.get("/api/health")
async def health_check():
    try:
        async with safe_acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}
