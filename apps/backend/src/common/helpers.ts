import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** Attach/propagate X-Request-ID (spec §6.3). */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface PaginationParams {
  page: number; // 1-based
  limit: number; // max 100
}

export function parsePagination(q: { page?: unknown; limit?: unknown }): PaginationParams {
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20) || 20));
  return { page, limit };
}

export function paginationMeta(total: number, p: PaginationParams) {
  return { page: p.page, limit: p.limit, total, totalPages: Math.ceil(total / p.limit) };
}

/** Success envelope per spec §5.1 */
export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return meta ? { success: true as const, data, meta } : { success: true as const, data };
}

/** Honeypot check (spec §9.3): bots fill hidden `website` field. */
export function isBot(body: Record<string, unknown> | undefined): boolean {
  return !!(body && (body as { website?: string }).website);
}
