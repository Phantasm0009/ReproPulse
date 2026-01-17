import pino from 'pino';
import { config } from './env';

export const logger = pino({
  level: config.server.logLevel,
  transport: config.server.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export const createLogger = (name: string) => logger.child({ name });
