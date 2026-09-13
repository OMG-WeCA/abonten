const isProduction = () => process.env.NODE_ENV === 'production';

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  api: {
    port: parseInt(process.env.API_PORT ?? '3000', 10),
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  },
  web: {
    baseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:3001',
    basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  },
  jwt: {
    // Validation requires an explicit secret in production; only development has a fallback.
    secret: process.env.JWT_SECRET ?? (isProduction() ? undefined : 'change-me-in-dev'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  session: {
    // OIDC state/nonce sessions require an explicit secret in production.
    secret: process.env.SESSION_SECRET ?? (isProduction() ? undefined : 'change-me-session-dev'),
  },
  auth: {
    // Development may reuse the JWT secret for convenience. Production requires a distinct key.
    emailCodeSecret:
      process.env.EMAIL_CODE_SECRET ??
      (isProduction() ? undefined : (process.env.JWT_SECRET ?? 'change-me-in-dev')),
    emailCodeTtlSeconds: parseInt(process.env.EMAIL_CODE_TTL_SECONDS ?? '600', 10),
    emailCodeMaxAttempts: parseInt(process.env.EMAIL_CODE_MAX_ATTEMPTS ?? '5', 10),
    emailCodeRequestLimit: parseInt(process.env.EMAIL_CODE_REQUEST_LIMIT ?? '3', 10),
    emailCodeRequestWindowSeconds: parseInt(
      process.env.EMAIL_CODE_REQUEST_WINDOW_SECONDS ?? '900',
      10,
    ),
    emailCodeVerificationLimit: parseInt(process.env.EMAIL_CODE_VERIFICATION_LIMIT ?? '15', 10),
    emailCodeVerificationWindowSeconds: parseInt(
      process.env.EMAIL_CODE_VERIFICATION_WINDOW_SECONDS ?? '900',
      10,
    ),
  },
  azureAd: {
    tenantId: process.env.AZURE_AD_TENANT_ID ?? '',
    clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
    redirectUrl:
      process.env.AZURE_AD_REDIRECT_URL ?? 'http://localhost:3000/api/auth/microsoft/callback',
  },
  mail: {
    smtpHost: process.env.SMTP_HOST ?? 'localhost',
    smtpPort: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'no-reply@abonten.local',
    connectionTimeoutMs: parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? '10000', 10),
    greetingTimeoutMs: parseInt(process.env.SMTP_GREETING_TIMEOUT_MS ?? '10000', 10),
    socketTimeoutMs: parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS ?? '15000', 10),
    deliveryTimeoutMs: parseInt(process.env.SMTP_DELIVERY_TIMEOUT_MS ?? '20000', 10),
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://abonten:abonten@localhost:5432/abonten',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    bucket: process.env.S3_BUCKET ?? 'abonten',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY ?? '',
    secretKey: process.env.S3_SECRET_KEY ?? '',
  },
});
