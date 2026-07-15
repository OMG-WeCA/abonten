import * as Joi from 'joi';

export default Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().default(3000),
  API_BASE_URL: Joi.string().default('http://localhost:3000'),
  JWT_SECRET: Joi.string().min(8).default('change-me-in-dev'),
  JWT_EXPIRES_IN: Joi.string().default('3600s'),
  DATABASE_URL: Joi.string().default('postgresql://abonten:abonten@localhost:5432/abonten'),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  S3_ENDPOINT: Joi.string().default('http://localhost:9000'),
  S3_BUCKET: Joi.string().default('abonten'),
  S3_REGION: Joi.string().default('us-east-1'),
});
