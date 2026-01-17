import { Queue, Worker, Job } from 'bullmq';
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

// Create queues
export const analysisQueue = new Queue<AnalysisJobData>(QUEUE_NAMES.ANALYSIS, {
  connection: createRedisConnection(),
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

export const fixesQueue = new Queue<FixJobData>(QUEUE_NAMES.FIXES, {
  connection: createRedisConnection(),
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

export const notificationsQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATIONS, {
  connection: createRedisConnection(),
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
let analysisWorker: Worker<AnalysisJobData>;
let fixesWorker: Worker<FixJobData>;
let notificationsWorker: Worker<NotificationJobData>;

export function startWorkers(): void {
  const connection = createRedisConnection();

  // Analysis worker
  analysisWorker = new Worker<AnalysisJobData>(
    QUEUE_NAMES.ANALYSIS,
    async (job: Job<AnalysisJobData>) => {
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
  fixesWorker = new Worker<FixJobData>(
    QUEUE_NAMES.FIXES,
    async (job: Job<FixJobData>) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing fix job');
      return processFixJob(job);
    },
    {
      connection: createRedisConnection(),
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
  notificationsWorker = new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job: Job<NotificationJobData>) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing notification job');
      return processNotificationJob(job);
    },
    {
      connection: createRedisConnection(),
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
