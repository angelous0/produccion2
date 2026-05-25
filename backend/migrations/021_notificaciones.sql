-- =====================================================================
-- 021_notificaciones.sql
-- =====================================================================
-- Sistema de notificaciones in-app (bell + badge en móvil/web).
--
-- Cada fila es una notificación dirigida a un público (audiencia).
-- El campo `leida_por` (JSONB array de user_id) sirve para saber por
-- usuario si la vio o no — así una misma notificación cubre a varios
-- usuarios sin tener que duplicar filas.
--
-- Para detectar qué notificaciones le tocan a un usuario se cruza:
--   - su rol contra audiencia.roles
--   - su servicio (si aplica) contra audiencia.servicios
--   - admin ve todo
-- =====================================================================

CREATE TABLE IF NOT EXISTS produccion.prod_notificaciones (
    id            VARCHAR PRIMARY KEY,
    -- 'arreglo_vencido' | 'incidencia_nueva' | 'movimiento_atrasado' | etc.
    tipo          VARCHAR NOT NULL,
    -- 'urgente' | 'atencion' | 'info' | 'ok'
    severidad     VARCHAR NOT NULL DEFAULT 'info',
    titulo        VARCHAR NOT NULL,
    mensaje       TEXT NOT NULL DEFAULT '',
    -- Deep link al evento. Cualquiera puede ser null si no aplica.
    registro_id   VARCHAR NULL,
    -- 'arreglo' | 'incidencia' | 'movimiento' | 'muestra' | 'mp' | ...
    entidad_tipo  VARCHAR NULL,
    entidad_id    VARCHAR NULL,
    -- Audiencia: { "roles": ["admin","supervisor_acabado"], "servicios": ["uuid",...] }
    -- Si está vacío, la ven todos los usuarios autenticados.
    audiencia     JSONB DEFAULT '{}'::jsonb,
    -- Array de user_id que ya marcaron la notificación como leída.
    leida_por     JSONB DEFAULT '[]'::jsonb,
    -- Origen (para auditoría/debug): 'trigger_sync' | 'cron' | 'manual'
    origen        VARCHAR DEFAULT 'trigger_sync',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_created
    ON produccion.prod_notificaciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_registro
    ON produccion.prod_notificaciones (registro_id);
CREATE INDEX IF NOT EXISTS idx_notif_tipo
    ON produccion.prod_notificaciones (tipo);
CREATE INDEX IF NOT EXISTS idx_notif_severidad
    ON produccion.prod_notificaciones (severidad);

-- Dedup helper: para que los triggers cron no creen duplicados
-- si el mismo arreglo sigue vencido durante días, usamos esta combinación
-- como "clave lógica" en aplicación (no DB constraint estricto).
CREATE INDEX IF NOT EXISTS idx_notif_dedup
    ON produccion.prod_notificaciones (tipo, entidad_tipo, entidad_id, created_at DESC);
