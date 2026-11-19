#!/bin/sh
# Stellt eine Sicherung wieder her (ÜBERSCHREIBT die aktuellen Daten!).
# Aufruf: sh scripts/restore.sh backups/db_2026-12-01_0315.sql.gz [backups/uploads_2026-12-01_0315.tar.gz]
set -eu
cd "$(dirname "$0")/.."
DB_FILE=${1:?Pfad zur Datenbank-Sicherung angeben}
UPLOADS_FILE=${2:-}

printf "Aktuelle Daten werden überschrieben. Fortfahren? (ja/nein) "
read -r answer
[ "$answer" = "ja" ] || { echo "Abgebrochen."; exit 1; }

gunzip -c "$DB_FILE" | docker compose exec -T db psql -U wunschliste -q wunschliste
if [ -n "$UPLOADS_FILE" ]; then
  docker compose exec -T app sh -c 'rm -rf /data/uploads/* && tar -xzf - -C /data' < "$UPLOADS_FILE"
fi
echo "Wiederhergestellt. App neu starten: docker compose restart app"
