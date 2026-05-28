import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(1).default('dev-only-change-me'),
  JWT_EXPIRES_IN: z.string().min(1).default('2h'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
});

const parsed = configSchema.parse(process.env);

if (parsed.NODE_ENV === 'production' && parsed.JWT_SECRET === 'dev-only-change-me') {
  throw new Error('JWT_SECRET must be set to a non-default value in production.');
}

export const config = Object.freeze({
  port: parsed.PORT,
  nodeEnv: parsed.NODE_ENV,
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  corsOrigin: parsed.CORS_ORIGIN,
});
