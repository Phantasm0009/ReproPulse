import { Webhooks, createNodeMiddleware } from '@octokit/webhooks';
import type {
  PullRequestEvent,
  PushEvent,
  CheckRunEvent,
  InstallationEvent,
  InstallationRepositoriesEvent,
} from '@octokit/webhooks-types';
import { config } from '../config/env';
import { createLogger } from '../config/logger';
import { prisma } from '../lib/prisma';
import { enqueueAnalysis, enqueueFix } from '../worker/queue';
import type { AnalysisJobData } from '../worker/processors/analysis';
import type { FixJobData } from '../worker/processors/fixes';

const logger = createLogger('webhooks');

export const webhooks = new Webhooks({
  secret: config.github.webhookSecret,
});

// Webhook middleware for Fastify
export const webhookMiddleware = createNodeMiddleware(webhooks, {
  path: '/api/webhooks/github',
});

/**
 * Handle pull_request events (opened, synchronize, reopened)
 */
webhooks.on(['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'], async ({ id, payload }) => {
  const event = payload as PullRequestEvent;
  
  logger.info({
    deliveryId: id,
    action: event.action,
    repo: event.repository.full_name,
    prNumber: event.pull_request.number,
  }, 'Received pull_request event');

  const jobData: AnalysisJobData = {
    deliveryId: id,
    installationId: event.installation?.id || 0,
    repositoryId: event.repository.id,
    owner: event.repository.owner.login,
    repo: event.repository.name,
    headSha: event.pull_request.head.sha,
    baseSha: event.pull_request.base.sha,
    prNumber: event.pull_request.number,
    ref: event.pull_request.head.ref,
    eventType: 'pull_request',
    sender: event.sender.login,
  };

  await enqueueAnalysis(jobData);
  
  logger.info({ deliveryId: id }, 'Queued analysis job');
});

/**
 * Handle push events
 */
webhooks.on('push', async ({ id, payload }) => {
  const event = payload as PushEvent;
  
  // Skip if deleted branch or no commits
  if (event.deleted || !event.after || event.after === '0000000000000000000000000000000000000000') {
    return;
  }

  // Only analyze pushes to default branch
  const defaultBranch = event.repository.default_branch;
  const ref = event.ref.replace('refs/heads/', '');
  
  if (ref !== defaultBranch) {
    logger.debug({ ref, defaultBranch }, 'Skipping push to non-default branch');
    return;
  }

  logger.info({
    deliveryId: id,
    repo: event.repository.full_name,
    ref: event.ref,
    commits: event.commits.length,
  }, 'Received push event');

  const jobData: AnalysisJobData = {
    deliveryId: id,
    installationId: event.installation?.id || 0,
    repositoryId: event.repository.id,
    owner: event.repository.owner.login || event.repository.owner.name || '',
    repo: event.repository.name,
    headSha: event.after,
    baseSha: event.before !== '0000000000000000000000000000000000000000' ? event.before : undefined,
    ref: event.ref,
    eventType: 'push',
    sender: event.sender.login,
  };

  await enqueueAnalysis(jobData);
  
  logger.info({ deliveryId: id }, 'Queued analysis job');
});

/**
 * Handle check_run events (requested_action, rerequested)
 */
webhooks.on(['check_run.requested_action', 'check_run.rerequested'], async ({ id, payload }) => {
  const event = payload as CheckRunEvent;
  
  logger.info({
    deliveryId: id,
    action: event.action,
    repo: event.repository.full_name,
    checkRunId: event.check_run.id,
  }, 'Received check_run event');

  // Handle requested_action (one-click fix buttons)
  if (event.action === 'requested_action' && 'requested_action' in event) {
    const actionId = event.requested_action?.identifier;
    
    if (!actionId) {
      logger.warn({ deliveryId: id }, 'No action identifier in requested_action');
      return;
    }

    // Find the analysis associated with this check run
    const analysis = await prisma.analysis.findFirst({
      where: {
        checkRunId: BigInt(event.check_run.id),
      },
    });

    if (!analysis) {
      logger.warn({ checkRunId: event.check_run.id }, 'Analysis not found for check run');
      return;
    }

    // Get PR info if available
    const prNumber = event.check_run.pull_requests?.[0]?.number;
    const prBranch = event.check_run.pull_requests?.[0]?.head?.ref;

    const fixJobData: FixJobData = {
      actionId,
      analysisId: analysis.id,
      installationId: event.installation?.id || 0,
      repositoryId: event.repository.id,
      owner: event.repository.owner.login,
      repo: event.repository.name,
      headSha: event.check_run.head_sha,
      prNumber,
      prBranch,
      checkRunId: event.check_run.id,
      triggeredBy: event.sender.login,
    };

    await enqueueFix(fixJobData);
    
    logger.info({ deliveryId: id, actionId }, 'Queued fix job');
  }

  // Handle rerequested (re-run check)
  if (event.action === 'rerequested') {
    // Find the original analysis and re-queue it
    const analysis = await prisma.analysis.findFirst({
      where: {
        checkRunId: BigInt(event.check_run.id),
      },
      include: {
        repository: true,
      },
    });

    if (analysis) {
      const jobData: AnalysisJobData = {
        deliveryId: `rerun:${id}`,
        installationId: event.installation?.id || 0,
        repositoryId: analysis.repositoryId,
        owner: analysis.repository.owner,
        repo: analysis.repository.name,
        headSha: event.check_run.head_sha,
        baseSha: analysis.baseSha || undefined,
        prNumber: analysis.prNumber || undefined,
        eventType: analysis.eventType as 'pull_request' | 'push',
        sender: event.sender.login,
      };

      await enqueueAnalysis(jobData);
      
      logger.info({ deliveryId: id }, 'Queued re-run analysis job');
    }
  }
});

/**
 * Handle installation events
 */
webhooks.on(['installation.created', 'installation.deleted', 'installation.suspend', 'installation.unsuspend'], async ({ id, payload }) => {
  const event = payload as InstallationEvent;
  
  logger.info({
    deliveryId: id,
    action: event.action,
    installationId: event.installation.id,
    account: event.installation.account.login,
  }, 'Received installation event');

  if (event.action === 'created') {
    // Create installation record
    await prisma.installation.create({
      data: {
        installationId: event.installation.id,
        accountId: event.installation.account.id,
        accountLogin: event.installation.account.login,
        accountType: event.installation.account.type,
        targetType: event.installation.target_type,
        permissions: event.installation.permissions as object,
        events: event.installation.events,
        repositorySelection: event.installation.repository_selection,
      },
    });

    // Create repository records for selected repos
    if (event.repositories) {
      for (const repo of event.repositories) {
        await prisma.repository.upsert({
          where: { githubId: repo.id },
          create: {
            githubId: repo.id,
            installationId: event.installation.id,
            owner: event.installation.account.login,
            name: repo.name,
            fullName: repo.full_name,
            private: repo.private,
          },
          update: {
            installationId: event.installation.id,
          },
        });
      }
    }
  } else if (event.action === 'deleted') {
    // Mark installation as deleted (soft delete)
    await prisma.installation.update({
      where: { installationId: event.installation.id },
      data: { suspended: true, suspendedAt: new Date() },
    }).catch(() => {});
  } else if (event.action === 'suspend') {
    await prisma.installation.update({
      where: { installationId: event.installation.id },
      data: { suspended: true, suspendedAt: new Date() },
    }).catch(() => {});
  } else if (event.action === 'unsuspend') {
    await prisma.installation.update({
      where: { installationId: event.installation.id },
      data: { suspended: false, suspendedAt: null },
    }).catch(() => {});
  }
});

/**
 * Handle installation_repositories events
 */
webhooks.on(['installation_repositories.added', 'installation_repositories.removed'], async ({ id, payload }) => {
  const event = payload as InstallationRepositoriesEvent;
  
  logger.info({
    deliveryId: id,
    action: event.action,
    installationId: event.installation.id,
    reposAdded: event.repositories_added?.length || 0,
    reposRemoved: event.repositories_removed?.length || 0,
  }, 'Received installation_repositories event');

  if (event.action === 'added' && event.repositories_added) {
    for (const repo of event.repositories_added) {
      await prisma.repository.upsert({
        where: { githubId: repo.id },
        create: {
          githubId: repo.id,
          installationId: event.installation.id,
          owner: event.installation.account.login,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
        },
        update: {
          installationId: event.installation.id,
        },
      });
    }
  }

  if (event.action === 'removed' && event.repositories_removed) {
    for (const repo of event.repositories_removed) {
      // Soft delete - just mark as disabled
      await prisma.repository.update({
        where: { githubId: repo.id },
        data: { disabled: true },
      }).catch(() => {});
    }
  }
});

// Log all webhook errors
webhooks.onError((error) => {
  logger.error({ error }, 'Webhook error');
});
