import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

/** Money columns are stored as kopecks (spec §3 conventions). */
const MONEY_FIELDS = new Set(['price', 'paidAmount', 'totalSpent', 'amount', 'priceMonthly', 'priceYearly']);

/**
 * Normalize a value for JSON transport: Decimal → integer kopecks, BigInt → number.
 * Exported from helpers so every module can use it; PrismaService re-exports as `normalize`.
 */
export function normalizeValue(key: string | null, v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'bigint') return Number(v);
  if (Prisma.Decimal.isDecimal(v)) {
    const n = Number((v as Prisma.Decimal).toString());
    // money columns are integer kopecks — round to avoid float dust
    return key && MONEY_FIELDS.has(key) ? Math.round(n) : n;
  }
  if (Array.isArray(v)) return v.map((x) => normalizeValue(null, x));
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = normalizeValue(k, val);
    }
    return out;
  }
  return v;
}

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
  // Normalize Decimal/BigInt → JSON-safe numbers so money fields never break res.json()
  const normalized = normalizeValue(null, data) as T;
  return meta ? { success: true as const, data: normalized, meta } : { success: true as const, data: normalized };
}

/** Honeypot check (spec §9.3): bots fill hidden `website` field. */
export function isBot(body: Record<string, unknown> | undefined): boolean {
  return !!(body && (body as { website?: string }).website);
}
