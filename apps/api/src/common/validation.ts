import * as Joi from 'joi';

export default Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().default(3000),
  API_BASE_URL: Joi.string().default('http://localhost:3000'),
  WEB_BASE_URL: Joi.string().default('http://localhost:3001'),
  NEXT_PUBLIC_BASE_PATH: Joi.string()
    .allow('')
    .pattern(/^\/[^/?#]+(?:\/[^/?#]+)*$/)
    .default(''),
  JWT_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).invalid('change-me-in-dev', 'change-me-session-dev').required(),
    otherwise: Joi.string().min(8).default('change-me-in-dev'),
  }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  SESSION_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .min(32)
      .invalid('change-me-session-dev', 'change-me-in-dev', 'change-me')
      .required(),
    otherwise: Joi.string().min(8).default('change-me-session-dev'),
  }),
  EMAIL_CODE_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).invalid(Joi.ref('JWT_SECRET')).required().messages({
      'any.invalid': 'EMAIL_CODE_SECRET must be distinct from JWT_SECRET in production',
    }),
    otherwise: Joi.string().min(16).optional(),
  }),
  EMAIL_CODE_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(600),
  EMAIL_CODE_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(5),
  EMAIL_CODE_REQUEST_LIMIT: Joi.number().integer().min(1).max(10).default(3),
  EMAIL_CODE_REQUEST_WINDOW_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  EMAIL_CODE_VERIFICATION_LIMIT: Joi.number().integer().min(1).max(30).default(15),
  EMAIL_CODE_VERIFICATION_WINDOW_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  AZURE_AD_TENANT_ID: Joi.string().allow('').default(''),
  AZURE_AD_CLIENT_ID: Joi.string().allow('').default(''),
  AZURE_AD_CLIENT_SECRET: Joi.string().allow('').default(''),
  AZURE_AD_REDIRECT_URL: Joi.string().default('http://localhost:3000/api/auth/microsoft/callback'),
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().default(1025),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('no-reply@abonten.local'),
  SMTP_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(10_000),
  SMTP_GREETING_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(10_000),
  SMTP_SOCKET_TIMEOUT_MS: Joi.number().integer().min(100).max(120_000).default(15_000),
  SMTP_DELIVERY_TIMEOUT_MS: Joi.number().integer().min(100).max(120_000).default(20_000),
  DATABASE_URL: Joi.string().default('postgresql://abonten:abonten@localhost:5432/abonten'),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  S3_ENDPOINT: Joi.string().default('http://localhost:9000'),
  S3_BUCKET: Joi.string().default('abonten'),
  S3_REGION: Joi.string().default('us-east-1'),
});
