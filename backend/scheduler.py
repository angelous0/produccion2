"""
Scheduler in-process para tareas periódicas del backend de Producción.

No usa librerías externas (apscheduler, celery): solo asyncio.
Se monta en el startup de FastAPI y vive mientras el proceso esté arriba.

Tareas activas:
  - Sync diario con Odoo a las 23:00 hora local (Lima — America/Lima)
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("scheduler")

# Hora del sync (Lima — UTC-5). Cambiar aquí si se quiere otra hora.
SYNC_HOUR_LIMA = 23   # 23:00 hora Lima
SYNC_MINUTE = 0
LIMA_OFFSET_HOURS = -5  # America/Lima no tiene DST


def _next_run_utc() -> datetime:
    """Calcula el próximo datetime en UTC en que se debe correr el sync."""
    now_utc = datetime.now(timezone.utc)
    lima_now = now_utc + timedelta(hours=LIMA_OFFSET_HOURS)
    target_lima = lima_now.replace(hour=SYNC_HOUR_LIMA, minute=SYNC_MINUTE,
                                   second=0, microsecond=0)
    if target_lima <= lima_now:
        target_lima += timedelta(days=1)
    return target_lima - timedelta(hours=LIMA_OFFSET_HOURS)  # back to UTC


async def _run_sync_odoo():
    """Ejecuta el sync llamando directo a la lógica del router (sin HTTP).

    Usa empresa_id=7 por defecto (Ambission). Si en el futuro hay multi-empresa,
    se debe iterar sobre cont_empresa.
    """
    try:
        # Import lazy para evitar circular imports
        from db import get_pool
        from routes.odoo_enriq import sync_odoo_productos

        # Simular un current_user con empresa_id=7
        fake_user = {"empresa_id": 7, "username": "scheduler"}

        logger.info("[scheduler] Ejecutando sync diario de Odoo…")
        result = await sync_odoo_productos(current_user=fake_user)
        logger.info(
            "[scheduler] Sync completado: %s nuevos · %s actualizados · %s segundos",
            result.get("nuevos"), result.get("actualizados"),
            result.get("duracion_segundos"),
        )
    except Exception as e:
        logger.error("[scheduler] Sync diario falló: %s", e, exc_info=True)


async def _scheduler_loop():
    """Loop infinito: duerme hasta el próximo run_at, ejecuta, repite."""
    logger.info("[scheduler] Iniciado. Próximo sync programado.")
    while True:
        try:
            next_utc = _next_run_utc()
            sleep_secs = (next_utc - datetime.now(timezone.utc)).total_seconds()
            sleep_secs = max(60, sleep_secs)  # mínimo 1 minuto de seguridad

            lima_repr = (next_utc + timedelta(hours=LIMA_OFFSET_HOURS)).strftime("%Y-%m-%d %H:%M")
            logger.info("[scheduler] Próximo sync: %s Lima (%.1f horas)",
                        lima_repr, sleep_secs / 3600)

            await asyncio.sleep(sleep_secs)
            await _run_sync_odoo()
        except asyncio.CancelledError:
            logger.info("[scheduler] Detenido.")
            return
        except Exception as e:
            logger.error("[scheduler] Loop error: %s — reintentando en 5 min", e)
            await asyncio.sleep(300)


_scheduler_task: Optional[asyncio.Task] = None


def start_scheduler():
    """Llamar desde el startup event de FastAPI."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.create_task(_scheduler_loop())


def stop_scheduler():
    """Llamar desde el shutdown event de FastAPI."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
