import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { createLogger } from '../config/logger';
import { processAnalysisJob, AnalysisJobData } from './processors/analysis';
import { processFixJob, FixJobData } from './processors/fixes';
import { processNotificationJob, NotificationJobData } from './processors/notifications';

const logger = createLogger('worker');

// Queue names
export const QUEUE_NAMES = {
  ANALYSIS: 'analysis',
  FIXES: 'fixes',
  NOTIFICATIONS: 'notifications',
} as const;

// Create queues with string job names
export const analysisQueue = new Queue<AnalysisJobData, unknown, string>(QUEUE_NAMES.ANALYSIS, {
  connection: createRedisConnection() as ConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const fixesQueue = new Queue<FixJobData, unknown, string>(QUEUE_NAMES.FIXES, {
  connection: createRedisConnection() as ConnectionOptions,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export const notificationsQueue = new Queue<NotificationJobData, unknown, string>(QUEUE_NAMES.NOTIFICATIONS, {
  connection: createRedisConnection() as ConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 500 },
  },
});

// Create workers
let analysisWorker: Worker<AnalysisJobData, unknown, string>;
let fixesWorker: Worker<FixJobData, unknown, string>;
let notificationsWorker: Worker<NotificationJobData, unknown, string>;

export function startWorkers(): void {
  const connection = createRedisConnection() as ConnectionOptions;

  // Analysis worker
  analysisWorker = new Worker<AnalysisJobData, unknown, string>(
    QUEUE_NAMES.ANALYSIS,
    async (job: Job<AnalysisJobData, unknown, string>) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing analysis job');
      return processAnalysisJob(job);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  analysisWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Analysis job completed');
  });

  analysisWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Analysis job failed');
  });

  // Fixes worker
  fixesWorker = new Worker<FixJobData, unknown, string>(
    QUEUE_NAMES.FIXES,
    async (job: Job<FixJobData, unknown, string>) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing fix job');
      return processFixJob(job);
    },
    {
      connection: createRedisConnection() as ConnectionOptions,
      concurrency: 3,
    }
  );

  fixesWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Fix job completed');
  });

  fixesWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Fix job failed');
  });

  // Notifications worker
  notificationsWorker = new Worker<NotificationJobData, unknown, string>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job: Job<NotificationJobData, unknown, string>) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing notification job');
      return processNotificationJob(job);
    },
    {
      connection: createRedisConnection() as ConnectionOptions,
      concurrency: 10,
    }
  );

  notificationsWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Notification job completed');
  });

  notificationsWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Notification job failed');
  });

  logger.info('Workers started');
}

export async function stopWorkers(): Promise<void> {
  await Promise.all([
    analysisWorker?.close(),
    fixesWorker?.close(),
    notificationsWorker?.close(),
  ]);
  logger.info('Workers stopped');
}

// Queue helper functions
export async function enqueueAnalysis(data: AnalysisJobData): Promise<string> {
  const job = await analysisQueue.add('analyze', data, {
    jobId: `analysis:${data.deliveryId}`,
  });
  return job.id!;
}

export async function enqueueFix(data: FixJobData): Promise<string> {
  const job = await fixesQueue.add('fix', data);
  return job.id!;
}

export async function enqueueNotification(data: NotificationJobData): Promise<string> {
  const job = await notificationsQueue.add('notify', data);
  return job.id!;
}
