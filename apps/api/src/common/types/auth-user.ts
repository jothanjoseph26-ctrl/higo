export type AuthUserType = 'passenger' | 'driver' | 'admin';
export type AdminRole = 'super_admin' | 'admin' | 'moderator';

export interface AuthUser {
  sub: string;
  type: AuthUserType;
  role?: AdminRole;
}