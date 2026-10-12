import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '@salon/core';
import { AppError } from '../app-error';

/**
 * Global filter — every response uses the spec §5.1 envelope:
 *   { success: false, error: { code, message, details? } }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ requestId?: string; method: string; url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL;
    let message = 'Внутренняя ошибка сервера';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      ({ code, message, details } = exception.getResponse() as {
        code: string;
        message: string;
        details?: unknown;
      });
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = status === 429 ? ErrorCode.RATE_LIMITED : ErrorCode.CONFLICT;
      } else {
        const b = body as Record<string, unknown>;
        code = (b.code as string) ?? (status === 429 ? ErrorCode.RATE_LIMITED : ErrorCode.VALIDATION_ERROR);
        message = (b.message as string) ?? exception.message;
        details = b.details ?? (Array.isArray(b.message) ? b.message : undefined);
      }
    } else if (exception instanceof Error) {
      // never leak internals in production
      this.logger.error(`${req.method} ${req.url} → ${exception.message}`, exception.stack);
    }

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({ msg: `${req.method} ${req.url}`, code, requestId: req.requestId }),
      );
    }

    res.status(status).json({
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
  }
}
