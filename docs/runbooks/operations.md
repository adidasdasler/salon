# SALON Runbook

## Штатный деплой
1. Merge в `main` → CI (lint/typecheck/tests/security/isolation) зелёный
2. GitHub Actions Deploy (или вручную): `ssh vps` → `bash deploy/scripts/deploy.sh`
3. Проверка: `docker compose ps`, `curl -k https://api.salon.ru/v1/health`

## Откат
```bash
docker compose down            # salon больше не принимает трафик; хостовой nginx вернёт 502
git checkout <last-good-tag> && bash deploy/scripts/deploy.sh
```

## Аварии
| Симптом | Диагностика | Действие |
|---|---|---|
| API 5xx | `docker compose logs -f backend` | OOM? → `docker stats`; БД down? → `compose up -d postgres` |
| Напоминания не уходят | `docker compose logs worker`, BullMQ dashboard | redis down → рестарт; DLQ переиграть: `redis-cli LPUSH reminders:<job>` |
| 429 волна | rate-limit логи nginx | поднять лимиты точечно, проверить ботов по UA |
| Подозрение на утечку tenant | isolation-тесты + AuditLog | остановить выдачу refresh, ротация JWT-ключа, аудит |

## Секреты
- `.env` права 600, владелец root; RS256 ключи в `/run/secrets/jwt_*.pem` (docker secrets)
- Ротация каждые 90 дней: сгенерировать новую пару → restart backend → старые сессии живут до TTL refresh (30д) либо отозвать вручную

## Бэкапы / восстановление
- Cron: `15 3 * * * root bash /srv/salon/deploy/scripts/backup.sh >> /var/log/salon-backup.log 2>&1`
- Restore in-place: скачать дамп → `gunzip -c dump.sql.gz | docker compose exec -T postgres psql -U salon -d salon`
- Ежемесячно: `bash deploy/scripts/test-restore.sh` (RPO 24ч, RTO 2ч)

## SSL
`certbot renew --quiet` раз в сутки cron; wildcard: `certbot certonly --dns-... -d '*.salon.ru' -d salon.ru`

## Мониторинг
Sentry (DSN в .env), UptimeRobot на `/v1/health`, алерты в Telegram. SLO: avail 99.5%, p95<500ms, доставка напоминаний >95%.
