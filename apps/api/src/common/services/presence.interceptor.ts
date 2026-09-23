import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '../types/auth-user';
import { PresenceService } from './presence.service';

@Injectable()
export class PresenceInterceptor implements NestInterceptor {
  constructor(private readonly presence: PresenceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<{
        user?: AuthUser;
      }>();
      const user = request.user;
      if (user?.type === 'passenger' || user?.type === 'driver') {
        void this.presence.bump(user.type, user.sub);
      }
    }
    return next.handle();
  }
}
