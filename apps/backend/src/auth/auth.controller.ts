import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CsrfGuard, CsrfGuard as Csrf } from '../common/guards/csrf.guard';
import { Public } from '../common/decorators';
import { CurrentUser, AuthContext } from '../common/decorators';
import { ok } from '../common/helpers';
import { RegisterDto, LoginDto, RefreshDto, ChangePasswordDto, Verify2faDto } from './dto';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function cookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') ?? 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: maxAgeMs,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Issue CSRF double-submit cookie (spec §6.3). */
  @Public()
  @Get('csrf')
  csrf(@Res() res: Response) {
    const token = Csrf.generate();
    Csrf.setCookie(res, token);
    res.json(ok({ csrfToken: token }));
  }

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.register(dto, req.ip);
    res.cookie(ACCESS_COOKIE, r.tokens.accessToken, cookieOpts(15 * 60_000));
    res.cookie(REFRESH_COOKIE, r.tokens.refreshToken, cookieOpts(30 * 86_400_000));
    return ok({ user: r.user, tenant: r.tenant });
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto, req.ip, req.headers['user-agent']);
    res.cookie(ACCESS_COOKIE, r.tokens.accessToken, cookieOpts(15 * 60_000));
    res.cookie(REFRESH_COOKIE, r.tokens.refreshToken, cookieOpts(30 * 86_400_000));
    return ok({ user: r.user });
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    // httpOnly cookie is the primary source; body value is a fallback for non-browser clients.
    const token = dto.refreshToken || req.cookies?.[REFRESH_COOKIE] || '';
    const tokens = await this.auth.refresh(token, req.ip, req.headers['user-agent']);
    res.cookie(ACCESS_COOKIE, tokens.accessToken, cookieOpts(15 * 60_000));
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOpts(30 * 86_400_000));
    return ok({ rotated: true });
  }

  @HttpCode(200)
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(dto.refreshToken || req.cookies?.[REFRESH_COOKIE] || '');
    res.clearCookie(ACCESS_COOKIE);
    res.clearCookie(REFRESH_COOKIE);
    return ok({ loggedOut: true });
  }

  @Get('me')
  me(@CurrentUser() user: AuthContext) {
    return this.auth.me(user.userId).then(ok);
  }

  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthContext) {
    return this.auth.setup2fa(user.userId).then(ok);
  }

  @HttpCode(200)
  @Post('2fa/verify')
  verify2fa(@CurrentUser() user: AuthContext, @Body() dto: Verify2faDto) {
    return this.auth.enable2fa(user.userId, dto.code).then(ok);
  }

  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthContext, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword).then(ok);
  }
}
