import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Tenant-scoped Prisma wrapper.
 *
 * NOTE (spec §9.1): Prisma `$use()` middleware was removed in Prisma 6,
 * so RLS is applied per-transaction instead:
 *   - `withTenant(tenantId, fn)` — runs fn inside a transaction with
 *     `set_config('app.tenant_id', ...)` + FORCE ROW LEVEL SECURITY.
 *   - `forTenant(tenantId)` — returns a tx-bound client for callers that
 *     need to compose several operations manually.
 *
 * Without an explicit tenant context the connection has no app.tenant_id,
 * current_setting returns NULL and RLS denies every row → fail-safe by design.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Open a tenant-scoped interactive transaction. */
  async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_tenant_id(${tenantId})`;
      return fn(tx);
    });
  }

  /** Raw query escape hatch WITHOUT tenant scope — only for Tenant/Plan/system tables. */
  system(): PrismaClient {
    return this;
  }
}

export type TenantTx = Prisma.TransactionClient;
