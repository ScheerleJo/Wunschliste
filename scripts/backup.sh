#!/bin/sh
# Sichert Datenbank und hochgeladene Bilder nach ./backups (relativ zum Projektordner).
# Aufruf im Projektordner:  sh scripts/backup.sh
# Täglich per Cron, z. B.:  15 3 * * * cd /opt/wunschbaum && sh scripts/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%d_%H%M)
KEEP_DAYS=${KEEP_DAYS:-30}
mkdir -p backups

echo "[$STAMP] Datenbank sichern …"
docker compose exec -T db pg_dump -U wunschliste --clean --if-exists wunschliste | gzip > "backups/db_$STAMP.sql.gz"

echo "[$STAMP] Bilder sichern …"
docker compose exec -T app tar -czf - -C /data uploads > "backups/uploads_$STAMP.tar.gz"

echo "[$STAMP] Sicherungen älter als $KEEP_DAYS Tage entfernen …"
find backups -name 'db_*.sql.gz' -mtime +"$KEEP_DAYS" -exec rm {} \;
find backups -name 'uploads_*.tar.gz' -mtime +"$KEEP_DAYS" -exec rm {} \;

echo "[$STAMP] Fertig: backups/db_$STAMP.sql.gz, backups/uploads_$STAMP.tar.gz"
