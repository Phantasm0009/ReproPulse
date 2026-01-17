import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config, createLogger } from './config';
import { webhooks } from './webhooks';
import { prisma } from './lib/prisma';
import { apiRoutes } from './routes/api';
import { authRoutes } from './routes/auth';

const logger = createLogger('server');

const server = Fastify({
  logger: {
    level: config.server.logLevel,
    transport: config.server.isDev
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
  },
});

async function main() {
  // Register CORS
  await server.register(cors, {
    origin: [config.urls.app, 'http://localhost:3000'],
    credentials: true,
  });

  // Health check
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // GitHub webhook endpoint
  server.post('/api/webhooks/github', async (request, reply) => {
    const id = request.headers['x-github-delivery'] as string;
    const event = request.headers['x-github-event'] as string;
    const signature = request.headers['x-hub-signature-256'] as string;

    if (!id || !event || !signature) {
      return reply.status(400).send({ error: 'Missing required headers' });
    }

    try {
      await webhooks.verifyAndReceive({
        id,
        name: event as any,
        signature,
        payload: JSON.stringify(request.body),
      });

      return reply.status(200).send({ received: true });
    } catch (error) {
      logger.error({ error, event, id }, 'Webhook verification failed');
      return reply.status(401).send({ error: 'Webhook verification failed' });
    }
  });

  // Register API routes
  await server.register(apiRoutes, { prefix: '/api' });
  await server.register(authRoutes, { prefix: '/api/auth' });

  // Start server
  try {
    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info({
      port: config.server.port,
      host: config.server.host,
      env: config.server.nodeEnv,
    }, 'Server started');

    // Setup webhook proxy for local development
    if (config.server.isDev && config.urls.webhookProxy) {
      const SmeeClient = (await import('smee-client')).default;
      const smee = new SmeeClient({
        source: config.urls.webhookProxy,
        target: `http://localhost:${config.server.port}/api/webhooks/github`,
        logger: {
          info: (msg: string) => logger.info(msg),
          error: (msg: string) => logger.error(msg),
        },
      });
      smee.start();
      logger.info({ proxy: config.urls.webhookProxy }, 'Webhook proxy started');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
