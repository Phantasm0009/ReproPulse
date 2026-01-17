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
      where: { id: repoId },
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
      where: { repositoryId: repoId },
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
      where: { repositoryId: repoId },
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
      repositoryId: repoId,
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
      where: { id: repoId },
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

  // Get analysis details
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

    return champions;
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
