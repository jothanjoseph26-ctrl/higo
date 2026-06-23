import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CATALOG } from '../errors/error-codes';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (
        typeof body === 'object' &&
        body !== null &&
        'success' in body &&
        (body as { success: boolean }).success === false
      ) {
        response.status(status).json(body);
        return;
      }

      if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
        const details =
          typeof body === 'object' && body !== null && 'message' in body
            ? this.normalizeValidationDetails(
                (body as { message: string | string[] }).message,
              )
            : undefined;
        response.status(status).json({
          success: false,
          error: {
            code: ERROR_CATALOG.VALIDATION_ERROR.code,
            message: ERROR_CATALOG.VALIDATION_ERROR.message,
            statusCode: status,
            ...(details ? { details } : {}),
          },
        });
        return;
      }

      const message =
        typeof body === 'string'
          ? body
          : typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: unknown }).message)
            : ERROR_CATALOG.INTERNAL_ERROR.message;

      const code =
        status === HttpStatus.UNAUTHORIZED
          ? ERROR_CATALOG.UNAUTHORIZED.code
          : status === HttpStatus.FORBIDDEN
            ? ERROR_CATALOG.FORBIDDEN.code
            : status === HttpStatus.NOT_FOUND
              ? ERROR_CATALOG.NOT_FOUND.code
              : status === HttpStatus.TOO_MANY_REQUESTS
                ? ERROR_CATALOG.RATE_LIMITED.code
                : ERROR_CATALOG.INTERNAL_ERROR.code;

      response.status(status).json({
        success: false,
        error: {
          code,
          message,
          statusCode: status,
        },
      });
      return;
    }

    this.logger.error(
      `Unhandled exception [${request.requestId ?? 'no-id'}]`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CATALOG.INTERNAL_ERROR.code,
        message: ERROR_CATALOG.INTERNAL_ERROR.message,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      },
    });
  }

  private normalizeValidationDetails(
    message: string | string[],
  ): Record<string, string[]> {
    const messages = Array.isArray(message) ? message : [message];
    return { _global: messages };
  }
}