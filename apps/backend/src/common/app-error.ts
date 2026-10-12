import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@salon/core';

/** Application error with machine-readable code (spec §5.1, §12). */
export class AppError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static unauthorized(details?: unknown) {
    return new AppError(ErrorCode.UNAUTHORIZED, 'Требуется авторизация', HttpStatus.UNAUTHORIZED, details);
  }
  static forbidden(msg = 'Недостаточно прав', details?: unknown) {
    return new AppError(ErrorCode.FORBIDDEN, msg, HttpStatus.FORBIDDEN, details);
  }
  static notFound(msg = 'Не найдено', details?: unknown) {
    return new AppError(ErrorCode.NOT_FOUND, msg, HttpStatus.NOT_FOUND, details);
  }
  static conflict(code: string, msg: string, details?: unknown) {
    return new AppError(code, msg, HttpStatus.CONFLICT, details);
  }
  static validation(details: unknown, msg = 'Ошибка валидации') {
    return new AppError(ErrorCode.VALIDATION_ERROR, msg, HttpStatus.BAD_REQUEST, details);
  }
  static badRequest(code: string, msg: string, details?: unknown) {
    return new AppError(code, msg, HttpStatus.BAD_REQUEST, details);
  }
}
