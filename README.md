# 💈 SALON — SaaS-платформа для салонов красоты

**Версия:** 3.0 · **Статус:** готов к деплою · Monorepo: pnpm + Turborepo

| Приложение | URL (prod) | Порт dev | Стек |
|---|---|---|---|
| 🌐 Витрина (лендинг, тарифы, регистрация) | `salon.ru` | 5173 | React 18 + Vite + Tailwind |
| 📊 CRM | `app.salon.ru` | 5174 | + Zustand, TanStack Query, Socket.io, PWA |
| 📅 Публичная запись | `{salon}.salon.ru` | 5175 | лёгкий бандл, PWA |
| ⚙️ Backend API | `api.salon.ru/v1` | 4000 | NestJS 10 + Prisma 6 + PostgreSQL 16 (RLS) |
| 🤖 Worker | — | — | BullMQ (напоминания, сообщения, аналитика) |

## Быстрый старт (dev)

```bash
pnpm install
cp .env.example apps/backend/.env        # заполните секреты
docker compose up -d postgres redis      # БД и кэш
pnpm --filter @salon/backend prisma migrate deploy
pnpm --filter @salon/backend prisma db seed   # демо-салон: owner@demo.salon / DemoPass123!
pnpm dev                                  # все приложения через turbo
# marketing :5173 · dashboard :5174 · booking :5175 · backend :4000
```

## Продакшен-архитектура (spec §2, §10)

```
Internet → Хостовой Nginx (80/443, Certbot wildcard *.salon.ru)
         → 127.0.0.1:8080 → Docker nginx (SPA + proxy /v1, /socket.io)
                              ├─ backend  :4000 (NestJS)
                              ├─ worker   (BullMQ)
                              ├─ postgres :5432 (FORCE RLS)
                              └─ redis    :6379
```

Единственный порт на хосте от Salon — `127.0.0.1:8080`. Порты БД не публикуются.

```bash
# На VPS из корня репозитория:
bash deploy/scripts/deploy.sh          # build → migrate → sync SPA → health check
bash deploy/scripts/backup.sh          # pg_dump → GPG → Yandex S3 (cron ежедневно)
bash deploy/scripts/test-restore.sh    # ежемесячный drill восстановления
```

Конфиги: `deploy/nginx/` (внутренний), `deploy/host-nginx/` (образец фасада).
CI/CD: `.github/workflows/ci.yml` (lint/typecheck/tests/security/isolation) → `deploy.yml` (SSH).

## Безопасность (spec §9)

argon2id · JWT RS256 (httpOnly cookies) · refresh-ротация + reuse detection · TOTP 2FA ·
подписанный CSRF (HMAC) · FORCE Row-Level Security + `withTenant()` · advisory locks + optimistic
locking в записях · rate limiting 3 уровня · honeypot · whitelist origin для HTTP и WebSocket ·
аудит всех мутаций · ЮKassa HMAC + идемпотентность · ПДн в РФ (152-ФЗ).

## Структура

```
apps/       backend (NestJS) · dashboard (CRM) · marketing (лендинг) · booking (виджет)
packages/   core (домен+API-клиент) · ui (дизайн-система) · config (ts/tailwind/vite пресеты)
deploy/     nginx · host-nginx · scripts (deploy/backup/test-restore) · Dockerfile.frontend
docs/       adr · runbooks
```

## Команды

```bash
pnpm build · pnpm typecheck · pnpm lint · pnpm test
pnpm --filter @salon/backend prisma:migrate · prisma:seed
docker compose up -d · logs -f · exec backend sh
```

Подробнее: [SPECIFICATION](docs/SPECIFICATION.md) · [Runbook](deploy/runbook.md) · ADR в `docs/adr/`
