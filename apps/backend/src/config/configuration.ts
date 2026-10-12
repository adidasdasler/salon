/** Typed app configuration assembled from env (spec §14.1). */

export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  cookie: {
    domain: string;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
  };
  corsOrigins: string[];
  corsOriginRegex?: string;
  redisUrl: string;
  yookassa: { shopId: string; secretKey: string };
  telegram: { botToken: string };
  captcha: { siteKey: string; secret: string };
}

export function loadConfig(): AppConfig {
  return {
    env: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    apiPrefix: process.env.API_PREFIX ?? 'v1',
    cookie: {
      domain: process.env.COOKIE_DOMAIN ?? 'localhost',
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAMESITE as AppConfig['cookie']['sameSite']) ?? 'lax',
    },
    corsOrigins: (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean),
    corsOriginRegex: process.env.CORS_ORIGIN_REGEX,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    yookassa: {
      shopId: process.env.YOOKASSA_SHOP_ID ?? '',
      secretKey: process.env.YOOKASSA_SECRET_KEY ?? '',
    },
    telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN ?? '' },
    captcha: {
      siteKey: process.env.YANDEX_SMARTCAPTCHA_KEY ?? '',
      secret: process.env.YANDEX_SMARTCAPTCHA_SECRET ?? '',
    },
  };
}

export const config = () => ({ app: loadConfig() });
