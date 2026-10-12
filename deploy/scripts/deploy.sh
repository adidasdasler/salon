#!/usr/bin/env bash
# SALON deploy script — run on the VPS from the repo root.
# Usage: bash deploy/scripts/deploy.sh [--skip-build]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\n\033[1;36m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f .env ] || die ".env not found. Copy .env.example -> .env and fill secrets (chmod 600)."

log "Sanity checks"
docker compose version >/dev/null || die "docker compose v2 required"
grep -q 'POSTGRES_PASSWORD=' .env || die "POSTGRES_PASSWORD missing in .env"

log "Pull latest code (if git checkout)"
if [ -d .git ]; then
  git pull --ff-only || log "git pull skipped/failed (local changes?) — continuing"
fi

log "Build backend image"
docker compose build backend

log "Build frontend bundles and sync into nginx volumes"
# Build SPAs, copy dist into running nginx container paths (volumes marketing-dist/dashboard-dist/booking-dist)
docker build -f deploy/Dockerfile.frontend --target export -t salon-frontend-export .
CID=$(docker create --rm salon-frontend-export true || docker create salon-frontend-export true)
TMP=$(mktemp -d)
docker cp "$CID:/marketing" "$TMP/marketing" 2>/dev/null || true
docker cp "$CID:/dashboard" "$TMP/dashboard" 2>/dev/null || true
docker cp "$CID:/booking"  "$TMP/booking"  2>/dev/null || true
docker rm -f "$CID" >/dev/null 2>&1 || true
for app in marketing dashboard booking; do
  if [ -d "$TMP/$app" ]; then
    docker compose cp "$TMP/$app/." "nginx:/usr/share/nginx/$app.tmp" || true
    docker compose exec -T nginx sh -c "rm -rf /usr/share/nginx/$app.new && mv /usr/share/nginx/$app.tmp /usr/share/nginx/$app.new \
      && rm -rf /usr/share/nginx/$app.real && mkdir -p /usr/share/nginx/$app.real \
      && cp -a /usr/share/nginx/$app.new/. /usr/share/nginx/$app.real/ && rm -rf /usr/share/nginx/$app.new" \
      && docker compose exec -T nginx sh -c "rm -rf /usr/share/nginx/$app/* && cp -a /usr/share/nginx/$app.real/. /usr/share/nginx/$app/ 2>/dev/null; rm -rf /usr/share/nginx/$app.real" || true
    log "synced $app"
  else
    log "WARNING: no bundle for $app — skipping"
  fi
done
rm -rf "$TMP"

log "Run migrations + start stack"
docker compose up -d
docker compose exec -T backend sh -c "pnpm --filter @salon/backend prisma migrate deploy" || \
  docker compose run --rm backend sh -c "pnpm --filter @salon/backend prisma migrate deploy"

log "Seed plans (idempotent upsert inside migration image)"
docker compose exec -T backend node apps/backend/dist/prisma-seed.js 2>/dev/null || \
  docker compose exec -T backend sh -c "pnpm --filter @salon/backend prisma db seed" || \
  log "seed skipped (already seeded?)"

log "Restart nginx to pick up new static files"
docker compose restart nginx

log "Health check"
for i in $(seq 1 30); do
  if docker compose exec -T backend wget -qO- http://127.0.0.1:4000/v1/health >/dev/null 2>&1 \
     || curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
    log "✅ SALON is healthy"
    docker compose ps
    exit 0
  fi
  sleep 2
done
die "health check timed out — inspect: docker compose logs -f backend nginx"
