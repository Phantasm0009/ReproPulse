import { PrismaClient } from '@prisma/client';
import { createLogger } from '../config/logger';

const logger = createLogger('prisma');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

prisma.$on('query' as never, (e: { query: string; duration: number }) => {
  logger.debug({ query: e.query, duration: e.duration }, 'Database query');
});

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error({ message: e.message }, 'Database error');
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
