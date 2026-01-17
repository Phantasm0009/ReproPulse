import { prisma } from '../lib/prisma';
import { createLogger } from '../config/logger';

const logger = createLogger('policy-engine');

interface PolicyCheckResult {
  passed: boolean;
  violations: string[];
  policyId?: number;
  policyName?: string;
}

/**
 * Policy Engine
 * Checks analysis results against configured policies
 */
export class PolicyEngine {
  /**
   * Check if analysis results pass all applicable policies
   */
  async checkPolicies(
    installationId: number,
    repositoryId: number,
    scores: {
      overall: number;
      workflow: number;
      supplyChain: number;
      maintainability: number;
      hygiene: number;
    },
    findings: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    }
  ): Promise<PolicyCheckResult> {
    // Get applicable policies (repo-specific or org-wide)
    const policies = await prisma.policy.findMany({
      where: {
        installationId,
        enabled: true,
        OR: [
          { repositoryId: null }, // Org-wide
          { repositoryId },
        ],
      },
      orderBy: {
        repositoryId: 'desc', // Repo-specific policies take precedence
      },
    });

    if (policies.length === 0) {
      return { passed: true, violations: [] };
    }

    // Use the most specific policy (first one, repo-specific if exists)
    const policy = policies[0];
    const violations: string[] = [];

    // Check score thresholds
    if (policy.minOverallScore !== null && scores.overall < policy.minOverallScore) {
      violations.push(`Overall score ${scores.overall} is below minimum ${policy.minOverallScore}`);
    }

    if (policy.minWorkflowScore !== null && scores.workflow < policy.minWorkflowScore) {
      violations.push(`Workflow score ${scores.workflow} is below minimum ${policy.minWorkflowScore}`);
    }

    if (policy.minSupplyChainScore !== null && scores.supplyChain < policy.minSupplyChainScore) {
      violations.push(`Supply chain score ${scores.supplyChain} is below minimum ${policy.minSupplyChainScore}`);
    }

    if (policy.minMaintainabilityScore !== null && scores.maintainability < policy.minMaintainabilityScore) {
      violations.push(`Maintainability score ${scores.maintainability} is below minimum ${policy.minMaintainabilityScore}`);
    }

    if (policy.minHygieneScore !== null && scores.hygiene < policy.minHygieneScore) {
      violations.push(`Hygiene score ${scores.hygiene} is below minimum ${policy.minHygieneScore}`);
    }

    // Check finding thresholds
    if (policy.failOnCritical && findings.critical > 0) {
      violations.push(`Found ${findings.critical} critical finding(s)`);
    }

    if (policy.failOnHigh && findings.high > 0) {
      violations.push(`Found ${findings.high} high severity finding(s)`);
    }

    if (policy.maxCriticalFindings !== null && findings.critical > policy.maxCriticalFindings) {
      violations.push(`Critical findings (${findings.critical}) exceed maximum (${policy.maxCriticalFindings})`);
    }

    if (policy.maxHighFindings !== null && findings.high > policy.maxHighFindings) {
      violations.push(`High findings (${findings.high}) exceed maximum (${policy.maxHighFindings})`);
    }

    const passed = violations.length === 0;

    if (!passed) {
      logger.info({
        policyId: policy.id,
        policyName: policy.name,
        violations,
      }, 'Policy check failed');
    }

    return {
      passed,
      violations,
      policyId: policy.id,
      policyName: policy.name,
    };
  }

  /**
   * Get all policies for an installation
   */
  async getPolicies(installationId: number) {
    return prisma.policy.findMany({
      where: { installationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create or update a policy
   */
  async upsertPolicy(
    installationId: number,
    data: {
      id?: number;
      repositoryId?: number;
      name: string;
      description?: string;
      enabled?: boolean;
      minOverallScore?: number;
      minWorkflowScore?: number;
      minSupplyChainScore?: number;
      minMaintainabilityScore?: number;
      minHygieneScore?: number;
      failOnCritical?: boolean;
      failOnHigh?: boolean;
      maxCriticalFindings?: number;
      maxHighFindings?: number;
      blockMerge?: boolean;
      requireApproval?: boolean;
      autoFix?: boolean;
    }
  ) {
    if (data.id) {
      return prisma.policy.update({
        where: { id: data.id },
        data: {
          ...data,
          id: undefined,
        },
      });
    }

    return prisma.policy.create({
      data: {
        installationId,
        ...data,
      },
    });
  }

  /**
   * Delete a policy
   */
  async deletePolicy(policyId: number) {
    return prisma.policy.delete({
      where: { id: policyId },
    });
  }
}

export const policyEngine = new PolicyEngine();
