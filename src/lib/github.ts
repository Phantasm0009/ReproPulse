import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { config } from '../config/env';
import { createLogger } from '../config/logger';

const logger = createLogger('github');

// App-level Octokit (for app endpoints)
export const appOctokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: config.github.appId,
    privateKey: config.github.privateKey,
  },
});

// Cache for installation Octokit instances
const installationOctokitCache = new Map<number, { octokit: Octokit; expiresAt: number }>();

/**
 * Get an authenticated Octokit instance for a specific installation
 */
export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const cached = installationOctokitCache.get(installationId);
  const now = Date.now();
  
  // Return cached if not expired (with 5 min buffer)
  if (cached && cached.expiresAt > now + 5 * 60 * 1000) {
    return cached.octokit;
  }
  
  logger.debug({ installationId }, 'Creating new installation Octokit');
  
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.github.appId,
      privateKey: config.github.privateKey,
      installationId,
    },
  });
  
  // Token expires in 1 hour, cache for 55 minutes
  installationOctokitCache.set(installationId, {
    octokit,
    expiresAt: now + 55 * 60 * 1000,
  });
  
  return octokit;
}

/**
 * Get repository content
 */
export async function getRepoContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    
    if ('content' in response.data && response.data.type === 'file') {
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    
    return null;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * List directory contents
 */
export async function listRepoDirectory(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<Array<{ name: string; path: string; type: string }>> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    
    if (Array.isArray(response.data)) {
      return response.data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
      }));
    }
    
    return [];
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * Get file tree for a repository
 */
export async function getRepoTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string
): Promise<Array<{ path: string; type: string; sha: string }>> {
  const response = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: sha,
    recursive: 'true',
  });
  
  return response.data.tree.map((item) => ({
    path: item.path || '',
    type: item.type || '',
    sha: item.sha || '',
  }));
}

/**
 * Compare two commits
 */
export async function compareCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  base: string,
  head: string
) {
  const response = await octokit.repos.compareCommits({
    owner,
    repo,
    base,
    head,
  });
  
  return response.data;
}

/**
 * Get pull request details
 */
export async function getPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
) {
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  
  return response.data;
}

/**
 * Get pull request files
 */
export async function getPullRequestFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
) {
  const response = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  
  return response.data;
}

/**
 * Create or update a check run
 */
export async function createCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  params: {
    name: string;
    headSha: string;
    status?: 'queued' | 'in_progress' | 'completed';
    conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
    title?: string;
    summary?: string;
    text?: string;
    detailsUrl?: string;
    actions?: Array<{
      label: string;
      description: string;
      identifier: string;
    }>;
    annotations?: Array<{
      path: string;
      start_line: number;
      end_line: number;
      annotation_level: 'notice' | 'warning' | 'failure';
      message: string;
      title?: string;
    }>;
  }
) {
  const response = await octokit.checks.create({
    owner,
    repo,
    name: params.name,
    head_sha: params.headSha,
    status: params.status,
    conclusion: params.conclusion,
    details_url: params.detailsUrl,
    output: params.title
      ? {
          title: params.title,
          summary: params.summary || '',
          text: params.text,
          annotations: params.annotations?.slice(0, 50), // Max 50 annotations per request
        }
      : undefined,
    actions: params.actions?.slice(0, 3), // Max 3 actions
  });
  
  return response.data;
}

/**
 * Update a check run
 */
export async function updateCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  params: {
    status?: 'queued' | 'in_progress' | 'completed';
    conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
    title?: string;
    summary?: string;
    text?: string;
    detailsUrl?: string;
    actions?: Array<{
      label: string;
      description: string;
      identifier: string;
    }>;
    annotations?: Array<{
      path: string;
      start_line: number;
      end_line: number;
      annotation_level: 'notice' | 'warning' | 'failure';
      message: string;
      title?: string;
    }>;
  }
) {
  const response = await octokit.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: params.status,
    conclusion: params.conclusion,
    details_url: params.detailsUrl,
    output: params.title
      ? {
          title: params.title,
          summary: params.summary || '',
          text: params.text,
          annotations: params.annotations?.slice(0, 50),
        }
      : undefined,
    actions: params.actions?.slice(0, 3),
  });
  
  return response.data;
}

/**
 * Create or update a PR comment
 */
export async function createOrUpdatePRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  existingCommentId?: number
) {
  if (existingCommentId) {
    const response = await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existingCommentId,
      body,
    });
    return response.data;
  }
  
  const response = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  return response.data;
}

/**
 * Create a commit with file changes
 */
export async function createCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  params: {
    branch: string;
    message: string;
    files: Array<{ path: string; content: string }>;
    baseSha: string;
  }
) {
  // Get the current tree
  const baseTree = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: params.baseSha,
  });
  
  // Create blobs for each file
  const blobs = await Promise.all(
    params.files.map(async (file) => {
      const blob = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content).toString('base64'),
        encoding: 'base64',
      });
      return { path: file.path, sha: blob.data.sha };
    })
  );
  
  // Create new tree
  const tree = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTree.data.sha,
    tree: blobs.map((blob) => ({
      path: blob.path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: blob.sha,
    })),
  });
  
  // Create commit
  const commit = await octokit.git.createCommit({
    owner,
    repo,
    message: params.message,
    tree: tree.data.sha,
    parents: [params.baseSha],
  });
  
  // Update branch reference
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${params.branch}`,
    sha: commit.data.sha,
  });
  
  return commit.data;
}

/**
 * Create a pull request
 */
export async function createPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  params: {
    title: string;
    body: string;
    head: string;
    base: string;
  }
) {
  const response = await octokit.pulls.create({
    owner,
    repo,
    title: params.title,
    body: params.body,
    head: params.head,
    base: params.base,
  });
  
  return response.data;
}

/**
 * Create an issue
 */
export async function createIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  params: {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
  }
) {
  const response = await octokit.issues.create({
    owner,
    repo,
    title: params.title,
    body: params.body,
    labels: params.labels,
    assignees: params.assignees,
  });
  
  return response.data;
}

/**
 * Get dependency diff using GitHub Dependency Review API
 */
export async function getDependencyDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string
) {
  try {
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/dependency-graph/compare/{basehead}',
      {
        owner,
        repo,
        basehead: `${baseSha}...${headSha}`,
      }
    );
    return response.data;
  } catch (error) {
    logger.warn({ error, owner, repo }, 'Failed to get dependency diff');
    return null;
  }
}

/**
 * Get SBOM for repository
 */
export async function getSBOM(
  octokit: Octokit,
  owner: string,
  repo: string
) {
  try {
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/dependency-graph/sbom',
      {
        owner,
        repo,
      }
    );
    return response.data;
  } catch (error) {
    logger.warn({ error, owner, repo }, 'Failed to get SBOM');
    return null;
  }
}

/**
 * Get repository stats (for maintainability analysis)
 */
export async function getRepoStats(
  octokit: Octokit,
  owner: string,
  repo: string
) {
  const [repoData, releases, issues] = await Promise.all([
    octokit.repos.get({ owner, repo }),
    octokit.repos.listReleases({ owner, repo, per_page: 10 }).catch(() => ({ data: [] })),
    octokit.issues.listForRepo({ owner, repo, state: 'all', per_page: 100 }).catch(() => ({ data: [] })),
  ]);
  
  return {
    repo: repoData.data,
    releases: releases.data,
    issues: issues.data,
  };
}
