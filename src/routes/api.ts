import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { policyEngine } from '../services/policy-engine';
import { createLogger } from '../config/logger';

const logger = createLogger('api');

export async function apiRoutes(server: FastifyInstance) {
  // Get installations
  server.get('/installations', async (request, reply) => {
    const installations = await prisma.installation.findMany({
      where: { suspended: false },
      include: {
        repositories: {
          where: { disabled: false },
          select: { id: true, name: true, fullName: true },
        },
        _count: {
          select: { repositories: true, policies: true },
        },
      },
    });
    return installations;
  });

  // Get single installation by ID
  server.get('/installations/:installationId', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };

    const installation = await prisma.installation.findUnique({
      where: { id: parseInt(installationId) },
      include: {
        repositories: {
          where: { disabled: false },
          select: { id: true, name: true, fullName: true, defaultBranch: true },
        },
        _count: {
          select: { repositories: true, policies: true },
        },
      },
    });

    if (!installation) {
      return reply.status(404).send({ error: 'Installation not found' });
    }

    return installation;
  });

  // Get stats for an installation
  server.get('/installations/:installationId/stats', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    const instId = parseInt(installationId);

    const [
      totalRepositories,
      totalFindings,
      criticalFindings,
      recentAnalysesCount,
      fixesApplied,
      recentAnalyses,
    ] = await Promise.all([
      prisma.repository.count({ 
        where: { installationId: instId, disabled: false } 
      }),
      prisma.finding.count({ 
        where: { 
          repository: { installationId: instId },
          dismissed: false 
        } 
      }),
      prisma.finding.count({ 
        where: { 
          repository: { installationId: instId },
          severity: 'CRITICAL',
          dismissed: false 
        } 
      }),
      prisma.analysis.count({
        where: {
          repository: { installationId: instId },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.fixRun.count({
        where: {
          analysis: { repository: { installationId: instId } },
          status: 'COMPLETED',
        },
      }),
      prisma.analysis.findMany({
        where: { repository: { installationId: instId } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          repository: {
            select: { owner: true, name: true, fullName: true },
          },
        },
      }),
    ]);

    // Calculate average score
    const avgScoreResult = await prisma.analysis.aggregate({
      where: { 
        repository: { installationId: instId },
        overallScore: { not: null },
      },
      _avg: { overallScore: true },
    });

    return {
      totalRepositories,
      averageScore: avgScoreResult._avg.overallScore ?? 0,
      totalFindings,
      criticalFindings,
      recentAnalyses: recentAnalysesCount,
      fixesApplied,
      analyses: recentAnalyses,
    };
  });

  // Get repository by ID
  server.get('/repositories/:repoId', async (request, reply) => {
    const { repoId } = request.params as { repoId: string };

    const repository = await prisma.repository.findUnique({
      where: { id: parseInt(repoId) },
      include: {
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { analyses: true, findings: true },
        },
      },
    });

    if (!repository) {
      return reply.status(404).send({ error: 'Repository not found' });
    }

    return repository;
  });

  // Get analyses for a repository by ID
  server.get('/repositories/:repoId/analyses', async (request, reply) => {
    const { repoId } = request.params as { repoId: string };
    const { limit = '20', page = '1' } = request.query as { limit?: string; page?: string };

    const take = parseInt(limit);
    const skip = (parseInt(page) - 1) * take;

    const analyses = await prisma.analysis.findMany({
      where: { repositoryId: parseInt(repoId) },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        _count: {
          select: { findings: true },
        },
      },
    });

    const total = await prisma.analysis.count({
      where: { repositoryId: parseInt(repoId) },
    });

    return { analyses, total };
  });

  // Get findings for a repository by ID
  server.get('/repositories/:repoId/findings', async (request, reply) => {
    const { repoId } = request.params as { repoId: string };
    const { 
      severity, 
      status,
      limit = '50',
      offset = '0',
    } = request.query as Record<string, string | undefined>;

    const where: any = {
      repositoryId: parseInt(repoId),
      dismissed: false,
    };

    if (severity) {
      where.severity = severity;
    }
    if (status) {
      where.status = status;
    }

    const findings = await prisma.finding.findMany({
      where,
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    return findings;
  });

  // Trigger analysis for a repository
  server.post('/repositories/:repoId/analyze', async (request, reply) => {
    const { repoId } = request.params as { repoId: string };
    const { sha } = request.body as { sha?: string };

    const repository = await prisma.repository.findUnique({
      where: { id: parseInt(repoId) },
    });

    if (!repository) {
      return reply.status(404).send({ error: 'Repository not found' });
    }

    // Queue analysis job
    // For now, just return a placeholder
    return { 
      jobId: `job-${Date.now()}`,
      message: 'Analysis queued',
      repository: repository.fullName,
      sha: sha || repository.defaultBranch,
    };
  });

  // Get fix runs for a repository by ID
  server.get('/repositories/:repoId/fixes', async (request, reply) => {
    const { repoId } = request.params as { repoId: string };

    const repository = await prisma.repository.findUnique({
      where: { id: parseInt(repoId) },
    });

    if (!repository) {
      return reply.status(404).send({ error: 'Repository not found' });
    }

    const fixRuns = await prisma.fixRun.findMany({
      where: { repositoryId: repository.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        analysis: {
          select: { id: true, prNumber: true, headSha: true },
        },
      },
    });

    return fixRuns;
  });

  // Get repositories for an installation
  server.get('/installations/:installationId/repositories', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    
    const repos = await prisma.repository.findMany({
      where: {
        installationId: parseInt(installationId),
        disabled: false,
      },
      orderBy: { fullName: 'asc' },
    });
    
    return repos;
  });

  // Get repository details
  server.get('/repos/:owner/:repo', async (request, reply) => {
    const { owner, repo } = request.params as { owner: string; repo: string };
    
    const repository = await prisma.repository.findFirst({
      where: { owner, name: repo },
      include: {
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { analyses: true, findings: true },
        },
      },
    });

    if (!repository) {
      return reply.status(404).send({ error: 'Repository not found' });
    }

    return repository;
  });

  // Get analyses for a repository
  server.get('/repos/:owner/:repo/analyses', async (request, reply) => {
    const { owner, repo } = request.params as { owner: string; repo: string };
    const { limit = '20', offset = '0' } = request.query as { limit?: string; offset?: string };

    const repository = await prisma.repository.findFirst({
      where: { owner, name: repo },
    });

    if (!repository) {
      return reply.status(404).send({ error: 'Repository not found' });
    }

    const analyses = await prisma.analysis.findMany({
      where: { repositoryId: repository.id },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: {
        _count: {
          select: { findings: true },
        },
      },
    });

    const total = await prisma.analysis.count({
      where: { repositoryId: repository.id },
    });

    return { analyses, total };
  });

  // Get analysis details (by /analysis/:analysisId for backwards compatibility)
  server.get('/analysis/:analysisId', async (request, reply) => {
    const { analysisId } = request.params as { analysisId: string };

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        repository: true,
        findings: {
          orderBy: [
            { severity: 'asc' },
            { createdAt: 'desc' },
          ],
        },
        fixRuns: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!analysis) {
      return reply.status(404).send({ error: 'Analysis not found' });
    }

    return analysis;
  });

  // Get analysis details (by /analyses/:id for frontend compatibility)
  server.get('/analyses/:analysisId', async (request, reply) => {
    const { analysisId } = request.params as { analysisId: string };

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        repository: true,
        findings: {
          orderBy: [
            { severity: 'asc' },
            { createdAt: 'desc' },
          ],
        },
        fixRuns: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!analysis) {
      return reply.status(404).send({ error: 'Analysis not found' });
    }

    return analysis;
  });

  // Get findings for a repository
  server.get('/repos/:owner/:repo/findings', async (request, reply) => {
    const { owner, repo } = request.params as { owner: string; repo: string };
    const { 
      severity, 
      category, 
      dismissed = 'false',
      limit = '50',
      offset = '0',
    } = request.query as Record<string, string | undefined>;

    const repository = await prisma.repository.findFirst({
      where: { owner, name: repo },
    });

    if (!repository) {
      return reply.status(404).send({ error: 'Repository not found' });
    }

    const where: any = {
      repositoryId: repository.id,
      dismissed: dismissed === 'true',
    };

    if (severity) {
      where.severity = severity;
    }
    if (category) {
      where.category = category;
    }

    const findings = await prisma.finding.findMany({
      where,
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    const total = await prisma.finding.count({ where });

    return { findings, total };
  });

  // Dismiss a finding
  server.post('/findings/:findingId/dismiss', async (request, reply) => {
    const { findingId } = request.params as { findingId: string };
    const { reason, dismissedBy } = request.body as { reason?: string; dismissedBy: string };

    const finding = await prisma.finding.update({
      where: { id: findingId },
      data: {
        dismissed: true,
        dismissedAt: new Date(),
        dismissedBy,
        dismissReason: reason,
      },
    });

    return finding;
  });

  // Update a finding (PATCH for frontend compatibility)
  server.patch('/findings/:findingId', async (request, reply) => {
    const { findingId } = request.params as { findingId: string };
    const { status, dismissed } = request.body as { status?: string; dismissed?: boolean };

    const data: any = {};
    if (status !== undefined) {
      data.status = status;
    }
    if (dismissed !== undefined) {
      data.dismissed = dismissed;
      if (dismissed) {
        data.dismissedAt = new Date();
      }
    }

    const finding = await prisma.finding.update({
      where: { id: findingId },
      data,
    });

    return finding;
  });

  // Trigger fix for a finding
  server.post('/findings/:findingId/fix', async (request, reply) => {
    const { findingId } = request.params as { findingId: string };

    const finding = await prisma.finding.findUnique({
      where: { id: findingId },
      include: {
        repository: true,
        analysis: true,
      },
    });

    if (!finding) {
      return reply.status(404).send({ error: 'Finding not found' });
    }

    // Queue a fix job (placeholder for now)
    const fixRun = await prisma.fixRun.create({
      data: {
        repositoryId: finding.repositoryId,
        analysisId: finding.analysisId,
        actionId: finding.fixType || 'auto_fix',
        actionLabel: `Fix ${finding.ruleName}`,
        triggeredBy: 'api',
        requestedAction: `fix_${finding.ruleId}`,
        status: 'pending',
      },
    });

    return {
      jobId: fixRun.id,
      message: 'Fix queued',
      findingId: finding.id,
      fixType: finding.fixType,
    };
  });

  // Get policies for an installation
  server.get('/installations/:installationId/policies', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    
    const policies = await policyEngine.getPolicies(parseInt(installationId));
    return policies;
  });

  // Create/update policy
  server.post('/installations/:installationId/policies', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    const data = request.body as any;

    const policy = await policyEngine.upsertPolicy(parseInt(installationId), data);
    return policy;
  });

  // Delete policy
  server.delete('/policies/:policyId', async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    
    await policyEngine.deletePolicy(parseInt(policyId));
    return { success: true };
  });

  // Update policy (PATCH for frontend compatibility)
  server.patch('/policies/:policyId', async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const data = request.body as any;

    const existingPolicy = await prisma.policy.findUnique({
      where: { id: parseInt(policyId) },
    });

    if (!existingPolicy) {
      return reply.status(404).send({ error: 'Policy not found' });
    }

    const policy = await policyEngine.upsertPolicy(existingPolicy.installationId, {
      ...data,
      id: parseInt(policyId),
    });
    return policy;
  });

  // Get notification configs
  server.get('/installations/:installationId/notifications', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };

    const configs = await prisma.notificationConfig.findMany({
      where: { installationId: parseInt(installationId) },
    });

    return configs;
  });

  // Create/update notification config
  server.post('/installations/:installationId/notifications', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    const data = request.body as any;

    const config = await prisma.notificationConfig.upsert({
      where: { id: data.id || 0 },
      create: {
        installationId: parseInt(installationId),
        ...data,
      },
      update: data,
    });

    return config;
  });

  // Delete notification config
  server.delete('/notifications/:configId', async (request, reply) => {
    const { configId } = request.params as { configId: string };
    
    await prisma.notificationConfig.delete({
      where: { id: parseInt(configId) },
    });

    return { success: true };
  });

  // Update notification config (PATCH for frontend compatibility)
  server.patch('/notifications/:configId', async (request, reply) => {
    const { configId } = request.params as { configId: string };
    const data = request.body as any;

    const config = await prisma.notificationConfig.update({
      where: { id: parseInt(configId) },
      data,
    });

    return config;
  });

  // Get security champions for an installation
  server.get('/installations/:installationId/champions', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };

    // Get all repositories for this installation
    const repositories = await prisma.repository.findMany({
      where: { installationId: parseInt(installationId), disabled: false },
      select: { id: true },
    });

    const repoIds = repositories.map(r => r.id);

    const champions = await prisma.securityChampion.findMany({
      where: { repositoryId: { in: repoIds } },
      orderBy: { championScore: 'desc' },
      take: 50,
    });

    // Return with githubLogin alias for frontend compatibility
    return champions.map(c => ({
      ...c,
      githubLogin: c.username,
      avatarUrl: `https://github.com/${c.username}.png`,
    }));
  });

  // Add security champion to an installation
  server.post('/installations/:installationId/champions', async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    const { githubLogin, repositoryId } = request.body as { githubLogin: string; repositoryId?: number };

    // If no repositoryId provided, use the first repository in the installation
    let repoId: number | undefined = repositoryId;
    if (!repoId) {
      const firstRepo = await prisma.repository.findFirst({
        where: { installationId: parseInt(installationId), disabled: false },
        select: { id: true },
      });
      if (firstRepo) {
        repoId = firstRepo.id;
      }
    }

    if (!repoId) {
      return reply.status(400).send({ error: 'No repository found for installation' });
    }

    const champion = await prisma.securityChampion.create({
      data: {
        repositoryId: repoId,
        username: githubLogin,
        championScore: 0,
      },
    });

    // Return with githubLogin alias for frontend compatibility
    return {
      ...champion,
      githubLogin: champion.username,
    };
  });

  // Remove security champion
  server.delete('/champions/:championId', async (request, reply) => {
    const { championId } = request.params as { championId: string };

    await prisma.securityChampion.delete({
      where: { id: parseInt(championId) },
    });

    return { success: true };
  });

  // Get security champions for a repository
  server.get('/repos/:owner/:repo/champions', async (request, reply) => {
    const { owner, repo } = request.params as { owner: string; repo: string };

    const repository = await prisma.repository.findFirst({
      where: { owner, name: repo },
    });

    if (!repository) {
      return reply.status(404).send({ error: 'Repository not found' });
    }

    const champions = await prisma.securityChampion.findMany({
      where: { repositoryId: repository.id },
      orderBy: { championScore: 'desc' },
      take: 20,
    });

    // Return with githubLogin alias for frontend compatibility
    return champions.map(c => ({
      ...c,
      githubLogin: c.username,
      avatarUrl: `https://github.com/${c.username}.png`,
    }));
  });

  // Get benchmarks
  server.get('/benchmarks', async (request, reply) => {
    const { cohortKey } = request.query as { cohortKey?: string };

    const where: any = {};
    if (cohortKey) {
      where.cohortKey = cohortKey;
    }

    const benchmarks = await prisma.benchmark.findMany({
      where,
      orderBy: { windowEnd: 'desc' },
      take: 100,
    });

    return benchmarks;
  });

  // Get fix runs for a repository
  server.get('/repos/:owner/:repo/fixes', async (request, reply) => {
    const { owner, repo } = request.params as { owner: string; repo: string };

    const repository = await prisma.repository.findFirst({
      where: { owner, name: repo },
    });

    if (!repository) {
      return reply.status(404).send({ error: 'Repository not found' });
    }

    const fixRuns = await prisma.fixRun.findMany({
      where: { repositoryId: repository.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        analysis: {
          select: { id: true, prNumber: true, headSha: true },
        },
      },
    });

    return fixRuns;
  });

  // Dashboard stats
  server.get('/dashboard/stats', async (request, reply) => {
    const [
      totalRepos,
      totalAnalyses,
      totalFindings,
      recentAnalyses,
    ] = await Promise.all([
      prisma.repository.count({ where: { disabled: false } }),
      prisma.analysis.count(),
      prisma.finding.count({ where: { dismissed: false } }),
      prisma.analysis.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          repository: {
            select: { owner: true, name: true },
          },
        },
      }),
    ]);

    // Score distribution
    const scoreDistribution = await prisma.analysis.groupBy({
      by: ['overallScore'],
      _count: true,
      where: {
        overallScore: { not: null },
      },
    });

    return {
      totalRepos,
      totalAnalyses,
      totalFindings,
      recentAnalyses,
      scoreDistribution,
    };
  });
}
