import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@salon/core';
import { ROLES_KEY, AuthContext } from '../decorators';

/** Role-based access control (OWNER > MANAGER > ADMIN > MASTER). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<{ user?: AuthContext }>();
    if (!req.user) throw new ForbiddenException('Требуется авторизация');
    if (!required.includes(req.user.role)) {
      throw new ForbiddenException('Недостаточно прав для этой операции');
    }
    return true;
  }
}
