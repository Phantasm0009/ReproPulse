import { createLogger } from '../config/logger';
import type { WorkflowFinding } from '../analysis/workflow-security';
import type { SupplyChainFinding } from '../analysis/supply-chain';
import type { MaintainabilityFinding } from '../analysis/maintainability';
import type { AttackPatternFinding } from '../analysis/attack-patterns';
import { prisma } from '../lib/prisma';

const logger = createLogger('scoring');

export interface ScoreResult {
  overall: number;
  workflow: number;
  supplyChain: number;
  maintainability: number;
  hygiene: number;
  percentile?: number;
  percentileDelta?: number;
  cohortKey?: string;
}

export interface FindingsSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  byCategory: {
    workflowSecurity: number;
    supplyChain: number;
    maintainability: number;
    attackPattern: number;
  };
}

type AnyFinding = (WorkflowFinding | SupplyChainFinding | MaintainabilityFinding | AttackPatternFinding) & {
  filePath?: string;
};

// Weight multiplier for PR-introduced findings vs legacy debt
const PR_INTRODUCED_WEIGHT = 2.5;

// Score weights per category (must sum to 100)
const CATEGORY_WEIGHTS = {
  workflow: 40,      // Workflow Security: 0-40
  supplyChain: 30,   // Supply Chain: 0-30
  maintainability: 20, // Maintainability: 0-20
  hygiene: 10,       // Hygiene: 0-10
};

// Severity penalties (deducted from category max)
const SEVERITY_PENALTIES = {
  critical: 15,
  high: 8,
  medium: 4,
  low: 2,
  info: 0.5,
};

// Confidence multipliers
const CONFIDENCE_MULTIPLIERS = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

/**
 * Scoring Engine
 * Calculates health & security scores based on findings
 */
export class ScoringEngine {
  /**
   * Calculate scores from all findings
   */
  calculateScores(
    workflowFindings: WorkflowFinding[],
    supplyChainFindings: SupplyChainFinding[],
    maintainabilityFindings: MaintainabilityFinding[],
    attackPatternFindings: AttackPatternFinding[],
    options: { isPR?: boolean; newFindingIds?: Set<string> } = {}
  ): ScoreResult {
    // Calculate individual category scores
    const workflow = this.calculateCategoryScore(
      workflowFindings,
      CATEGORY_WEIGHTS.workflow,
      options
    );
    
    const supplyChain = this.calculateCategoryScore(
      supplyChainFindings,
      CATEGORY_WEIGHTS.supplyChain,
      options
    );
    
    const maintainability = this.calculateCategoryScore(
      maintainabilityFindings,
      CATEGORY_WEIGHTS.maintainability,
      options
    );
    
    // Hygiene is derived from maintainability findings with specific rule IDs
    const hygieneFindings = maintainabilityFindings.filter(f => 
      f.ruleId.startsWith('MH1') || // Essential files
      f.ruleId.startsWith('MH6') || // Repo activity
      f.ruleId.startsWith('MH7') || // Security policy
      f.ruleId.startsWith('MH8')    // Code ownership
    );
    
    const hygiene = this.calculateCategoryScore(
      hygieneFindings,
      CATEGORY_WEIGHTS.hygiene,
      options
    );
    
    // Apply attack pattern findings as additional penalties across categories
    const attackPenalty = this.calculateAttackPatternPenalty(attackPatternFindings, options);
    
    // Calculate overall score
    const rawOverall = workflow + supplyChain + maintainability + hygiene - attackPenalty;
    const overall = Math.max(0, Math.min(100, Math.round(rawOverall)));

    return {
      overall,
      workflow: Math.round(workflow),
      supplyChain: Math.round(supplyChain),
      maintainability: Math.round(maintainability),
      hygiene: Math.round(hygiene),
    };
  }

  /**
   * Calculate score for a single category
   */
  private calculateCategoryScore(
    findings: AnyFinding[],
    maxScore: number,
    options: { isPR?: boolean; newFindingIds?: Set<string> }
  ): number {
    let totalPenalty = 0;

    for (const finding of findings) {
      const basePenalty = SEVERITY_PENALTIES[finding.severity] || 0;
      const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[finding.confidence] || 1.0;
      
      // Apply PR-introduced weight if applicable
      const isNew = options.newFindingIds?.has(this.getFindingKey(finding));
      const prWeight = options.isPR && isNew ? PR_INTRODUCED_WEIGHT : 1.0;
      
      const penalty = basePenalty * confidenceMultiplier * prWeight;
      totalPenalty += penalty;
    }

    // Score = max - penalties (clamped to 0)
    return Math.max(0, maxScore - totalPenalty);
  }

  /**
   * Calculate penalty from attack pattern findings
   * These are distributed across the overall score
   */
  private calculateAttackPatternPenalty(
    findings: AttackPatternFinding[],
    options: { isPR?: boolean; newFindingIds?: Set<string> }
  ): number {
    let totalPenalty = 0;

    for (const finding of findings) {
      // Attack patterns have higher base penalties
      const basePenalties: Record<string, number> = {
        critical: 25,
        high: 15,
        medium: 8,
        low: 3,
        info: 1,
      };
      
      const basePenalty = basePenalties[finding.severity] || 0;
      const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[finding.confidence] || 1.0;
      
      // Attack patterns in PRs are always weighted heavily
      const prWeight = options.isPR ? PR_INTRODUCED_WEIGHT : 1.0;
      
      totalPenalty += basePenalty * confidenceMultiplier * prWeight;
    }

    return totalPenalty;
  }

  /**
   * Generate a unique key for a finding (for deduplication)
   */
  private getFindingKey(finding: AnyFinding): string {
    return `${finding.ruleId}:${finding.filePath || ''}:${finding.title}`;
  }

  /**
   * Summarize findings by severity and category
   */
  summarizeFindings(
    workflowFindings: WorkflowFinding[],
    supplyChainFindings: SupplyChainFinding[],
    maintainabilityFindings: MaintainabilityFinding[],
    attackPatternFindings: AttackPatternFinding[]
  ): FindingsSummary {
    const allFindings = [
      ...workflowFindings,
      ...supplyChainFindings,
      ...maintainabilityFindings,
      ...attackPatternFindings,
    ];

    const summary: FindingsSummary = {
      total: allFindings.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      byCategory: {
        workflowSecurity: workflowFindings.length,
        supplyChain: supplyChainFindings.length,
        maintainability: maintainabilityFindings.length,
        attackPattern: attackPatternFindings.length,
      },
    };

    for (const finding of allFindings) {
      switch (finding.severity) {
        case 'critical':
          summary.critical++;
          break;
        case 'high':
          summary.high++;
          break;
        case 'medium':
          summary.medium++;
          break;
        case 'low':
          summary.low++;
          break;
        case 'info':
          summary.info++;
          break;
      }
    }

    return summary;
  }

  /**
   * Calculate percentile vs cohort
   */
  async calculatePercentile(
    score: number,
    language: string | null,
    sizeBucket: string | null
  ): Promise<{ percentile: number; delta: number; cohortKey: string } | null> {
    // Build cohort key
    const cohortKey = `${language || 'unknown'}:${sizeBucket || 'unknown'}`;
    
    try {
      // Get the latest benchmark for this cohort
      const benchmark = await prisma.benchmark.findFirst({
        where: { cohortKey },
        orderBy: { windowEnd: 'desc' },
      });

      if (!benchmark) {
        logger.debug({ cohortKey }, 'No benchmark data for cohort');
        return null;
      }

      // Calculate percentile based on score distribution
      let percentile: number;
      
      if (score >= benchmark.p90Score) {
        percentile = 90 + (10 * (score - benchmark.p90Score) / (100 - benchmark.p90Score));
      } else if (score >= benchmark.p75Score) {
        percentile = 75 + (15 * (score - benchmark.p75Score) / (benchmark.p90Score - benchmark.p75Score));
      } else if (score >= benchmark.medianScore) {
        percentile = 50 + (25 * (score - benchmark.medianScore) / (benchmark.p75Score - benchmark.medianScore));
      } else if (score >= benchmark.p25Score) {
        percentile = 25 + (25 * (score - benchmark.p25Score) / (benchmark.medianScore - benchmark.p25Score));
      } else if (score >= benchmark.p10Score) {
        percentile = 10 + (15 * (score - benchmark.p10Score) / (benchmark.p25Score - benchmark.p10Score));
      } else {
        percentile = 10 * score / benchmark.p10Score;
      }

      percentile = Math.max(0, Math.min(100, Math.round(percentile)));

      // Calculate delta from average
      const delta = Math.round(score - benchmark.avgScore);

      return { percentile, delta, cohortKey };
    } catch (error) {
      logger.error({ error, cohortKey }, 'Failed to calculate percentile');
      return null;
    }
  }

  /**
   * Determine size bucket based on file count or repo size
   */
  static getSizeBucket(sizeKb: number): string {
    if (sizeKb < 1000) return 'small';      // < 1MB
    if (sizeKb < 10000) return 'medium';    // 1-10MB
    if (sizeKb < 100000) return 'large';    // 10-100MB
    return 'xlarge';                         // > 100MB
  }

  /**
   * Update benchmark aggregates (called periodically)
   */
  async updateBenchmarks(): Promise<void> {
    const windowEnd = new Date();
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 30); // 30-day rolling window

    try {
      // Get all analyses from the window
      const analyses = await prisma.analysis.findMany({
        where: {
          completedAt: {
            gte: windowStart,
            lte: windowEnd,
          },
          overallScore: { not: null },
        },
        include: {
          repository: true,
        },
      });

      // Group by cohort
      const cohorts = new Map<string, number[]>();

      for (const analysis of analyses) {
        const repo = analysis.repository;
        const cohortKey = `${repo.language || 'unknown'}:${repo.sizeBucket || 'unknown'}`;
        
        if (!cohorts.has(cohortKey)) {
          cohorts.set(cohortKey, []);
        }
        cohorts.get(cohortKey)!.push(analysis.overallScore!);
      }

      // Calculate and store benchmarks
      for (const [cohortKey, scores] of cohorts) {
        if (scores.length < 5) continue; // Need minimum sample size

        scores.sort((a, b) => a - b);
        
        const [language, sizeBucket] = cohortKey.split(':');
        
        const benchmark = {
          cohortKey,
          language,
          sizeBucket,
          sampleSize: scores.length,
          avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
          medianScore: scores[Math.floor(scores.length / 2)],
          p10Score: scores[Math.floor(scores.length * 0.1)],
          p25Score: scores[Math.floor(scores.length * 0.25)],
          p75Score: scores[Math.floor(scores.length * 0.75)],
          p90Score: scores[Math.floor(scores.length * 0.9)],
          avgWorkflow: 0, // Would need to track these separately
          avgSupplyChain: 0,
          avgMaintainability: 0,
          avgHygiene: 0,
          windowStart,
          windowEnd,
        };

        await prisma.benchmark.upsert({
          where: {
            cohortKey_windowStart: {
              cohortKey,
              windowStart,
            },
          },
          create: benchmark,
          update: benchmark,
        });
      }

      logger.info({ cohortCount: cohorts.size }, 'Updated benchmark aggregates');
    } catch (error) {
      logger.error({ error }, 'Failed to update benchmarks');
    }
  }
}

export const scoringEngine = new ScoringEngine();
