# Routes package
from .inventario import router as inventario_router
from .rollos import router as rollos_router
from .ordenes import router as ordenes_router
from .consumo import router as consumo_router
from .servicios import router as servicios_router
from .cierre import router as cierre_router
from .reportes import router as reportes_router

__all__ = [
    'inventario_router',
    'rollos_router',
    'ordenes_router',
    'consumo_router',
    'servicios_router',
    'cierre_router',
    'reportes_router',
]
