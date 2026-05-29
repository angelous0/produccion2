#!/usr/bin/env bash
#
# Backup diario de la DB Producción del ERP.
#
# Hace pg_dump de los schemas críticos (produccion, odoo), los comprime
# con gzip y guarda los últimos 14 días. Diseñado para correr desde
# cron en el VPS Hostinger (72.60.241.216).
#
# Instalación (en el VPS, como root o usuario con acceso a PostgreSQL):
#
#   1. Copiar este script a /opt/erp-backups/backup_db.sh
#      sudo mkdir -p /opt/erp-backups /var/backups/erp-textil
#      sudo cp backup_db.sh /opt/erp-backups/
#      sudo chmod +x /opt/erp-backups/backup_db.sh
#
#   2. Crear archivo de credenciales (modo 600 — solo root):
#      sudo tee /opt/erp-backups/.pgpass <<'EOF'
#      72.60.241.216:9595:datos:admin:admin
#      EOF
#      sudo chmod 600 /opt/erp-backups/.pgpass
#
#   3. Probar manualmente:
#      sudo /opt/erp-backups/backup_db.sh
#      ls -lh /var/backups/erp-textil/
#
#   4. Agregar al crontab para correr cada noche a las 03:00:
#      sudo crontab -e
#      # Agregar línea:
#      0 3 * * *  /opt/erp-backups/backup_db.sh >> /var/log/erp-backup.log 2>&1
#
#   5. Verificar que el cron lo agarró:
#      sudo crontab -l | grep backup_db
#
# Restauración (si necesitás recuperar un día):
#
#   gunzip -c /var/backups/erp-textil/produccion_2026-05-28.sql.gz | \
#     psql "postgres://admin:admin@72.60.241.216:9595/datos"
#
set -euo pipefail

# ---------- Configuración ----------
PG_HOST="${PG_HOST:-72.60.241.216}"
PG_PORT="${PG_PORT:-9595}"
PG_USER="${PG_USER:-admin}"
PG_DB="${PG_DB:-datos}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/erp-textil}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
SCHEMAS=(produccion odoo)
PGPASSFILE="${PGPASSFILE:-/opt/erp-backups/.pgpass}"
export PGPASSFILE

# ---------- Helpers ----------
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
mkdir -p "$BACKUP_DIR"

DATE_TAG=$(date '+%Y-%m-%d')
START_TS=$(date +%s)

# ---------- Backup por schema ----------
for schema in "${SCHEMAS[@]}"; do
    OUT="${BACKUP_DIR}/${schema}_${DATE_TAG}.sql.gz"
    log "Iniciando backup de schema=${schema} → ${OUT}"

    pg_dump \
        --host="$PG_HOST" \
        --port="$PG_PORT" \
        --username="$PG_USER" \
        --dbname="$PG_DB" \
        --schema="$schema" \
        --format=plain \
        --no-owner \
        --no-acl \
        --no-comments \
        | gzip -9 > "$OUT.tmp"

    mv "$OUT.tmp" "$OUT"
    SIZE=$(du -h "$OUT" | cut -f1)
    log "OK: $OUT ($SIZE)"
done

# ---------- Rotación (borra backups más viejos de RETENTION_DAYS) ----------
log "Rotando: borro backups con más de ${RETENTION_DAYS} días"
find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

ELAPSED=$(($(date +%s) - START_TS))
log "Backup completo. Tomó ${ELAPSED}s. Espacio libre: $(df -h "$BACKUP_DIR" | tail -1 | awk '{print $4}')"

# ---------- Verificación opcional ----------
# Listar los últimos 3 backups por schema (para detectar problemas)
for schema in "${SCHEMAS[@]}"; do
    log "Últimos 3 backups de ${schema}:"
    ls -lht "${BACKUP_DIR}"/${schema}_*.sql.gz 2>/dev/null | head -3 | awk '{print "  "$5" "$6" "$7" "$8" "$9}'
done
