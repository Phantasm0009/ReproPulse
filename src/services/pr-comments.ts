import { prisma } from '../lib/prisma';
import { getInstallationOctokit, createOrUpdatePRComment } from '../lib/github';
import { config } from '../config/env';
import { createLogger } from '../config/logger';

const logger = createLogger('pr-comments');

/**
 * PR Comment Manager
 * Handles single-comment thread mode for PR updates
 */
export class PRCommentManager {
  /**
   * Create or update PR comment with analysis results
   */
  async postComment(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number,
    analysisId: string,
    scores: {
      overall: number;
      workflow: number;
      supplyChain: number;
      maintainability: number;
      hygiene: number;
    },
    summary: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    },
    percentile?: { percentile: number; delta: number; cohortKey: string }
  ): Promise<void> {
    const repository = await prisma.repository.findFirst({
      where: { owner, name: repo },
    });

    if (!repository) {
      logger.warn({ owner, repo }, 'Repository not found');
      return;
    }

    // Check for existing comment
    const existingComment = await prisma.pRComment.findUnique({
      where: {
        repositoryId_prNumber: {
          repositoryId: repository.id,
          prNumber,
        },
      },
    });

    const octokit = await getInstallationOctokit(installationId);
    const commentBody = this.buildCommentBody(scores, summary, analysisId, percentile);

    const result = await createOrUpdatePRComment(
      octokit,
      owner,
      repo,
      prNumber,
      commentBody,
      existingComment ? Number(existingComment.commentId) : undefined
    );

    // Save/update comment record
    await prisma.pRComment.upsert({
      where: {
        repositoryId_prNumber: {
          repositoryId: repository.id,
          prNumber,
        },
      },
      create: {
        repositoryId: repository.id,
        prNumber,
        commentId: BigInt(result.id),
        lastAnalysisId: analysisId,
      },
      update: {
        commentId: BigInt(result.id),
        lastAnalysisId: analysisId,
      },
    });

    logger.info({ prNumber, commentId: result.id }, 'Posted PR comment');
  }

  /**
   * Build the comment body markdown
   */
  private buildCommentBody(
    scores: {
      overall: number;
      workflow: number;
      supplyChain: number;
      maintainability: number;
      hygiene: number;
    },
    summary: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    },
    analysisId: string,
    percentile?: { percentile: number; delta: number; cohortKey: string }
  ): string {
    const scoreEmoji = scores.overall >= 80 ? '🟢' : scores.overall >= 60 ? '🟡' : '🔴';
    const statusBadge = scores.overall >= 70 ? '✅ Passing' : scores.overall >= 50 ? '⚠️ Warning' : '❌ Failing';

    let body = `## ${scoreEmoji} RepoPulse Analysis

| Status | Score |
|--------|-------|
| ${statusBadge} | **${scores.overall}/100** |

### 📊 Score Breakdown

| Category | Score | Max |
|----------|-------|-----|
| Workflow Security | ${this.getScoreBar(scores.workflow, 40)} ${scores.workflow}/40 |
| Supply Chain | ${this.getScoreBar(scores.supplyChain, 30)} ${scores.supplyChain}/30 |
| Maintainability | ${this.getScoreBar(scores.maintainability, 20)} ${scores.maintainability}/20 |
| Hygiene | ${this.getScoreBar(scores.hygiene, 10)} ${scores.hygiene}/10 |

### 🔍 Findings

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${summary.critical} |
| 🟠 High | ${summary.high} |
| 🟡 Medium | ${summary.medium} |
| 🔵 Low | ${summary.low} |
| ⚪ Info | ${summary.info} |
| **Total** | **${summary.total}** |
`;

    if (percentile) {
      const trend = percentile.delta >= 0 ? '📈' : '📉';
      body += `
### 📈 Benchmark

- **${percentile.percentile}th percentile** in \`${percentile.cohortKey}\` cohort
- ${trend} ${percentile.delta >= 0 ? '+' : ''}${percentile.delta} points vs average
`;
    }

    body += `
---

<details>
<summary>What do these scores mean?</summary>

- **Workflow Security (0-40)**: GitHub Actions workflow hardening, permissions, pinned actions
- **Supply Chain (0-30)**: Dependency vulnerabilities, license compliance, typosquatting detection
- **Maintainability (0-20)**: CI/CD presence, documentation, release cadence, issue responsiveness
- **Hygiene (0-10)**: Essential files, security policy, code ownership

</details>

[📋 View Full Report](${config.urls.app}/analysis/${analysisId}) | [📚 Documentation](${config.urls.app}/docs)

---
*Powered by [RepoPulse](${config.urls.app}) | Updated: ${new Date().toISOString()}*
`;

    return body;
  }

  /**
   * Generate a text-based progress bar
   */
  private getScoreBar(score: number, max: number): string {
    const percentage = (score / max) * 100;
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  }
}

export const prCommentManager = new PRCommentManager();
