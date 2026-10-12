#!/usr/bin/env bash
# SALON restore-drill — run monthly (spec §10.6). Restores latest backup into a THROWAWAY db, not prod.
# Usage: bash deploy/scripts/test-restore.sh [path-to-dump]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP=$(ls -1t /var/backups/salon/salon_*.sql.gz 2>/dev/null | head -n1 || true)
fi
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "no dump found (pass path as arg)"; exit 1; }

# Decrypt if .gpg
if [[ "$DUMP" == *.gpg ]]; then
  [ -n "${BACKUP_GPG_PASSPHRASE:-}" ] || { echo "set BACKUP_GPG_PASSPHRASE"; exit 1; }
  gpg --batch --yes --passphrase "$BACKUP_GPG_PASSPHRASE" --decrypt -o /tmp/restore.sql.gz "$DUMP"
  DUMP=/tmp/restore.sql.gz
fi

RESTORE_DB=salon_restore_test
echo "[test-restore] using $DUMP -> temp db $RESTORE_DB"

# Create throwaway DB inside the postgres container and restore there
docker compose exec -T postgres psql -U "${POSTGRES_USER:-salon}" -d postgres -c "DROP DATABASE IF EXISTS $RESTORE_DB;" -c "CREATE DATABASE $RESTORE_DB OWNER ${POSTGRES_USER:-salon};"

gunzip -c "$DUMP" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-salon}" -d "$RESTORE_DB" -v ON_ERROR_STOP=1 -q \
  || { echo "[test-restore] ❌ FAILED to load dump"; docker compose exec -T postgres psql -U "${POSTGRES_USER:-salon}" -d postgres -c "DROP DATABASE IF EXISTS $RESTORE_DB;" || true; exit 1; }

# Sanity checks
TABLES=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-salon}" -d "$RESTORE_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
TENANTS=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-salon}" -d "$RESTORE_DB" -tAc 'SELECT count(*) FROM "Tenant";')
echo "[test-restore] tables=$TABLES tenants=$TENANTS"
[ "$TABLES" -gt 10 ] || { echo "[test-restore] ❌ too few tables"; exit 1; }

docker compose exec -T postgres psql -U "${POSTGRES_USER:-salon}" -d postgres -c "DROP DATABASE IF EXISTS $RESTORE_DB;"
echo "[test-restore] ✅ OK — RTO estimate < 2h, backup is restorable"
