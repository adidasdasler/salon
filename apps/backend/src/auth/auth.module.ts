import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { RolesGuard } from '../common/guards/roles.guard';

function loadKey(envValue: string | undefined, pathEnv: string): string {
  if (envValue) return envValue.replace(/\\n/g, '\n');
  const p = process.env[pathEnv];
  if (p) {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      /* dev fallback below */
    }
  }
  return '';
}

/**
 * JWT RS256 in production (keys from Docker secrets /run/secrets/...),
 * HS256 dev fallback so `pnpm dev` works without key generation.
 */
export function makeJwtOptions() {
  const privateKey = loadKey(process.env.JWT_PRIVATE_KEY, 'JWT_PRIVATE_KEY_PATH');
  const publicKey = loadKey(process.env.JWT_PUBLIC_KEY, 'JWT_PUBLIC_KEY_PATH');
  const rs256 = Boolean(privateKey && publicKey);
  const devSecret = process.env.JWT_DEV_SECRET ?? 'dev-only-secret-change-me';
  return {
    signOptions: {
      algorithm: (rs256 ? 'RS256' : 'HS256') as 'RS256' | 'HS256',
      expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
    },
    privateKey: rs256 ? privateKey : devSecret,
    publicKey: rs256 ? publicKey : devSecret,
  };
}

@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => makeJwtOptions() })],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    TotpService,
    // Global authn + CSRF for every module (spec §9.2, §9.3)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AuthService, TokenService, TotpService, JwtModule],
})
export class AuthModule {}
