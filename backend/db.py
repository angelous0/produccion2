# Database connection pool management
import asyncpg
import asyncio
import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Conexión única - NO usar fallbacks
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL no configurado en .env")

pool = None

async def get_pool():
    global pool
    if pool is None or pool._closed:
        # Pool tuneado para evitar saturación con polling del frontend.
        # max_size 25 (antes 10): el dashboard hace muchos GETs en paralelo
        #   (en-proceso, wip-etapa, atrasados, filtros, alertas, etc.),
        #   y con múltiples tabs abiertas el pool de 10 se saturaba.
        # min_size 5: arranca con conexiones listas, evita latencia inicial.
        # command_timeout 60s: una query lenta no cuelga la conexión para
        #   siempre; se libera y el cliente recibe timeout limpio.
        pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=5,
            max_size=25,
            timeout=60,
            command_timeout=60,
            max_inactive_connection_lifetime=30,
            server_settings={
                "search_path": "produccion,public",
                # lock_timeout en cada conexión: si una query queda esperando
                # un lock (típico durante deploy con migraciones), no cuelga
                # más de 5 segundos.
                "lock_timeout": "5000",
                "idle_in_transaction_session_timeout": "60000",
            },
        )
    return pool

@asynccontextmanager
async def safe_acquire(max_retries=2):
    """Adquiere una conexión con reintentos automáticos ante desconexiones de BD remota."""
    global pool
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            p = await get_pool()
            async with p.acquire() as conn:
                yield conn
                return
        except (asyncpg.exceptions.ConnectionDoesNotExistError,
                asyncpg.exceptions.InterfaceError,
                OSError) as e:
            last_error = e
            logger.warning(f"Conexión BD perdida (intento {attempt+1}/{max_retries+1}): {e}")
            # Forzar recreación del pool
            try:
                if pool and not pool._closed:
                    await pool.close()
            except Exception:
                pass
            pool = None
            if attempt < max_retries:
                await asyncio.sleep(0.5 * (attempt + 1))
    raise last_error

async def close_pool():
    global pool
    if pool:
        await pool.close()
        pool = None
