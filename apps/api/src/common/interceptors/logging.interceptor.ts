import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      requestId?: string;
    }>();
    const requestId = request.requestId ?? randomUUID();
    request.requestId = requestId;
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - started;
        this.logger.log(
          `[${requestId}] ${request.method} ${request.url} ${ms}ms`,
        );
      }),
    );
  }
}