import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestId } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'v1');
  app.use(helmet());
  app.use(cookieParser.default ?? cookieParser);
  app.use(requestId);

  app.enableCors({
    origin: (origin, cb) => {
      const whitelist = (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean);
      // allow *.salon.ru subdomains via regex from env
      const pattern = process.env.CORS_ORIGIN_REGEX; // e.g. ^https://[a-z0-9-]+\.salon\.ru$
      if (!origin || whitelist.includes(origin)) return cb(null, true);
      if (pattern && new RegExp(pattern).test(origin)) return cb(null, true);
      return cb(new Error('CORS blocked'), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`SALON backend listening on :${port}`);
}

bootstrap();
