# ADR-0001: Multi-tenancy через PostgreSQL RLS (shared schema)

**Статус:** принят · **Дата:** 2026-10-01

## Контекст
SaaS с тысячами тенантов (салоны). Варианты: database-per-tenant, schema-per-tenant, shared schema + дискриминатор.

## Решение
Shared schema + колонка `tenantId` во всех таблицах + `ENABLE + FORCE ROW LEVEL SECURITY` с политикой по `current_setting('app.tenant_id')`. Обёртки `withTenant()`/`forTenant()` ставят `app.tenant_id` в транзакции (через `set_tenant_id()`), fail-safe: без tenant_id запрос ничего не видит.

## Последствия
+ Один пул соединений, простые миграции, дешёвое масштабирование
+ Двойная защита: RLS (БД) + скоуп `{ tenantId }` в Prisma + скоуп `{ id, tenantId }` в where
− Нужны isolation-тесты в CI (есть) и advisory locks для race-безопасности букингов
− Исключения без RLS: Tenant, Plan, _prisma_migrations — контролируются вручную
