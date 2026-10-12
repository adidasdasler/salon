import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/** Signed double-submit token: `<random hex>.<hmac(secret, hex)>`. */
function sign(raw: string): string {
  const mac = createHmac('sha256', csrfSecret()).update(raw).digest('hex');
  return `${raw}.${mac}`;
}

function verifySigned(token: string): boolean {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const raw = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac('sha256', csrfSecret()).update(raw).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(mac, 'hex');
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}

let cachedSecret: string | null = null;
function csrfSecret(): string {
  if (cachedSecret) return cachedSecret;
  const envSecret = process.env.CSRF_SECRET ?? process.env.JWT_DEV_SECRET;
  if (process.env.NODE_ENV === 'production' && !envSecret) {
    throw new Error('CSRF_SECRET must be set in production');
  }
  cachedSecret = envSecret ?? randomBytes(32).toString('hex'); // dev: per-process
  return cachedSecret;
}

/**
 * Signed double-submit-cookie CSRF protection (spec §9.3).
 * Token issued via GET /auth/csrf, stored in a readable cookie; mutating
 * requests must echo it in the X-CSRF-Token header. The token is HMAC-signed
 * so an attacker who can plant a cookie cannot forge a valid one
 * (plain double-submit is bypassable via cookie-injection on subdomain-wide cookies).
 * Cookies are SameSite as the second layer of defense.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    // Public endpoints without cookies (webhooks, widget booking) are protected
    // by signatures / captcha+honeypot instead.
    if (!req.headers.cookie) return true;

    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER] as string | undefined;
    if (!cookieToken || !headerToken) {
      throw new ForbiddenException({ code: 'CSRF_MISMATCH', message: 'CSRF-проверка не пройдена' });
    }
    // Constant-time compare of full signed tokens + signature check.
    const a = Buffer.from(cookieToken);
    const b = Buffer.from(headerToken);
    if (a.length !== b.length || !timingSafeEqual(a, b) || !verifySigned(cookieToken)) {
      throw new ForbiddenException({ code: 'CSRF_MISMATCH', message: 'CSRF-проверка не пройдена' });
    }
    return true;
  }

  static generate(): string {
    return sign(randomBytes(32).toString('hex'));
  }

  static setCookie(res: Response, token: string) {
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // double-submit requires JS-readable cookie
      sameSite: (process.env.COOKIE_SAMESITE as 'strict' | 'lax' | 'none') ?? 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
      maxAge: 8 * 3600 * 1000,
    });
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
