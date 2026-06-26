import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN?.trim();

if (!dsn) {
  console.log('Sentry disabled');
} else {
  try {
    const environment = process.env.NODE_ENV ?? 'development';
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    });
  } catch (error) {
    console.warn('Sentry init failed:', error);
  }
}