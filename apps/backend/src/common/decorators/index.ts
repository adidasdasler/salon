import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@salon/core';

export const ROLES_KEY = 'salon:roles';
export const Public = () => SetMetadata('salon:public', true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

/** Injects the authenticated user context (set by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthContext }>();
    return req.user;
  },
);

export const IS_PUBLIC_KEY = 'salon:public';
