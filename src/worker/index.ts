import { startWorkers, stopWorkers } from './queue';
import { createLogger } from '../config/logger';

const logger = createLogger('worker-main');

async function main() {
  logger.info('Starting RepoPulse workers...');
  
  startWorkers();

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await stopWorkers();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Workers running. Press Ctrl+C to stop.');
}

main().catch((error) => {
  logger.error({ error }, 'Worker startup failed');
  process.exit(1);
});
