import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { 
  getInstallationOctokit, 
  getRepoContent, 
  listRepoDirectory,
  getRepoTree,
  getPullRequest,
  getPullRequestFiles,
  getDependencyDiff,
  getSBOM,
  getRepoStats,
  createCheckRun,
  updateCheckRun,
  compareCommits,
} from '../../lib/github';
import { workflowSecurityScanner } from '../../analysis/workflow-security';
import { supplyChainScanner } from '../../analysis/supply-chain';
import { maintainabilityScanner } from '../../analysis/maintainability';
import { attackPatternScanner } from '../../analysis/attack-patterns';
import { scoringEngine, ScoringEngine } from '../../scoring/engine';
import { createLogger } from '../../config/logger';
import { config } from '../../config/env';
import { enqueueNotification } from '../queue';

const logger = createLogger('analysis-processor');

export interface AnalysisJobData {
  deliveryId: string;
  installationId: number;
  repositoryId: number;
  owner: string;
  repo: string;
  headSha: string;
  baseSha?: string;
  prNumber?: number;
  ref?: string;
  eventType: 'pull_request' | 'push';
  sender: string;
}

export async function processAnalysisJob(job: Job<AnalysisJobData, unknown, string>): Promise<void> {
  const { 
    deliveryId, 
    installationId, 
    repositoryId, 
    owner, 
    repo, 
    headSha, 
    baseSha, 
    prNumber,
    eventType,
    sender,
  } = job.data;

  // Check for idempotency
  const existingDelivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
  });

  if (existingDelivery?.processed) {
    logger.info({ deliveryId }, 'Skipping already processed delivery');
    return;
  }

  // Mark delivery as being processed
  await prisma.webhookDelivery.upsert({
    where: { id: deliveryId },
    create: { id: deliveryId, event: eventType, processed: false },
    update: {},
  });

  // Get or create repository record
  let repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
  });

  if (!repository) {
    const octokit = await getInstallationOctokit(installationId);
    const repoData = await octokit.repos.get({ owner, repo });
    
    repository = await prisma.repository.create({
      data: {
        githubId: repoData.data.id,
        installationId,
        owner,
        name: repo,
        fullName: repoData.data.full_name,
        private: repoData.data.private,
        defaultBranch: repoData.data.default_branch,
        language: repoData.data.language,
        sizeBucket: ScoringEngine.getSizeBucket(repoData.data.size),
        stars: repoData.data.stargazers_count,
        forks: repoData.data.forks_count,
      },
    });
  }

  // Create analysis record
  const analysis = await prisma.analysis.create({
    data: {
      repositoryId: repository.id,
      headSha,
      baseSha,
      prNumber,
      eventType,
      status: 'in_progress',
      deliveryId,
      startedAt: new Date(),
    },
  });

  const octokit = await getInstallationOctokit(installationId);

  // Create initial check run
  const checkRun = await createCheckRun(octokit, owner, repo, {
    name: 'RepoPulse Security Analysis',
    headSha,
    status: 'in_progress',
    title: 'Analyzing...',
    summary: 'RepoPulse is analyzing your code for security and health issues.',
    detailsUrl: `${config.urls.app}/repos/${owner}/${repo}/analysis/${analysis.id}`,
  });

  await prisma.analysis.update({
    where: { id: analysis.id },
    data: { checkRunId: BigInt(checkRun.id) },
  });

  try {
    // Run all analyses
    const [workflowFindings, supplyChainFindings, maintainabilityFindings, attackPatternFindings] = 
      await Promise.all([
        analyzeWorkflows(octokit, owner, repo, headSha),
        analyzeSupplyChain(octokit, owner, repo, headSha, baseSha),
        analyzeMaintainability(octokit, owner, repo, headSha),
        analyzeAttackPatterns(octokit, owner, repo, headSha, baseSha, prNumber),
      ]);

    // Calculate scores
    const isPR = eventType === 'pull_request';
    const scores = scoringEngine.calculateScores(
      workflowFindings,
      supplyChainFindings,
      maintainabilityFindings,
      attackPatternFindings,
      { isPR }
    );

    // Get benchmark percentile
    const percentileData = await scoringEngine.calculatePercentile(
      scores.overall,
      repository.language,
      repository.sizeBucket
    );

    // Summarize findings
    const summary = scoringEngine.summarizeFindings(
      workflowFindings,
      supplyChainFindings,
      maintainabilityFindings,
      attackPatternFindings
    );

    // Determine conclusion
    let conclusion: 'success' | 'failure' | 'neutral' | 'action_required' = 'success';
    
    if (summary.critical > 0) {
      conclusion = 'failure';
    } else if (summary.high > 0 || scores.overall < 50) {
      conclusion = 'action_required';
    } else if (summary.medium > 0 || scores.overall < 70) {
      conclusion = 'neutral';
    }

    // Store findings in database
    const allFindings = [
      ...workflowFindings.map(f => ({ ...f, category: 'workflow_security' })),
      ...supplyChainFindings.map(f => ({ ...f, category: 'supply_chain' })),
      ...maintainabilityFindings.map(f => ({ ...f, category: 'maintainability' })),
      ...attackPatternFindings.map(f => ({ ...f, category: 'attack_pattern' })),
    ];

    for (const finding of allFindings) {
      await prisma.finding.create({
        data: {
          analysisId: analysis.id,
          repositoryId: repository.id,
          category: finding.category,
          ruleId: finding.ruleId,
          ruleName: finding.ruleName,
          severity: finding.severity,
          confidence: finding.confidence,
          filePath: 'filePath' in finding ? (finding.filePath as string | undefined) : undefined,
          startLine: 'startLine' in finding ? (finding.startLine as number | undefined) : undefined,
          endLine: 'endLine' in finding ? (finding.endLine as number | undefined) : undefined,
          title: finding.title,
          description: finding.description,
          remediation: finding.remediation,
          snippet: 'snippet' in finding ? (finding.snippet as string | undefined) : undefined,
          metadata: finding.metadata ? JSON.parse(JSON.stringify(finding.metadata)) : undefined,
          isNew: isPR, // Mark as new if from PR
          fixable: isFixable(finding),
          fixType: getFixType(finding),
        },
      });
    }

    // Build check run output
    const checkRunOutput = buildCheckRunOutput(
      scores,
      summary,
      allFindings.slice(0, 5), // Top 5 findings
      percentileData,
      analysis.id
    );

    // Build action buttons
    const actions = buildCheckRunActions(workflowFindings, summary);

    // Update check run with results
    await updateCheckRun(octokit, owner, repo, checkRun.id, {
      status: 'completed',
      conclusion,
      title: checkRunOutput.title,
      summary: checkRunOutput.summary,
      text: checkRunOutput.text,
      actions,
      detailsUrl: `${config.urls.app}/repos/${owner}/${repo}/analysis/${analysis.id}`,
      annotations: buildAnnotations(allFindings.slice(0, 50)), // Max 50 annotations
    });

    // Update analysis record
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: 'completed',
        conclusion,
        overallScore: scores.overall,
        workflowScore: scores.workflow,
        supplyChainScore: scores.supplyChain,
        maintainabilityScore: scores.maintainability,
        hygieneScore: scores.hygiene,
        percentile: percentileData?.percentile,
        percentileDelta: percentileData?.delta,
        cohortKey: percentileData?.cohortKey,
        summary: checkRunOutput.title,
        findingsCount: summary.total,
        criticalCount: summary.critical,
        highCount: summary.high,
        mediumCount: summary.medium,
        lowCount: summary.low,
        completedAt: new Date(),
      },
    });

    // Mark delivery as processed
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { processed: true, processedAt: new Date() },
    });

    // Queue notifications if needed
    if (summary.critical > 0 || summary.high > 0) {
      await enqueueNotification({
        type: 'critical_findings',
        installationId,
        repositoryId: repository.id,
        analysisId: analysis.id,
        data: {
          owner,
          repo,
          prNumber,
          scores,
          summary,
        },
      });
    }

    // Update security champions stats
    await updateChampionStats(repository.id, sender, summary, isPR);

    logger.info({ analysisId: analysis.id, scores, summary }, 'Analysis completed');

  } catch (error) {
    logger.error({ error, analysisId: analysis.id }, 'Analysis failed');

    // Update check run with failure
    await updateCheckRun(octokit, owner, repo, checkRun.id, {
      status: 'completed',
      conclusion: 'failure',
      title: 'Analysis Failed',
      summary: `An error occurred during analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });

    // Update analysis record
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: 'failed',
        conclusion: 'failure',
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

async function analyzeWorkflows(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  repo: string,
  ref: string
) {
  try {
    const workflowDir = await listRepoDirectory(octokit, owner, repo, '.github/workflows', ref);
    const workflowFiles = workflowDir.filter(f => 
      f.type === 'file' && (f.name.endsWith('.yml') || f.name.endsWith('.yaml'))
    );

    const workflows = await Promise.all(
      workflowFiles.map(async (f) => {
        const content = await getRepoContent(octokit, owner, repo, f.path, ref);
        return { path: f.path, content: content || '' };
      })
    );

    return workflowSecurityScanner.scan(workflows);
  } catch (error) {
    logger.warn({ error }, 'Failed to analyze workflows');
    return [];
  }
}

async function analyzeSupplyChain(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  repo: string,
  headSha: string,
  baseSha?: string
) {
  const findings: Awaited<ReturnType<typeof supplyChainScanner.analyzeDependencyDiff>> = [];

  try {
    // Get dependency diff if we have base SHA
    if (baseSha) {
      const diffData = await getDependencyDiff(octokit, owner, repo, baseSha, headSha);
      if (diffData) {
        const diffFindings = await supplyChainScanner.analyzeDependencyDiff(diffData);
        findings.push(...diffFindings);
      }
    }

    // Get SBOM
    const sbomData = await getSBOM(octokit, owner, repo);
    if (sbomData) {
      const sbomFindings = await supplyChainScanner.analyzeSBOM(sbomData);
      findings.push(...sbomFindings);
    }

    return findings;
  } catch (error) {
    logger.warn({ error }, 'Failed to analyze supply chain');
    return findings;
  }
}

async function analyzeMaintainability(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  repo: string,
  ref: string
) {
  try {
    const [rawStats, tree] = await Promise.all([
      getRepoStats(octokit, owner, repo),
      getRepoTree(octokit, owner, repo, ref),
    ]);

    // Transform stats to match expected type
    const stats = {
      repo: rawStats.repo,
      releases: rawStats.releases.map(r => ({
        id: r.id,
        tag_name: r.tag_name,
        published_at: r.published_at || null,
        prerelease: r.prerelease,
        draft: r.draft,
      })),
      issues: rawStats.issues.map(i => ({
        id: i.id,
        number: i.number,
        state: i.state,
        created_at: i.created_at,
        updated_at: i.updated_at,
        closed_at: i.closed_at,
        pull_request: i.pull_request,
        labels: (i.labels || []).map(l => 
          typeof l === 'string' ? { name: l } : { name: l.name || '' }
        ),
      })),
    };

    return maintainabilityScanner.analyze(stats, tree);
  } catch (error) {
    logger.warn({ error }, 'Failed to analyze maintainability');
    return [];
  }
}

async function analyzeAttackPatterns(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  repo: string,
  headSha: string,
  baseSha?: string,
  prNumber?: number
) {
  try {
    let files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
      patch?: string;
      previous_filename?: string;
    }> = [];

    let commits: Array<{
      sha: string;
      commit: { message: string; verification?: { verified: boolean; reason: string } };
      author?: { login: string };
    }> = [];

    if (prNumber) {
      // Get PR files and commits
      const prFiles = await getPullRequestFiles(octokit, owner, repo, prNumber);
      files = prFiles.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
        previous_filename: f.previous_filename,
      }));

      const prData = await getPullRequest(octokit, owner, repo, prNumber);
      // Would need to fetch commits separately
    } else if (baseSha) {
      // Get compare data
      const compare = await compareCommits(octokit, owner, repo, baseSha, headSha);
      files = (compare.files || []).map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
        previous_filename: f.previous_filename,
      }));
      commits = compare.commits.map(c => ({
        sha: c.sha,
        commit: {
          message: c.commit.message,
          verification: c.commit.verification,
        },
        author: c.author ? { login: c.author.login } : undefined,
      }));
    }

    // Check for workflow permission changes
    const workflowChanges: Array<{
      file: string;
      oldPermissions?: unknown;
      newPermissions?: unknown;
    }> = [];
    
    const workflowFiles = files.filter(f => f.filename.startsWith('.github/workflows/'));
    // Would need to compare old vs new permissions - simplified for now

    return attackPatternScanner.analyze(files, commits, workflowChanges);
  } catch (error) {
    logger.warn({ error }, 'Failed to analyze attack patterns');
    return [];
  }
}

function isFixable(finding: { ruleId: string }): boolean {
  const fixableRules = [
    'WF200', // Unpinned actions
    'WF300', // Write-all permissions
    'WF301', // Broad write permissions
  ];
  return fixableRules.includes(finding.ruleId);
}

function getFixType(finding: { ruleId: string }): string | undefined {
  if (finding.ruleId === 'WF200') return 'pin_actions';
  if (finding.ruleId.startsWith('WF3')) return 'add_permissions';
  return undefined;
}

function buildCheckRunOutput(
  scores: ReturnType<typeof scoringEngine.calculateScores>,
  summary: ReturnType<typeof scoringEngine.summarizeFindings>,
  topFindings: Array<{ title: string; severity: string; description: string; filePath?: string }>,
  percentileData: Awaited<ReturnType<typeof scoringEngine.calculatePercentile>>,
  analysisId: string
) {
  const scoreEmoji = scores.overall >= 80 ? '🟢' : scores.overall >= 60 ? '🟡' : '🔴';
  const title = `${scoreEmoji} Health Score: ${scores.overall}/100`;

  let summaryText = `
## RepoPulse Analysis Results

| Category | Score | Max |
|----------|-------|-----|
| Overall | **${scores.overall}** | 100 |
| Workflow Security | ${scores.workflow} | 40 |
| Supply Chain | ${scores.supplyChain} | 30 |
| Maintainability | ${scores.maintainability} | 20 |
| Hygiene | ${scores.hygiene} | 10 |

### Findings Summary
- 🔴 Critical: ${summary.critical}
- 🟠 High: ${summary.high}
- 🟡 Medium: ${summary.medium}
- 🔵 Low: ${summary.low}
- ⚪ Info: ${summary.info}
`;

  if (percentileData) {
    const trend = percentileData.delta >= 0 ? '📈' : '📉';
    summaryText += `
### Benchmark
- Percentile: **${percentileData.percentile}th** in ${percentileData.cohortKey} cohort
- Trend: ${trend} ${percentileData.delta >= 0 ? '+' : ''}${percentileData.delta} vs average
`;
  }

  let text = '';
  if (topFindings.length > 0) {
    text = '## Top Findings\n\n';
    for (const finding of topFindings) {
      const icon = finding.severity === 'critical' ? '🔴' : 
                   finding.severity === 'high' ? '🟠' :
                   finding.severity === 'medium' ? '🟡' : '🔵';
      text += `### ${icon} ${finding.title}\n`;
      text += `${finding.description}\n`;
      if (finding.filePath) {
        text += `📄 \`${finding.filePath}\`\n`;
      }
      text += '\n';
    }
    text += `\n[View all findings →](${config.urls.app}/analysis/${analysisId})`;
  }

  return { title, summary: summaryText, text };
}

function buildCheckRunActions(
  workflowFindings: Awaited<ReturnType<typeof workflowSecurityScanner.scan>>,
  summary: ReturnType<typeof scoringEngine.summarizeFindings>
): Array<{ label: string; description: string; identifier: string }> {
  const actions: Array<{ label: string; description: string; identifier: string }> = [];

  // Check if we have pinnable actions
  const unpinnedActions = workflowFindings.filter(f => f.ruleId === 'WF200');
  if (unpinnedActions.length > 0) {
    actions.push({
      label: '📌 Pin Actions',
      description: `Pin ${unpinnedActions.length} action(s) to SHA`,
      identifier: 'pin_actions',
    });
  }

  // Check if we have permission issues
  const permissionIssues = workflowFindings.filter(f => f.ruleId.startsWith('WF3'));
  if (permissionIssues.length > 0) {
    actions.push({
      label: '🔒 Add Permissions',
      description: 'Add minimal permissions policy',
      identifier: 'add_permissions',
    });
  }

  // Always offer to open an issue for remediation
  if (summary.critical > 0 || summary.high > 0) {
    actions.push({
      label: '📝 Open Issue',
      description: 'Create remediation issue',
      identifier: 'open_issue',
    });
  }

  return actions.slice(0, 3); // Max 3 actions
}

function buildAnnotations(
  findings: Array<{
    title: string;
    severity: string;
    description: string;
    filePath?: string;
    startLine?: number;
    endLine?: number;
  }>
): Array<{
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
  title?: string;
}> {
  return findings
    .filter(f => f.filePath && f.startLine)
    .map(f => ({
      path: f.filePath!,
      start_line: f.startLine!,
      end_line: f.endLine || f.startLine!,
      annotation_level: f.severity === 'critical' || f.severity === 'high' ? 'failure' :
                        f.severity === 'medium' ? 'warning' : 'notice',
      message: f.description,
      title: f.title,
    }));
}

async function updateChampionStats(
  repositoryId: number,
  username: string,
  summary: ReturnType<typeof scoringEngine.summarizeFindings>,
  isPR: boolean
): Promise<void> {
  try {
    await prisma.securityChampion.upsert({
      where: {
        repositoryId_username: { repositoryId, username },
      },
      create: {
        repositoryId,
        username,
        findingsIntroduced: isPR ? summary.total : 0,
        lastActivityAt: new Date(),
      },
      update: {
        findingsIntroduced: isPR ? { increment: summary.total } : undefined,
        lastActivityAt: new Date(),
      },
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to update champion stats');
  }
}
