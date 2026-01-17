import { Job } from 'bullmq';
import { WebClient } from '@slack/web-api';
import { prisma } from '../../lib/prisma';
import { createLogger } from '../../config/logger';
import { config } from '../../config/env';

const logger = createLogger('notifications-processor');

export interface NotificationJobData {
  type: 'critical_findings' | 'score_drop' | 'policy_fail' | 'fix_applied';
  installationId: number;
  repositoryId: number;
  analysisId: string;
  data: {
    owner: string;
    repo: string;
    prNumber?: number;
    scores?: {
      overall: number;
      workflow: number;
      supplyChain: number;
      maintainability: number;
      hygiene: number;
    };
    summary?: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    };
    previousScore?: number;
    policyName?: string;
    fixType?: string;
  };
}

export async function processNotificationJob(job: Job<NotificationJobData, unknown, string>): Promise<void> {
  const { type, installationId, repositoryId, analysisId, data } = job.data;

  logger.info({ type, repositoryId }, 'Processing notification');

  // Get notification configs for this installation/repo
  const configs = await prisma.notificationConfig.findMany({
    where: {
      installationId,
      enabled: true,
      OR: [
        { repositoryId: null }, // Org-wide
        { repositoryId },
      ],
    },
  });

  if (configs.length === 0) {
    logger.debug({ installationId, repositoryId }, 'No notification configs found');
    return;
  }

  for (const notifConfig of configs) {
    // Check if this notification type should be sent
    const shouldNotify = checkShouldNotify(type, notifConfig, data);
    
    if (!shouldNotify) {
      continue;
    }

    try {
      switch (notifConfig.channelType) {
        case 'slack':
          await sendSlackNotification(notifConfig, type, data, analysisId);
          break;
        case 'discord':
          await sendDiscordNotification(notifConfig, type, data, analysisId);
          break;
        default:
          logger.warn({ channelType: notifConfig.channelType }, 'Unknown channel type');
      }
    } catch (error) {
      logger.error({ error, configId: notifConfig.id }, 'Failed to send notification');
    }
  }
}

function checkShouldNotify(
  type: NotificationJobData['type'],
  config: {
    onCritical: boolean;
    onHigh: boolean;
    onScoreDrop: boolean;
    scoreDropThreshold: number;
    onPolicyFail: boolean;
    onFixApplied: boolean;
  },
  data: NotificationJobData['data']
): boolean {
  switch (type) {
    case 'critical_findings':
      if (data.summary?.critical && data.summary.critical > 0 && config.onCritical) {
        return true;
      }
      if (data.summary?.high && data.summary.high > 0 && config.onHigh) {
        return true;
      }
      return false;
    
    case 'score_drop':
      if (!config.onScoreDrop) return false;
      const drop = (data.previousScore || 0) - (data.scores?.overall || 0);
      return drop >= config.scoreDropThreshold;
    
    case 'policy_fail':
      return config.onPolicyFail;
    
    case 'fix_applied':
      return config.onFixApplied;
    
    default:
      return false;
  }
}

async function sendSlackNotification(
  notifConfig: { channelId: string; webhookUrl: string | null },
  type: NotificationJobData['type'],
  data: NotificationJobData['data'],
  analysisId: string
): Promise<void> {
  const message = buildSlackMessage(type, data, analysisId);

  if (notifConfig.webhookUrl) {
    // Send via webhook
    await fetch(notifConfig.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  } else if (config.slack.botToken) {
    // Send via API
    const slack = new WebClient(config.slack.botToken);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await slack.chat.postMessage({
      channel: notifConfig.channelId,
      text: message.text,
      blocks: message.blocks as any,
    });
  }

  logger.info({ channel: notifConfig.channelId }, 'Sent Slack notification');
}

function buildSlackMessage(
  type: NotificationJobData['type'],
  data: NotificationJobData['data'],
  analysisId: string
): { text: string; blocks: unknown[] } {
  const repoLink = `<https://github.com/${data.owner}/${data.repo}|${data.owner}/${data.repo}>`;
  const analysisLink = `<${config.urls.app}/analysis/${analysisId}|View Analysis>`;
  const prLink = data.prNumber 
    ? `<https://github.com/${data.owner}/${data.repo}/pull/${data.prNumber}|PR #${data.prNumber}>`
    : null;

  let text = '';
  let color = '#ff0000';
  const blocks: unknown[] = [];

  switch (type) {
    case 'critical_findings':
      text = `🚨 Critical security findings in ${data.owner}/${data.repo}`;
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 Security Alert', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Repository:* ${repoLink}${prLink ? `\n*Pull Request:* ${prLink}` : ''}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Score:* ${data.scores?.overall}/100` },
            { type: 'mrkdwn', text: `*Critical:* ${data.summary?.critical || 0}` },
            { type: 'mrkdwn', text: `*High:* ${data.summary?.high || 0}` },
            { type: 'mrkdwn', text: `*Medium:* ${data.summary?.medium || 0}` },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Analysis' },
              url: `${config.urls.app}/analysis/${analysisId}`,
              style: 'primary',
            },
          ],
        }
      );
      break;

    case 'score_drop':
      color = '#ffa500';
      const drop = (data.previousScore || 0) - (data.scores?.overall || 0);
      text = `📉 Score dropped by ${drop} points in ${data.owner}/${data.repo}`;
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '📉 Score Drop Alert', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Repository:* ${repoLink}\n*Previous Score:* ${data.previousScore}\n*New Score:* ${data.scores?.overall}`,
          },
        }
      );
      break;

    case 'policy_fail':
      text = `⛔ Policy violation in ${data.owner}/${data.repo}`;
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '⛔ Policy Violation', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Repository:* ${repoLink}\n*Policy:* ${data.policyName}`,
          },
        }
      );
      break;

    case 'fix_applied':
      color = '#00ff00';
      text = `✅ Fix applied in ${data.owner}/${data.repo}`;
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '✅ Fix Applied', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Repository:* ${repoLink}\n*Fix Type:* ${data.fixType}`,
          },
        }
      );
      break;
  }

  return { text, blocks };
}

async function sendDiscordNotification(
  notifConfig: { channelId: string; webhookUrl: string | null },
  type: NotificationJobData['type'],
  data: NotificationJobData['data'],
  analysisId: string
): Promise<void> {
  if (!notifConfig.webhookUrl) {
    logger.warn('Discord notification requires webhook URL');
    return;
  }

  const embed = buildDiscordEmbed(type, data, analysisId);

  await fetch(notifConfig.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [embed],
    }),
  });

  logger.info({ channel: notifConfig.channelId }, 'Sent Discord notification');
}

function buildDiscordEmbed(
  type: NotificationJobData['type'],
  data: NotificationJobData['data'],
  analysisId: string
): Record<string, unknown> {
  const repoUrl = `https://github.com/${data.owner}/${data.repo}`;
  const analysisUrl = `${config.urls.app}/analysis/${analysisId}`;

  let title = '';
  let description = '';
  let color = 0xff0000; // Red

  switch (type) {
    case 'critical_findings':
      title = '🚨 Security Alert';
      description = `Critical findings detected in [${data.owner}/${data.repo}](${repoUrl})`;
      break;

    case 'score_drop':
      title = '📉 Score Drop Alert';
      color = 0xffa500; // Orange
      const drop = (data.previousScore || 0) - (data.scores?.overall || 0);
      description = `Score dropped by ${drop} points in [${data.owner}/${data.repo}](${repoUrl})`;
      break;

    case 'policy_fail':
      title = '⛔ Policy Violation';
      description = `Policy "${data.policyName}" violated in [${data.owner}/${data.repo}](${repoUrl})`;
      break;

    case 'fix_applied':
      title = '✅ Fix Applied';
      color = 0x00ff00; // Green
      description = `Fix "${data.fixType}" applied in [${data.owner}/${data.repo}](${repoUrl})`;
      break;
  }

  return {
    title,
    description,
    color,
    fields: [
      { name: 'Score', value: `${data.scores?.overall || 'N/A'}/100`, inline: true },
      { name: 'Critical', value: `${data.summary?.critical || 0}`, inline: true },
      { name: 'High', value: `${data.summary?.high || 0}`, inline: true },
    ],
    url: analysisUrl,
    footer: { text: 'RepoPulse Security Analysis' },
    timestamp: new Date().toISOString(),
  };
}
