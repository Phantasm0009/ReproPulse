import { createLogger } from '../config/logger';
import type { Severity, Confidence } from './workflow-security';

const logger = createLogger('maintainability');

export interface MaintainabilityFinding {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  description: string;
  remediation: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface RepoStats {
  repo: {
    name: string;
    full_name: string;
    description: string | null;
    license: { key: string; name: string } | null;
    has_issues: boolean;
    has_wiki: boolean;
    has_projects: boolean;
    has_discussions: boolean;
    open_issues_count: number;
    stargazers_count: number;
    forks_count: number;
    created_at: string;
    updated_at: string;
    pushed_at: string;
  };
  releases: Array<{
    id: number;
    tag_name: string;
    published_at: string | null;
    prerelease: boolean;
    draft: boolean;
  }>;
  issues: Array<{
    id: number;
    number: number;
    state: string;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    pull_request?: unknown;
    labels: Array<{ name: string }>;
  }>;
}

interface FileTree {
  path: string;
  type: string;
}

/**
 * Maintainability & Hygiene Scanner
 * Analyzes repository health indicators
 */
export class MaintainabilityScanner {
  private findings: MaintainabilityFinding[] = [];

  /**
   * Analyze repository maintainability
   */
  async analyze(
    stats: RepoStats,
    fileTree: FileTree[]
  ): Promise<MaintainabilityFinding[]> {
    this.findings = [];

    // Check for essential files
    this.checkEssentialFiles(fileTree);
    
    // Check CI presence
    this.checkCIPresence(fileTree);
    
    // Check documentation
    this.checkDocumentation(fileTree);
    
    // Check release cadence
    this.checkReleaseCadence(stats.releases);
    
    // Check issue responsiveness
    this.checkIssueResponsiveness(stats.issues);
    
    // Check repo activity
    this.checkRepoActivity(stats.repo);
    
    // Check security policy
    this.checkSecurityPolicy(fileTree);
    
    // Check code ownership
    this.checkCodeOwnership(fileTree);

    return this.findings;
  }

  /**
   * Check for essential repository files
   */
  private checkEssentialFiles(fileTree: FileTree[]): void {
    const paths = fileTree.map(f => f.path.toLowerCase());
    
    // README
    const hasReadme = paths.some(p => 
      p === 'readme.md' || 
      p === 'readme.txt' || 
      p === 'readme' ||
      p === 'readme.rst'
    );
    
    if (!hasReadme) {
      this.findings.push({
        ruleId: 'MH100',
        ruleName: 'missing-readme',
        severity: 'medium',
        confidence: 'high',
        title: 'Missing README file',
        description: 'The repository lacks a README file, which is essential for project documentation.',
        remediation: 'Create a README.md with project description, installation, usage, and contribution guidelines.',
        metadata: { file: 'README.md' },
      });
    }

    // LICENSE
    const hasLicense = paths.some(p => 
      p === 'license' || 
      p === 'license.md' || 
      p === 'license.txt' ||
      p === 'copying'
    );
    
    if (!hasLicense) {
      this.findings.push({
        ruleId: 'MH101',
        ruleName: 'missing-license',
        severity: 'medium',
        confidence: 'high',
        title: 'Missing LICENSE file',
        description: 'The repository lacks a LICENSE file. Without a license, the default copyright applies.',
        remediation: 'Add a LICENSE file. Use https://choosealicense.com to select an appropriate license.',
        metadata: { file: 'LICENSE' },
      });
    }

    // CONTRIBUTING
    const hasContributing = paths.some(p => 
      p === 'contributing.md' || 
      p === 'contributing' ||
      p === '.github/contributing.md'
    );
    
    if (!hasContributing) {
      this.findings.push({
        ruleId: 'MH102',
        ruleName: 'missing-contributing',
        severity: 'low',
        confidence: 'high',
        title: 'Missing CONTRIBUTING guidelines',
        description: 'No contribution guidelines found. This can make it harder for contributors to participate.',
        remediation: 'Create a CONTRIBUTING.md with guidelines for submitting issues and pull requests.',
        metadata: { file: 'CONTRIBUTING.md' },
      });
    }

    // CHANGELOG
    const hasChangelog = paths.some(p => 
      p === 'changelog.md' || 
      p === 'changelog' ||
      p === 'history.md' ||
      p === 'releases.md'
    );
    
    if (!hasChangelog) {
      this.findings.push({
        ruleId: 'MH103',
        ruleName: 'missing-changelog',
        severity: 'low',
        confidence: 'medium',
        title: 'Missing CHANGELOG',
        description: 'No changelog found. A changelog helps users understand what changed between versions.',
        remediation: 'Create a CHANGELOG.md following https://keepachangelog.com format.',
        metadata: { file: 'CHANGELOG.md' },
      });
    }
  }

  /**
   * Check for CI/CD configuration
   */
  private checkCIPresence(fileTree: FileTree[]): void {
    const paths = fileTree.map(f => f.path.toLowerCase());
    
    const ciIndicators = [
      '.github/workflows/',
      '.gitlab-ci.yml',
      '.circleci/',
      'jenkinsfile',
      '.travis.yml',
      'azure-pipelines.yml',
      'bitbucket-pipelines.yml',
      '.drone.yml',
    ];
    
    const hasCI = ciIndicators.some(ci => 
      paths.some(p => p.includes(ci.toLowerCase()))
    );
    
    if (!hasCI) {
      this.findings.push({
        ruleId: 'MH200',
        ruleName: 'missing-ci',
        severity: 'medium',
        confidence: 'high',
        title: 'No CI/CD configuration detected',
        description: 'The repository lacks continuous integration configuration. CI helps catch issues early.',
        remediation: 'Set up CI/CD using GitHub Actions, GitLab CI, or another CI service.',
        metadata: {},
      });
    }

    // Check for GitHub Actions specifically
    const hasGitHubActions = paths.some(p => p.startsWith('.github/workflows/'));
    
    if (hasGitHubActions) {
      // Check for test workflow
      const workflowFiles = paths.filter(p => 
        p.startsWith('.github/workflows/') && 
        (p.endsWith('.yml') || p.endsWith('.yaml'))
      );
      
      const hasTestWorkflow = workflowFiles.some(p => 
        p.includes('test') || 
        p.includes('ci') ||
        p.includes('build')
      );
      
      if (!hasTestWorkflow && workflowFiles.length > 0) {
        this.findings.push({
          ruleId: 'MH201',
          ruleName: 'no-test-workflow',
          severity: 'low',
          confidence: 'low',
          title: 'No dedicated test/CI workflow detected',
          description: 'While workflows exist, none appear to be for testing. Running tests in CI is important.',
          remediation: 'Ensure at least one workflow runs your test suite on PRs.',
          metadata: { workflows: workflowFiles },
        });
      }
    }
  }

  /**
   * Check documentation quality
   */
  private checkDocumentation(fileTree: FileTree[]): void {
    const paths = fileTree.map(f => f.path.toLowerCase());
    
    // Check for docs directory
    const hasDocs = paths.some(p => 
      p.startsWith('docs/') || 
      p.startsWith('documentation/') ||
      p.startsWith('doc/')
    );
    
    // Check for API documentation
    const hasApiDocs = paths.some(p => 
      p.includes('api.md') ||
      p.includes('openapi') ||
      p.includes('swagger') ||
      p.includes('api-docs')
    );
    
    // Only flag for larger projects (indicated by many files)
    const fileCount = fileTree.filter(f => f.type === 'blob').length;
    
    if (fileCount > 20 && !hasDocs && !hasApiDocs) {
      this.findings.push({
        ruleId: 'MH300',
        ruleName: 'minimal-documentation',
        severity: 'low',
        confidence: 'medium',
        title: 'Limited documentation structure',
        description: 'For a project of this size, consider having a dedicated docs directory.',
        remediation: 'Create a docs/ directory with detailed documentation, guides, and API reference.',
        metadata: { fileCount },
      });
    }
  }

  /**
   * Check release cadence
   */
  private checkReleaseCadence(releases: RepoStats['releases']): void {
    const productionReleases = releases.filter(r => !r.prerelease && !r.draft);
    
    if (productionReleases.length === 0) {
      this.findings.push({
        ruleId: 'MH400',
        ruleName: 'no-releases',
        severity: 'low',
        confidence: 'high',
        title: 'No releases published',
        description: 'The repository has no GitHub releases. Releases help users track stable versions.',
        remediation: 'Consider using GitHub Releases or tags to mark stable versions.',
        metadata: {},
      });
      return;
    }

    // Check for stale releases (none in past year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const recentReleases = productionReleases.filter(r => 
      r.published_at && new Date(r.published_at) > oneYearAgo
    );
    
    if (recentReleases.length === 0) {
      this.findings.push({
        ruleId: 'MH401',
        ruleName: 'stale-releases',
        severity: 'low',
        confidence: 'medium',
        title: 'No releases in the past year',
        description: 'The last release was over a year ago. This may indicate an unmaintained project.',
        remediation: 'If actively maintained, consider publishing a new release with recent changes.',
        metadata: { 
          lastRelease: productionReleases[0]?.tag_name,
          lastReleaseDate: productionReleases[0]?.published_at,
        },
      });
    }
  }

  /**
   * Check issue responsiveness
   */
  private checkIssueResponsiveness(issues: RepoStats['issues']): void {
    // Filter out PRs
    const actualIssues = issues.filter(i => !i.pull_request);
    
    if (actualIssues.length === 0) return;

    const openIssues = actualIssues.filter(i => i.state === 'open');
    const closedIssues = actualIssues.filter(i => i.state === 'closed');
    
    // Check open issue ratio
    if (openIssues.length > 50 && closedIssues.length > 0) {
      const openRatio = openIssues.length / (openIssues.length + closedIssues.length);
      
      if (openRatio > 0.8) {
        this.findings.push({
          ruleId: 'MH500',
          ruleName: 'high-open-issues',
          severity: 'low',
          confidence: 'medium',
          title: 'High ratio of open issues',
          description: `${Math.round(openRatio * 100)}% of issues remain open (${openIssues.length} open, ${closedIssues.length} closed).`,
          remediation: 'Review and triage open issues. Close stale issues or mark them appropriately.',
          metadata: { openCount: openIssues.length, closedCount: closedIssues.length },
        });
      }
    }

    // Check for stale open issues (over 1 year old)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const staleIssues = openIssues.filter(i => 
      new Date(i.updated_at) < oneYearAgo
    );
    
    if (staleIssues.length > 10) {
      this.findings.push({
        ruleId: 'MH501',
        ruleName: 'stale-issues',
        severity: 'low',
        confidence: 'medium',
        title: `${staleIssues.length} stale issues (no activity in 1+ year)`,
        description: 'Multiple open issues have had no activity for over a year.',
        remediation: 'Use GitHub\'s stale bot or manually close/triage old issues.',
        metadata: { staleCount: staleIssues.length },
      });
    }

    // Check average close time (for closed issues)
    if (closedIssues.length >= 5) {
      const closeTimes = closedIssues
        .filter(i => i.closed_at)
        .map(i => {
          const created = new Date(i.created_at).getTime();
          const closed = new Date(i.closed_at!).getTime();
          return (closed - created) / (1000 * 60 * 60 * 24); // days
        });
      
      if (closeTimes.length > 0) {
        const avgCloseTime = closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length;
        
        if (avgCloseTime > 90) {
          this.findings.push({
            ruleId: 'MH502',
            ruleName: 'slow-issue-resolution',
            severity: 'info',
            confidence: 'low',
            title: `Average issue close time: ${Math.round(avgCloseTime)} days`,
            description: 'Issues take a long time to close on average, which may indicate resource constraints.',
            remediation: 'Consider triaging issues more frequently or seeking additional maintainers.',
            metadata: { avgDays: Math.round(avgCloseTime) },
          });
        }
      }
    }
  }

  /**
   * Check repository activity
   */
  private checkRepoActivity(repo: RepoStats['repo']): void {
    const lastPush = new Date(repo.pushed_at);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    if (lastPush < sixMonthsAgo) {
      const monthsInactive = Math.round(
        (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      
      this.findings.push({
        ruleId: 'MH600',
        ruleName: 'inactive-repo',
        severity: 'low',
        confidence: 'high',
        title: `Repository inactive for ${monthsInactive} months`,
        description: `The last push was ${lastPush.toLocaleDateString()}. Inactive repositories may have unaddressed security issues.`,
        remediation: 'If the project is still maintained, consider making it clear in the README.',
        metadata: { lastPush: repo.pushed_at, monthsInactive },
      });
    }

    // Check if description is set
    if (!repo.description) {
      this.findings.push({
        ruleId: 'MH601',
        ruleName: 'missing-description',
        severity: 'info',
        confidence: 'high',
        title: 'Repository description is empty',
        description: 'A repository description helps users understand the project at a glance.',
        remediation: 'Add a concise description in repository settings.',
        metadata: {},
      });
    }
  }

  /**
   * Check for SECURITY.md policy
   */
  private checkSecurityPolicy(fileTree: FileTree[]): void {
    const paths = fileTree.map(f => f.path.toLowerCase());
    
    const hasSecurityPolicy = paths.some(p => 
      p === 'security.md' ||
      p === '.github/security.md' ||
      p === 'security.txt' ||
      p === '.well-known/security.txt'
    );
    
    if (!hasSecurityPolicy) {
      this.findings.push({
        ruleId: 'MH700',
        ruleName: 'missing-security-policy',
        severity: 'medium',
        confidence: 'high',
        title: 'Missing SECURITY.md policy',
        description: 'No security policy found. A SECURITY.md helps security researchers report vulnerabilities.',
        remediation: 'Create a SECURITY.md with instructions for reporting vulnerabilities responsibly.',
        metadata: { file: 'SECURITY.md' },
      });
    }
  }

  /**
   * Check for CODEOWNERS file
   */
  private checkCodeOwnership(fileTree: FileTree[]): void {
    const paths = fileTree.map(f => f.path.toLowerCase());
    
    const hasCodeowners = paths.some(p => 
      p === 'codeowners' ||
      p === '.github/codeowners' ||
      p === 'docs/codeowners'
    );
    
    // Only suggest for larger repos
    const hasMultipleContributorFiles = paths.filter(p => 
      p.endsWith('.ts') || p.endsWith('.js') || p.endsWith('.py')
    ).length > 20;
    
    if (!hasCodeowners && hasMultipleContributorFiles) {
      this.findings.push({
        ruleId: 'MH800',
        ruleName: 'missing-codeowners',
        severity: 'info',
        confidence: 'medium',
        title: 'No CODEOWNERS file found',
        description: 'A CODEOWNERS file helps ensure the right people review changes to specific areas.',
        remediation: 'Create a .github/CODEOWNERS file to define code ownership.',
        metadata: {},
      });
    }
  }
}

export const maintainabilityScanner = new MaintainabilityScanner();
