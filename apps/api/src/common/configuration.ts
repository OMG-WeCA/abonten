export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  api: {
    port: parseInt(process.env.API_PORT ?? '3000', 10),
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  },
  web: {
    baseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:3001',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-dev',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  session: {
    secret: process.env.SESSION_SECRET ?? 'change-me-session-dev',
  },
  azureAd: {
    tenantId: process.env.AZURE_AD_TENANT_ID ?? '',
    clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
    redirectUrl: process.env.AZURE_AD_REDIRECT_URL ?? 'http://localhost:3000/api/auth/microsoft/callback',
  },
  mail: {
    smtpHost: process.env.SMTP_HOST ?? 'localhost',
    smtpPort: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'no-reply@abonten.local',
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
