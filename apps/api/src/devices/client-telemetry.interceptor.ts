import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '../common/types/auth-user';
import { ClientInstallationService, ClientTelemetry } from './client-installation.service';

const INSTALL_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function pickClientType(header: string | undefined): string {
  const v = header?.toUpperCase();
  if (v === 'WEB_BROWSER' || v === 'PWA' || v === 'ANDROID_NATIVE' || v === 'IOS_NATIVE') {
    return v;
  }
  return 'UNKNOWN';
}

function pickPlatform(header: string | undefined): string {
  const v = header?.toUpperCase();
  if (v === 'WEB' || v === 'ANDROID' || v === 'IOS') return v;
  return 'UNKNOWN';
}

function pickInstallSource(header: string | undefined): string {
  const v = header?.toUpperCase();
  if (v === 'GOOGLE_PLAY' || v === 'SIDELOADED') return v;
  return 'UNKNOWN';
}

@Injectable()
export class ClientTelemetryInterceptor implements NestInterceptor {
  constructor(private readonly installations: ClientInstallationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<{
        user?: AuthUser;
        headers: Record<string, string | string[] | undefined>;
      }>();
      const user = request.user;
      if (user?.type === 'passenger' || user?.type === 'driver' || user?.type === 'admin') {
        const rawId = request.headers['x-higo-installation-id'];
        const installationId = Array.isArray(rawId) ? rawId[0] : rawId;
        if (installationId && INSTALL_ID_RE.test(installationId)) {
          const telemetry: ClientTelemetry = {
            installationId,
            clientType: pickClientType(
              headerValue(request.headers, 'x-higo-client'),
            ),
            devicePlatform: pickPlatform(
              headerValue(request.headers, 'x-higo-platform'),
            ),
            installSource: pickInstallSource(
              headerValue(request.headers, 'x-higo-install-source'),
            ),
            appVersion: headerValue(request.headers, 'x-higo-app-version'),
            buildNumber: headerValue(request.headers, 'x-higo-app-build'),
          };
          void this.installations.record(user, telemetry);
        }
      }
    }
    return next.handle();
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}
