import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  APP_BASE_URL: Joi.string().uri().required(),
  APP_PAYMENT_CALLBACK_URL: Joi.string().uri().required(),

  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(604800),
  ENCRYPTION_KEY: Joi.string().base64().length(44).required(),
  GOOGLE_OAUTH_CLIENT_ID: Joi.string().required(),

  OTP_PROVIDER: Joi.string().valid('firebase', 'termii').default('firebase'),

  TERMII_API_KEY: Joi.string().allow('').default(''),
  TERMII_SENDER_ID: Joi.string().allow('').default('HiGo'),
  TERMII_BASE_URL: Joi.string().uri().default('https://api.ng.termii.com'),
  AFRICASTALKING_USERNAME: Joi.string().allow('').default(''),
  AFRICASTALKING_API_KEY: Joi.string().allow('').default(''),
  AFRICASTALKING_SENDER_ID: Joi.string().allow('').default('HiGo'),

  FIREBASE_SERVICE_ACCOUNT_PATH: Joi.string().default(
    'hiconnect-firebase-services-key.json',
  ),
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().allow('').default(''),
  FIREBASE_SERVER_KEY: Joi.string().allow('').default(''),

  CLOUDFLARE_ACCOUNT_ID: Joi.string().required(),
  CLOUDFLARE_R2_BUCKET: Joi.string().default('higo-kyc-docs'),
  CLOUDFLARE_R2_ENDPOINT: Joi.string().uri().allow('').default(''),
  CLOUDFLARE_ACCESS_KEY_ID: Joi.string().required(),
  CLOUDFLARE_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  CLOUDFLARE_SECRET_ACESS_KEY: Joi.string().allow('').default(''),

  PAYSTACK_SECRET_KEY: Joi.string().required(),
  PAYSTACK_PUBLIC_KEY: Joi.string().required(),
  PAYSTACK_PLAN_DAILY: Joi.string().required(),
  PAYSTACK_PLAN_WEEKLY: Joi.string().required(),
  PAYSTACK_PLAN_MONTHLY: Joi.string().required(),
  PLATFORM_COMMISSION_RATE: Joi.number().min(0).max(1).default(0.1),

  GOOGLE_MAPS_API_KEY: Joi.string().required(),
  MAPS_DIRECTIONS_ENABLED: Joi.boolean().default(true),
  RESEND_API_KEY: Joi.string().allow('').default(''),
  EMAIL_FROM: Joi.string().default('HiGo <noreply@hiconnect.com>'),
  WEEKLY_KPI_EMAIL_RECIPIENTS: Joi.string().allow('').default(''),
  WEEKLY_MARKETING_SPEND_KOBO: Joi.number().integer().min(0).default(0),
  WEEKLY_OPERATING_COSTS_KOBO: Joi.number().integer().min(0).default(0),
  CRON_JOBS_ENABLED: Joi.boolean().default(true),
  SENTRY_DSN: Joi.string().uri().allow('').default(''),
  DATADOG_API_KEY: Joi.string().allow('').default(''),
  OPENROUTER_API_KEY: Joi.string().allow('').default(''),
  OPENROUTER_MODEL: Joi.string().allow('').default('google/gemini-2.0-flash-001'),

  SURGE_ENABLED: Joi.boolean().default(false),
  PUSH_ENABLED: Joi.boolean().default(false),

  EXPO_PUBLIC_API_BASE_URL: Joi.string().uri().required(),
  EXPO_PUBLIC_SOCKET_URL: Joi.string().uri().required(),
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: Joi.string().required(),
  EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY: Joi.string().required(),
}).custom((value, helpers) => {
  if (
    value.OTP_PROVIDER === 'termii' &&
    (!value.TERMII_API_KEY || !value.AFRICASTALKING_API_KEY)
  ) {
    return helpers.error('any.custom', {
      message:
        'TERMII_API_KEY and AFRICASTALKING_API_KEY are required when OTP_PROVIDER=termii',
    });
  }

  const r2Secret =
    value.CLOUDFLARE_SECRET_ACCESS_KEY || value.CLOUDFLARE_SECRET_ACESS_KEY;
  if (!r2Secret) {
    return helpers.error('any.custom', {
      message:
        'CLOUDFLARE_SECRET_ACCESS_KEY (or CLOUDFLARE_SECRET_ACESS_KEY) is required',
    });
  }

  return value;
});