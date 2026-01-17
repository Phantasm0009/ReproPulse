import { config } from '../config/env';
import { createLogger } from '../config/logger';

const logger = createLogger('redis');

// Use dynamic import to get IORedis from BullMQ's bundled version
// to avoid version conflicts
export const createRedisConnection = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const IORedis = require('ioredis');
  const redis = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  
  redis.on('connect', () => {
    logger.info('Connected to Redis');
  });

  redis.on('error', (err: Error) => {
    logger.error({ err }, 'Redis error');
  });

  return redis;
};

// Create a singleton instance for general use
let _redis: ReturnType<typeof createRedisConnection> | null = null;

export const getRedis = () => {
  if (!_redis) {
    _redis = createRedisConnection();
  }
  return _redis;
};

export const redis = {
  get instance() {
    return getRedis();
  }
};
