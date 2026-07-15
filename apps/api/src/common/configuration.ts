export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  api: {
    port: parseInt(process.env.API_PORT ?? '3000', 10),
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-dev',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '3600s',
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
  },
});
