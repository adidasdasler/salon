#!/usr/bin/env bash
# SALON PostgreSQL backup — daily cron on the VPS.
# pg_dump from container -> GPG encrypt (optional) -> Yandex S3 (rclone/aws-cli) -> prune 30 days.
# Cron example:  15 3 * * * root bash /srv/salon/deploy/scripts/backup.sh >> /var/log/salon-backup.log 2>&1
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
OUT_DIR="${BACKUP_DIR:-/var/backups/salon}"
TS="$(date -u +%Y%m%d_%H%M%S)"
FILE="salon_${TS}.sql.gz"
mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"

log() { printf '[backup %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

log "pg_dump"
docker compose exec -T postgres sh -c 'pg_dump -U "${POSTGRES_USER:-salon}" -d "${POSTGRES_DB:-salon}" --no-owner --format=custom' \
  | gzip > "$OUT_DIR/$FILE.tmp"
mv "$OUT_DIR/$FILE.tmp" "$OUT_DIR/$FILE"
sha256sum "$OUT_DIR/$FILE" > "$OUT_DIR/$FILE.sha256"

# Optional GPG symmetric encryption (BACKUP_GPG_PASSPHRASE set in root cron env / secrets file)
if [ -n "${BACKUP_GPG_PASSPHRASE:-}" ]; then
  log "encrypting with GPG"
  gpg --batch --yes --passphrase "$BACKUP_GPG_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$OUT_DIR/$FILE.gpg" "$OUT_DIR/$FILE"
  shred -u "$OUT_DIR/$FILE" 2>/dev/null || rm -f "$OUT_DIR/$FILE"
  UPLOAD="$OUT_DIR/$FILE.gpg"
else
  log "WARNING: BACKUP_GPG_PASSPHRASE not set — storing plaintext dump (acceptable only if disk is encrypted)"
  UPLOAD="$OUT_DIR/$FILE"
fi

# Offsite to S3-compatible storage (Yandex Object Storage, RU — 152-FZ)
if command -v aws >/dev/null && [ -n "${S3_BUCKET:-}" ]; then
  log "uploading to s3://${S3_BUCKET}/"
  AWS_ENDPOINT_URL="${S3_ENDPOINT:-https://storage.yandexcloud.net}" \
  aws s3 cp "$UPLOAD" "s3://${S3_BUCKET}/${FILE##*/}"
  # prune remote
  AWS_ENDPOINT_URL="${S3_ENDPOINT:-https://storage.yandexcloud.net}" \
  aws s3 ls "s3://${S3_BUCKET}/" | awk '{print $4}' | grep '^salon_' | sort | head -n -"$((KEEP_DAYS))" | while read -r old; do
    AWS_ENDPOINT_URL="${S3_ENDPOINT:-https://storage.yandexcloud.net}" aws s3 rm "s3://${S3_BUCKET}/${old}" || true
  done
elif command -v rclone >/dev/null && [ -n "${S3_REMOTE:-}" ]; then
  log "uploading via rclone to ${S3_REMOTE}:${S3_BUCKET:-salon-backups}"
  rclone copy "$UPLOAD" "${S3_REMOTE}:${S3_BUCKET:-salon-backups}" --max-age "${KEEP_DAYS}d"
else
  log "WARNING: no S3 upload configured (aws/rclone). Backup stays local only!"
fi

# Local prune
find "$OUT_DIR" -name 'salon_*' -mtime "+$KEEP_DAYS" -delete
log "done: $UPLOAD ($(du -h "$UPLOAD" | cut -f1))"
