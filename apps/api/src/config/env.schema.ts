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

  TERMII_API_KEY: Joi.string().required(),
  TERMII_SENDER_ID: Joi.string().required(),
  TERMII_BASE_URL: Joi.string().uri().default('https://api.ng.termii.com'),
  AFRICASTALKING_USERNAME: Joi.string().required(),
  AFRICASTALKING_API_KEY: Joi.string().required(),
  AFRICASTALKING_SENDER_ID: Joi.string().required(),

  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_REGION: Joi.string().required(),
  AWS_S3_BUCKET_KYC: Joi.string().required(),
  TEXTRACT_REGION: Joi.string().required(),

  PAYSTACK_SECRET_KEY: Joi.string().required(),
  PAYSTACK_PUBLIC_KEY: Joi.string().required(),
  PAYSTACK_PLAN_DAILY: Joi.string().required(),
  PAYSTACK_PLAN_WEEKLY: Joi.string().required(),
  PAYSTACK_PLAN_MONTHLY: Joi.string().required(),
  PLATFORM_COMMISSION_RATE: Joi.number().min(0).max(1).default(0.1),

  GOOGLE_MAPS_API_KEY: Joi.string().required(),
  FIREBASE_SERVER_KEY: Joi.string().required(),
  SENDGRID_API_KEY: Joi.string().required(),
  SENTRY_DSN: Joi.string().uri().allow('').default(''),
  DATADOG_API_KEY: Joi.string().allow('').default(''),
  OPENAI_API_KEY: Joi.string().allow('').default(''),

  EXPO_PUBLIC_API_BASE_URL: Joi.string().uri().required(),
  EXPO_PUBLIC_SOCKET_URL: Joi.string().uri().required(),
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: Joi.string().required(),
  EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY: Joi.string().required(),
});