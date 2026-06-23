import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG, ErrorCode } from './error-codes';

export class AppException extends HttpException {
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(
    errorCode: ErrorCode,
    details?: Record<string, string[]>,
    overrideMessage?: string,
  ) {
    const entry = ERROR_CATALOG[errorCode];
    super(
      {
        success: false,
        error: {
          code: entry.code,
          message: overrideMessage ?? entry.message,
          statusCode: entry.statusCode,
          ...(details ? { details } : {}),
        },
      },
      entry.statusCode,
    );
    this.code = entry.code;
    this.details = details;
  }
}