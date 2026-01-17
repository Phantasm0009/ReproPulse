import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // GitHub App
  GITHUB_APP_ID: z.string().min(1, 'GITHUB_APP_ID is required'),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1, 'GITHUB_APP_PRIVATE_KEY is required'),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, 'GITHUB_WEBHOOK_SECRET is required'),
  GITHUB_CLIENT_ID: z.string().min(1, 'GITHUB_CLIENT_ID is required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GITHUB_CLIENT_SECRET is required'),
  
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Server
  PORT: z.string().default('3001').transform(Number),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  // URLs
  APP_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:3001'),
  
  // Webhook proxy for local dev
  WEBHOOK_PROXY_URL: z.string().optional(),
  SMEE_URL: z.string().optional(),
  
  // Slack (optional)
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  
  // Discord (optional)
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  
  // Encryption
  ENCRYPTION_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Handle multiline private key from env
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (privateKey) {
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
  }
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

export const env = loadEnv();

export const config = {
  github: {
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  },
  database: {
    url: env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
  },
  server: {
    port: env.PORT,
    host: env.HOST,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
  },
  urls: {
    app: env.APP_URL,
    api: env.API_URL,
    webhookProxy: env.WEBHOOK_PROXY_URL || env.SMEE_URL,
  },
  slack: {
    botToken: env.SLACK_BOT_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
  },
  discord: {
    botToken: env.DISCORD_BOT_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
  },
  encryption: {
    key: env.ENCRYPTION_KEY,
  },
} as const;
