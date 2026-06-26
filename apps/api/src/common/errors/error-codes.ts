export const ERROR_CATALOG = {
  ZONE_RESTRICTED: {
    code: 'ZONE_RESTRICTED',
    message: 'Keke no fit enter dis area. Choose different pickup/destination',
    statusCode: 403,
  },
  DRIVER_SUSPENDED: {
    code: 'DRIVER_SUSPENDED',
    message: 'Your account don suspend. Contact support',
    statusCode: 403,
  },
  PAYMENT_FAILED: {
    code: 'PAYMENT_FAILED',
    message: 'Payment no go through. Try another card or USSD',
    statusCode: 402,
  },
  OTP_EXPIRED: {
    code: 'OTP_EXPIRED',
    message: 'OTP don expire. Request new one',
    statusCode: 400,
  },
  OTP_INVALID: {
    code: 'OTP_INVALID',
    message: 'Wrong OTP code',
    statusCode: 400,
  },
  KYC_INCOMPLETE: {
    code: 'KYC_INCOMPLETE',
    message: 'Upload all documents before you go online',
    statusCode: 403,
  },
  DRIVER_OFFLINE: {
    code: 'DRIVER_OFFLINE',
    message: 'Driver no dey available again',
    statusCode: 409,
  },
  TRIP_ALREADY_ACTIVE: {
    code: 'TRIP_ALREADY_ACTIVE',
    message: 'You get active trip already',
    statusCode: 409,
  },
  SUBSCRIPTION_EXPIRED: {
    code: 'SUBSCRIPTION_EXPIRED',
    message: 'Your subscription don expire. Renew to continue',
    statusCode: 402,
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Wait small',
    statusCode: 429,
  },
  INVALID_ZONE: {
    code: 'INVALID_ZONE',
    message: 'Location dey outside service area',
    statusCode: 400,
  },
  DOCUMENT_TOO_LARGE: {
    code: 'DOCUMENT_TOO_LARGE',
    message: 'File too big. Max 5MB',
    statusCode: 413,
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Sign in to continue',
    statusCode: 401,
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'You no get permission for dis action',
    statusCode: 403,
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'We no fit find wetin you dey look for',
    statusCode: 404,
  },
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Some fields no correct. Check and try again',
    statusCode: 422,
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'Something go wrong for our side. Try again',
    statusCode: 500,
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service no dey available right now. Try again later',
    statusCode: 503,
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;