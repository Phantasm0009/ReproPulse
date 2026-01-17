import { Redis } from 'ioredis';
import { config } from '../config/env';
import { createLogger } from '../config/logger';

const logger = createLogger('redis');

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

export const createRedisConnection = () => {
  return new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
};
