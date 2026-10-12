import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@salon/core';
import { Roles, CurrentUser, AuthContext } from '../common/decorators';
import { ok, parsePagination, paginationMeta } from '../common/helpers';
import { PrismaService } from '../database/prisma.service';

/** Audit log list + CSV export — OWNER only (spec §9.3, §5.2 Audit). */
@Controller('audit')
@Roles(UserRole.OWNER)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() auth: AuthContext,
    @Query() q: { page?: number; limit?: number; entityType?: string; entityId?: string; userId?: string },
  ) {
    const p = parsePagination(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const where = {
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
        ...(q.userId ? { userId: q.userId } : {}),
      };
      const [items, total] = await Promise.all([
        tx.auditLog.findMany({ where, skip: (p.page - 1) * p.limit, take: p.limit, orderBy: { createdAt: 'desc' } }),
        tx.auditLog.count({ where }),
      ]);
      return ok(items, paginationMeta(total, p));
    });
  }

  @Get('export')
  async exportCsv(@CurrentUser() auth: AuthContext, @Res() res: Response) {
    const rows = await this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10_000 }),
    );
    const header = 'createdAt,action,entityType,entityId,userId,ip\n';
    const body = rows
      .map((r) => [r.createdAt.toISOString(), r.action, r.entityType, r.entityId ?? '', r.userId ?? '', r.ip ?? ''].join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${auth.tenantId}.csv"`);
    res.send(header + body);
  }
}
