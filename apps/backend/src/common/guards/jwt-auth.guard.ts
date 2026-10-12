import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, AuthContext } from '../decorators';

/**
 * Validates RS256 access token from httpOnly cookie `access_token`
 * (Authorization: Bearer fallback for tests/tools). Tenant comes from JWT, never URL.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token: string | undefined =
      (req.cookies as Record<string, string> | undefined)?.access_token ??
      req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Нет токена доступа');

    try {
      const payload = await this.jwt.verifyAsync<AuthContext & { sub: string }>(token);
      (req as Request & { user: AuthContext }).user = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: payload.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Сессия истекла' });
    }
  }
}
