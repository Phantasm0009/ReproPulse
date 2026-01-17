import { Job } from 'bullmq';
import yaml from 'js-yaml';
import { prisma } from '../../lib/prisma';
import { 
  getInstallationOctokit, 
  getRepoContent,
  createCommit,
  createPullRequest,
  createIssue,
  updateCheckRun,
} from '../../lib/github';
import { createLogger } from '../../config/logger';
import { config } from '../../config/env';

const logger = createLogger('fixes-processor');

export interface FixJobData {
  actionId: string;
  analysisId: string;
  installationId: number;
  repositoryId: number;
  owner: string;
  repo: string;
  headSha: string;
  prNumber?: number;
  prBranch?: string;
  checkRunId: number;
  triggeredBy: string;
}

export async function processFixJob(job: Job<FixJobData>): Promise<void> {
  const {
    actionId,
    analysisId,
    installationId,
    repositoryId,
    owner,
    repo,
    headSha,
    prNumber,
    prBranch,
    checkRunId,
    triggeredBy,
  } = job.data;

  logger.info({ actionId, analysisId }, 'Processing fix job');

  // Create fix run record
  const fixRun = await prisma.fixRun.create({
    data: {
      analysisId,
      repositoryId,
      actionId,
      actionLabel: getActionLabel(actionId),
      status: 'in_progress',
      triggeredBy,
      requestedAction: actionId,
      startedAt: new Date(),
    },
  });

  const octokit = await getInstallationOctokit(installationId);

  try {
    let result: FixResult;

    switch (actionId) {
      case 'pin_actions':
        result = await pinActions(octokit, owner, repo, headSha, prBranch, prNumber);
        break;
      case 'add_permissions':
        result = await addMinimalPermissions(octokit, owner, repo, headSha, prBranch, prNumber);
        break;
      case 'open_issue':
        result = await openRemediationIssue(octokit, owner, repo, analysisId);
        break;
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }

    // Update fix run
    await prisma.fixRun.update({
      where: { id: fixRun.id },
      data: {
        status: 'completed',
        result: result.success ? 'success' : 'partial',
        resultMessage: result.message,
        commitSha: result.commitSha,
        prNumber: result.prNumber,
        issueNumber: result.issueNumber,
        patchApplied: result.patch,
        completedAt: new Date(),
      },
    });

    // Update check run with fix results
    await updateCheckRun(octokit, owner, repo, checkRunId, {
      title: `Fix Applied: ${getActionLabel(actionId)}`,
      summary: `✅ ${result.message}\n\n${result.details || ''}`,
    });

    // Update champion stats
    await prisma.securityChampion.upsert({
      where: {
        repositoryId_username: { repositoryId, username: triggeredBy },
      },
      create: {
        repositoryId,
        username: triggeredBy,
        findingsFixed: 1,
        fixPRsCreated: result.prNumber ? 1 : 0,
        issuesOpened: result.issueNumber ? 1 : 0,
        lastActivityAt: new Date(),
      },
      update: {
        findingsFixed: { increment: 1 },
        fixPRsCreated: result.prNumber ? { increment: 1 } : undefined,
        issuesOpened: result.issueNumber ? { increment: 1 } : undefined,
        lastActivityAt: new Date(),
      },
    });

    logger.info({ fixRunId: fixRun.id, result }, 'Fix completed');

  } catch (error) {
    logger.error({ error, fixRunId: fixRun.id }, 'Fix failed');

    await prisma.fixRun.update({
      where: { id: fixRun.id },
      data: {
        status: 'failed',
        result: 'failed',
        resultMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

interface FixResult {
  success: boolean;
  message: string;
  details?: string;
  commitSha?: string;
  prNumber?: number;
  issueNumber?: number;
  patch?: string;
}

function getActionLabel(actionId: string): string {
  switch (actionId) {
    case 'pin_actions':
      return 'Pin Actions to SHA';
    case 'add_permissions':
      return 'Add Minimal Permissions';
    case 'open_issue':
      return 'Open Remediation Issue';
    default:
      return actionId;
  }
}

/**
 * Pin GitHub Actions to their commit SHA
 */
async function pinActions(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  repo: string,
  headSha: string,
  prBranch?: string,
  prNumber?: number
): Promise<FixResult> {
  // Get workflow files
  const workflowsDir = await octokit.repos.getContent({
    owner,
    repo,
    path: '.github/workflows',
    ref: headSha,
  }).catch(() => ({ data: [] }));

  if (!Array.isArray(workflowsDir.data)) {
    return { success: false, message: 'No workflows found' };
  }

  const workflowFiles = workflowsDir.data.filter(
    (f: { name: string; type: string }) => f.type === 'file' && (f.name.endsWith('.yml') || f.name.endsWith('.yaml'))
  );

  const updatedFiles: Array<{ path: string; content: string }> = [];
  let pinnedCount = 0;

  for (const file of workflowFiles) {
    const content = await getRepoContent(octokit, owner, repo, file.path, headSha);
    if (!content) continue;

    const { updated, count } = await pinActionsInWorkflow(octokit, content);
    
    if (count > 0) {
      updatedFiles.push({ path: file.path, content: updated });
      pinnedCount += count;
    }
  }

  if (updatedFiles.length === 0) {
    return { success: true, message: 'No unpinned actions found to fix' };
  }

  // Commit changes
  const branch = prBranch || `repopulse/pin-actions-${Date.now()}`;
  const commitMessage = `chore: pin ${pinnedCount} GitHub Action(s) to SHA

This commit pins GitHub Actions to their full commit SHA for improved
security and reproducibility.

Automated by RepoPulse 🔒`;

  try {
    if (prBranch) {
      // Commit directly to PR branch
      const commit = await createCommit(octokit, owner, repo, {
        branch: prBranch,
        message: commitMessage,
        files: updatedFiles,
        baseSha: headSha,
      });

      return {
        success: true,
        message: `Pinned ${pinnedCount} action(s) to SHA`,
        details: `Committed to branch \`${prBranch}\``,
        commitSha: commit.sha,
        patch: updatedFiles.map(f => f.path).join(', '),
      };
    } else {
      // Create new branch and PR
      const defaultBranch = (await octokit.repos.get({ owner, repo })).data.default_branch;
      
      // Create branch
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: headSha,
      });

      // Commit to new branch
      const commit = await createCommit(octokit, owner, repo, {
        branch,
        message: commitMessage,
        files: updatedFiles,
        baseSha: headSha,
      });

      // Create PR
      const pr = await createPullRequest(octokit, owner, repo, {
        title: `🔒 Pin ${pinnedCount} GitHub Action(s) to SHA`,
        body: `## Summary
This PR pins GitHub Actions to their full commit SHA for improved security.

### Changes
${updatedFiles.map(f => `- \`${f.path}\``).join('\n')}

### Why?
Using commit SHAs instead of tags prevents:
- Supply chain attacks via tag mutation
- Unexpected breaking changes
- Reproducibility issues

---
*Automated by [RepoPulse](${config.urls.app})*`,
        head: branch,
        base: defaultBranch,
      });

      return {
        success: true,
        message: `Created PR to pin ${pinnedCount} action(s)`,
        details: `PR #${pr.number}: ${pr.html_url}`,
        commitSha: commit.sha,
        prNumber: pr.number,
        patch: updatedFiles.map(f => f.path).join(', '),
      };
    }
  } catch (error) {
    logger.error({ error }, 'Failed to commit pin actions fix');
    throw error;
  }
}

/**
 * Pin actions in a single workflow file
 */
async function pinActionsInWorkflow(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  content: string
): Promise<{ updated: string; count: number }> {
  let updated = content;
  let count = 0;

  // Match uses: owner/repo@version
  const usesRegex = /uses:\s*([^@\s]+)@([^#\s\n]+)/g;
  const matches = [...content.matchAll(usesRegex)];

  for (const match of matches) {
    const [fullMatch, action, version] = match;
    
    // Skip if already a SHA (40 hex chars)
    if (/^[a-f0-9]{40}$/i.test(version)) continue;
    
    // Skip local actions
    if (action.startsWith('./')) continue;

    try {
      // Get the SHA for this tag/version
      const [actionOwner, actionRepo] = action.split('/');
      if (!actionOwner || !actionRepo) continue;

      // Try to get the ref
      const ref = await octokit.git.getRef({
        owner: actionOwner,
        repo: actionRepo.split('/')[0], // Handle nested paths like actions/checkout
        ref: `tags/${version}`,
      }).catch(() => 
        octokit.git.getRef({
          owner: actionOwner,
          repo: actionRepo.split('/')[0],
          ref: `heads/${version}`,
        })
      ).catch(() => null);

      if (ref?.data?.object?.sha) {
        const sha = ref.data.object.sha;
        const newUses = `uses: ${action}@${sha} # ${version}`;
        updated = updated.replace(fullMatch, newUses);
        count++;
      }
    } catch (error) {
      logger.debug({ error, action, version }, 'Failed to resolve action SHA');
    }
  }

  return { updated, count };
}

/**
 * Add minimal permissions policy to workflows
 */
async function addMinimalPermissions(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  repo: string,
  headSha: string,
  prBranch?: string,
  prNumber?: number
): Promise<FixResult> {
  // Get workflow files
  const workflowsDir = await octokit.repos.getContent({
    owner,
    repo,
    path: '.github/workflows',
    ref: headSha,
  }).catch(() => ({ data: [] }));

  if (!Array.isArray(workflowsDir.data)) {
    return { success: false, message: 'No workflows found' };
  }

  const workflowFiles = workflowsDir.data.filter(
    (f: { name: string; type: string }) => f.type === 'file' && (f.name.endsWith('.yml') || f.name.endsWith('.yaml'))
  );

  const updatedFiles: Array<{ path: string; content: string }> = [];

  for (const file of workflowFiles) {
    const content = await getRepoContent(octokit, owner, repo, file.path, headSha);
    if (!content) continue;

    try {
      const parsed = yaml.load(content) as Record<string, unknown>;
      
      // Check if permissions already defined
      if (parsed.permissions) continue;

      // Add minimal permissions at top level
      const updatedContent = addPermissionsToYaml(content);
      
      if (updatedContent !== content) {
        updatedFiles.push({ path: file.path, content: updatedContent });
      }
    } catch (error) {
      logger.debug({ error, file: file.path }, 'Failed to parse workflow');
    }
  }

  if (updatedFiles.length === 0) {
    return { success: true, message: 'All workflows already have permissions defined' };
  }

  const branch = prBranch || `repopulse/add-permissions-${Date.now()}`;
  const commitMessage = `chore: add minimal permissions to workflows

This commit adds explicit permissions to GitHub Actions workflows
following the principle of least privilege.

Automated by RepoPulse 🔒`;

  try {
    if (prBranch) {
      const commit = await createCommit(octokit, owner, repo, {
        branch: prBranch,
        message: commitMessage,
        files: updatedFiles,
        baseSha: headSha,
      });

      return {
        success: true,
        message: `Added permissions to ${updatedFiles.length} workflow(s)`,
        commitSha: commit.sha,
        patch: updatedFiles.map(f => f.path).join(', '),
      };
    } else {
      const defaultBranch = (await octokit.repos.get({ owner, repo })).data.default_branch;
      
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: headSha,
      });

      const commit = await createCommit(octokit, owner, repo, {
        branch,
        message: commitMessage,
        files: updatedFiles,
        baseSha: headSha,
      });

      const pr = await createPullRequest(octokit, owner, repo, {
        title: `🔒 Add minimal permissions to ${updatedFiles.length} workflow(s)`,
        body: `## Summary
This PR adds explicit \`permissions\` blocks to workflows following least privilege.

### Changes
${updatedFiles.map(f => `- \`${f.path}\``).join('\n')}

### Why?
Explicit permissions prevent:
- Workflows from having more access than needed
- Compromised workflows from doing maximum damage
- Permission escalation attacks

---
*Automated by [RepoPulse](${config.urls.app})*`,
        head: branch,
        base: defaultBranch,
      });

      return {
        success: true,
        message: `Created PR to add permissions`,
        details: `PR #${pr.number}: ${pr.html_url}`,
        commitSha: commit.sha,
        prNumber: pr.number,
        patch: updatedFiles.map(f => f.path).join(', '),
      };
    }
  } catch (error) {
    logger.error({ error }, 'Failed to commit permissions fix');
    throw error;
  }
}

/**
 * Add permissions block to YAML content
 */
function addPermissionsToYaml(content: string): string {
  const permissionsBlock = `
permissions:
  contents: read
`;

  // Find the right place to insert (after 'on:' block typically)
  const lines = content.split('\n');
  let insertIndex = -1;
  let inOnBlock = false;
  let onBlockIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (trimmed.startsWith('on:')) {
      inOnBlock = true;
      onBlockIndent = indent;
      continue;
    }

    if (inOnBlock) {
      // Check if we've exited the on block
      if (trimmed && !trimmed.startsWith('#') && indent <= onBlockIndent) {
        insertIndex = i;
        break;
      }
    }
  }

  if (insertIndex === -1) {
    // Fallback: add after name if exists, or at top
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith('name:')) {
        insertIndex = i + 1;
        break;
      }
    }
    if (insertIndex === -1) insertIndex = 0;
  }

  lines.splice(insertIndex, 0, permissionsBlock.trim());
  return lines.join('\n');
}

/**
 * Open a remediation issue
 */
async function openRemediationIssue(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  repo: string,
  analysisId: string
): Promise<FixResult> {
  // Get analysis and findings
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: {
      findings: {
        where: {
          severity: { in: ['critical', 'high'] },
          dismissed: false,
        },
        orderBy: [
          { severity: 'asc' },
          { confidence: 'desc' },
        ],
        take: 20,
      },
    },
  });

  if (!analysis) {
    return { success: false, message: 'Analysis not found' };
  }

  const findings = analysis.findings;
  
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sortedFindings = findings.sort((a, b) => 
    severityOrder[a.severity as keyof typeof severityOrder] - 
    severityOrder[b.severity as keyof typeof severityOrder]
  );

  const body = `## 🔒 Security Findings from RepoPulse

This issue was automatically created to track security findings that need remediation.

### Summary
- Overall Score: **${analysis.overallScore ?? 'N/A'}/100**
- Critical: ${analysis.criticalCount}
- High: ${analysis.highCount}

### Findings

${sortedFindings.map((f, i) => `
#### ${i + 1}. ${getSeverityEmoji(f.severity)} ${f.title}

**Severity:** ${f.severity} | **Confidence:** ${f.confidence}
${f.filePath ? `**File:** \`${f.filePath}\`${f.startLine ? `:${f.startLine}` : ''}` : ''}

${f.description}

<details>
<summary>Remediation</summary>

${f.remediation || 'No specific remediation provided.'}

</details>
`).join('\n---\n')}

### Next Steps
1. Review each finding and assess impact
2. Prioritize critical and high severity issues
3. Apply fixes (some can be auto-fixed via RepoPulse)
4. Re-run analysis to verify fixes

---
*[View full analysis](${config.urls.app}/analysis/${analysisId})*
*Generated by [RepoPulse](${config.urls.app})*`;

  const issue = await createIssue(octokit, owner, repo, {
    title: `🔒 RepoPulse: ${analysis.criticalCount + analysis.highCount} security findings need attention`,
    body,
    labels: ['security', 'repopulse'],
  });

  return {
    success: true,
    message: `Created remediation issue #${issue.number}`,
    details: issue.html_url,
    issueNumber: issue.number,
  };
}

function getSeverityEmoji(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🔵';
    default: return '⚪';
  }
}
