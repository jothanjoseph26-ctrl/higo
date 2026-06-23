import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app.exception';
import { AuthUser, AuthUserType } from '../types/auth-user';

export const USER_TYPES_KEY = 'userTypes';
export const RequireUserTypes = (...types: AuthUserType[]) =>
  SetMetadata(USER_TYPES_KEY, types);

@Injectable()
export class UserTypeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const types = this.reflector.getAllAndOverride<AuthUserType[]>(
      USER_TYPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!types?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!user || !types.includes(user.type)) {
      throw new AppException('FORBIDDEN');
    }
    return true;
  }
}