import { randomBytes, createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit-cookie CSRF protection (spec §9.3).
 * Token issued via GET /auth/csrf, stored in a readable cookie; mutating
 * requests must echo it in the X-CSRF-Token header. Cookies are SameSite=Strict
 * as the second layer of defense.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    // Public endpoints without cookies (webhooks) are signature-protected instead
    if (!req.headers.cookie) return true;

    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER] as string | undefined;
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException({ code: 'CSRF_MISMATCH', message: 'CSRF-проверка не пройдена' });
    }
    return true;
  }

  static generate(): string {
    return randomBytes(32).toString('hex');
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
