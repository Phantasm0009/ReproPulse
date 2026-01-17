import yaml from 'js-yaml';
import { createLogger } from '../config/logger';

const logger = createLogger('workflow-scanner');

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'high' | 'medium' | 'low';

export interface WorkflowFinding {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  description: string;
  remediation: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

interface WorkflowContent {
  path: string;
  content: string;
}

interface ParsedWorkflow {
  name?: string;
  on?: unknown;
  permissions?: unknown;
  jobs?: Record<string, WorkflowJob>;
}

interface WorkflowJob {
  'runs-on'?: string | string[];
  permissions?: unknown;
  steps?: WorkflowStep[];
  env?: Record<string, string>;
}

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}

/**
 * Workflow Security Scanner
 * Analyzes GitHub Actions workflow files for security issues
 */
export class WorkflowSecurityScanner {
  private findings: WorkflowFinding[] = [];

  /**
   * Scan all workflow files and return findings
   */
  async scan(workflows: WorkflowContent[]): Promise<WorkflowFinding[]> {
    this.findings = [];

    for (const workflow of workflows) {
      try {
        await this.scanWorkflow(workflow);
      } catch (error) {
        logger.warn({ error, path: workflow.path }, 'Failed to parse workflow');
        this.findings.push({
          ruleId: 'WF001',
          ruleName: 'invalid-yaml',
          severity: 'medium',
          confidence: 'high',
          title: 'Invalid YAML in workflow file',
          description: `The workflow file could not be parsed as valid YAML: ${error}`,
          remediation: 'Fix the YAML syntax errors in the workflow file.',
          filePath: workflow.path,
        });
      }
    }

    return this.findings;
  }

  private async scanWorkflow(workflow: WorkflowContent): Promise<void> {
    const parsed = yaml.load(workflow.content) as ParsedWorkflow | null;
    if (!parsed || typeof parsed !== 'object') {
      return;
    }

    // Run all security checks
    this.checkPullRequestTarget(workflow, parsed);
    this.checkUnpinnedActions(workflow, parsed);
    this.checkOverlyBroadPermissions(workflow, parsed);
    this.checkSecretsExposure(workflow, parsed);
    this.checkSelfHostedRunner(workflow, parsed);
    this.checkCachingHazards(workflow, parsed);
    this.checkGithubScriptInjection(workflow, parsed);
    this.checkDebugPatterns(workflow, parsed);
    this.checkUnsafeExpressions(workflow, parsed);
  }

  /**
   * CRITICAL: Check for pull_request_target with checkout of PR head
   * This is the most dangerous pattern - allows arbitrary code execution
   */
  private checkPullRequestTarget(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const triggers = this.normalizeOn(parsed.on);
    
    if (!triggers.includes('pull_request_target')) {
      return;
    }

    const jobs = parsed.jobs || {};
    
    for (const [jobName, job] of Object.entries(jobs)) {
      const steps = job.steps || [];
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Check for checkout of PR head
        if (step.uses?.startsWith('actions/checkout')) {
          const ref = step.with?.ref as string | undefined;
          
          // Dangerous patterns
          const dangerousRefs = [
            '${{ github.event.pull_request.head.sha }}',
            '${{ github.event.pull_request.head.ref }}',
            'refs/pull/${{ github.event.pull_request.number }}/merge',
            '${{ github.head_ref }}',
          ];
          
          if (ref && dangerousRefs.some(d => ref.includes(d.replace('${{ ', '').replace(' }}', '')))) {
            this.findings.push({
              ruleId: 'WF100',
              ruleName: 'pull-request-target-checkout',
              severity: 'critical',
              confidence: 'high',
              title: 'Dangerous pull_request_target with PR head checkout',
              description: `Job "${jobName}" uses pull_request_target trigger and checks out the PR head. This allows attackers to execute arbitrary code from their fork with write permissions to the target repository.`,
              remediation: `
1. Use 'pull_request' trigger instead if you don't need write access
2. If you need write access, download artifacts instead of checking out code
3. Never run untrusted code (npm install, build scripts) after checkout
4. Use separate workflows: one for building (pull_request) and one for actions (workflow_run)`,
              filePath: workflow.path,
              startLine: this.findLineNumber(workflow.content, step.uses),
              metadata: { jobName, stepIndex: i, ref },
            });
          }
          
          // Check if there are subsequent steps that run code
          const subsequentSteps = steps.slice(i + 1);
          const hasCodeExecution = subsequentSteps.some(s => 
            s.run || 
            s.uses?.includes('npm') ||
            s.uses?.includes('yarn') ||
            s.uses?.includes('pnpm') ||
            s.uses?.includes('setup-node')
          );
          
          if (hasCodeExecution && ref) {
            this.findings.push({
              ruleId: 'WF101',
              ruleName: 'untrusted-code-execution',
              severity: 'critical',
              confidence: 'high',
              title: 'Code execution after PR checkout in pull_request_target',
              description: `Job "${jobName}" checks out PR code and then executes it (runs commands, npm scripts, etc). This allows arbitrary code execution.`,
              remediation: 'Never execute code from untrusted sources. Use workflow_run pattern for safe CI/CD.',
              filePath: workflow.path,
              startLine: this.findLineNumber(workflow.content, 'run:'),
              metadata: { jobName },
            });
          }
        }
      }
    }
  }

  /**
   * Check for unpinned actions (should use SHA instead of tags)
   */
  private checkUnpinnedActions(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const jobs = parsed.jobs || {};
    
    for (const [jobName, job] of Object.entries(jobs)) {
      const steps = job.steps || [];
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        if (!step.uses) continue;
        
        // Skip local actions (./path)
        if (step.uses.startsWith('./')) continue;
        
        // Check if using tag instead of SHA
        const match = step.uses.match(/^([^@]+)@(.+)$/);
        if (!match) continue;
        
        const [, action, version] = match;
        
        // SHA is 40 hex characters
        const isSha = /^[a-f0-9]{40}$/i.test(version);
        
        // Check for semantic version tags (v1, v2.3.4, etc.)
        const isTag = /^v?\d+(\.\d+)*(-.*)?$/.test(version) || 
                      version === 'main' || 
                      version === 'master' ||
                      version === 'latest';
        
        if (!isSha && isTag) {
          // Determine severity based on action popularity/risk
          const isFirstPartyAction = action.startsWith('actions/') || 
                                     action.startsWith('github/');
          
          this.findings.push({
            ruleId: 'WF200',
            ruleName: 'unpinned-action',
            severity: isFirstPartyAction ? 'medium' : 'high',
            confidence: 'high',
            title: `Unpinned action: ${action}`,
            description: `Action "${step.uses}" uses a mutable tag instead of a pinned SHA. An attacker who compromises the action repository could inject malicious code.`,
            remediation: `Pin to a specific commit SHA:
\`\`\`yaml
uses: ${action}@<full-40-char-sha> # ${version}
\`\`\`

Use tools like Dependabot or Renovate to keep SHAs updated.`,
            filePath: workflow.path,
            startLine: this.findLineNumber(workflow.content, step.uses),
            snippet: `uses: ${step.uses}`,
            metadata: { action, version, jobName, stepIndex: i },
          });
        }
      }
    }
  }

  /**
   * Check for overly broad permissions
   */
  private checkOverlyBroadPermissions(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const dangerousPerms = [
      'contents: write',
      'packages: write', 
      'actions: write',
      'security-events: write',
      'id-token: write',
    ];
    
    const checkPermissions = (perms: unknown, scope: string): void => {
      if (perms === 'write-all') {
        this.findings.push({
          ruleId: 'WF300',
          ruleName: 'write-all-permissions',
          severity: 'high',
          confidence: 'high',
          title: `Write-all permissions at ${scope} level`,
          description: 'Using "write-all" grants maximum permissions which violates the principle of least privilege.',
          remediation: 'Explicitly declare only the permissions you need.',
          filePath: workflow.path,
          startLine: this.findLineNumber(workflow.content, 'permissions:'),
          metadata: { scope },
        });
        return;
      }
      
      if (typeof perms !== 'object' || !perms) return;
      
      const permObj = perms as Record<string, string>;
      
      for (const [perm, level] of Object.entries(permObj)) {
        if (level === 'write' && dangerousPerms.some(d => d.startsWith(`${perm}:`))) {
          this.findings.push({
            ruleId: 'WF301',
            ruleName: 'broad-write-permission',
            severity: 'medium',
            confidence: 'medium',
            title: `Broad write permission: ${perm}`,
            description: `The "${perm}: write" permission at ${scope} level may be overly permissive. Ensure this is necessary.`,
            remediation: `Review if "${perm}: write" is truly needed. Consider:
- Using "read" permission if write isn't necessary
- Moving the permission to a specific job that needs it
- Using OIDC tokens for specific operations`,
            filePath: workflow.path,
            startLine: this.findLineNumber(workflow.content, `${perm}:`),
            metadata: { permission: perm, level, scope },
          });
        }
      }
    };
    
    // Check workflow-level permissions
    checkPermissions(parsed.permissions, 'workflow');
    
    // Check job-level permissions
    const jobs = parsed.jobs || {};
    for (const [jobName, job] of Object.entries(jobs)) {
      checkPermissions(job.permissions, `job:${jobName}`);
    }
  }

  /**
   * Check for secrets exposure patterns
   */
  private checkSecretsExposure(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const jobs = parsed.jobs || {};
    const content = workflow.content;
    
    // Pattern: echo with secrets
    const echoSecretPattern = /echo\s+['"]?\$\{\{\s*secrets\./gi;
    let match;
    
    while ((match = echoSecretPattern.exec(content)) !== null) {
      this.findings.push({
        ruleId: 'WF400',
        ruleName: 'secret-in-echo',
        severity: 'high',
        confidence: 'high',
        title: 'Secret potentially exposed via echo',
        description: 'Echoing secrets can expose them in logs, even if GitHub tries to mask them.',
        remediation: 'Never echo secrets. If debugging, use GitHub\'s debug logging which is disabled by default.',
        filePath: workflow.path,
        startLine: this.findLineNumber(content, match[0]),
        snippet: match[0],
      });
    }
    
    // Check for secrets in env at job/step level
    for (const [jobName, job] of Object.entries(jobs)) {
      // Check job-level env
      if (job.env) {
        this.checkEnvForSecrets(job.env, `job:${jobName}`, workflow);
      }
      
      // Check step-level env
      const steps = job.steps || [];
      for (const step of steps) {
        if (step.env) {
          this.checkEnvForSecrets(step.env, `step:${step.name || 'unnamed'}`, workflow);
        }
      }
    }
  }

  private checkEnvForSecrets(env: Record<string, string>, scope: string, workflow: WorkflowContent): void {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.includes('${{ secrets.')) {
        // This is actually fine for passing secrets to processes
        // But we should warn if the key suggests logging
        if (key.toLowerCase().includes('debug') || key.toLowerCase().includes('log')) {
          this.findings.push({
            ruleId: 'WF401',
            ruleName: 'secret-in-debug-env',
            severity: 'medium',
            confidence: 'medium',
            title: `Secret in potentially logged env var: ${key}`,
            description: `Environment variable "${key}" at ${scope} contains a secret and may be logged based on its name.`,
            remediation: 'Ensure this environment variable is not logged or printed.',
            filePath: workflow.path,
            metadata: { envKey: key, scope },
          });
        }
      }
    }
  }

  /**
   * Check for self-hosted runner risks
   */
  private checkSelfHostedRunner(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const jobs = parsed.jobs || {};
    const triggers = this.normalizeOn(parsed.on);
    
    // Self-hosted + pull_request from forks is dangerous
    const allowsForksExecution = triggers.includes('pull_request') || 
                                  triggers.includes('pull_request_target');
    
    for (const [jobName, job] of Object.entries(jobs)) {
      const runsOn = job['runs-on'];
      
      if (!runsOn) continue;
      
      const runsOnArray = Array.isArray(runsOn) ? runsOn : [runsOn];
      const isSelfHosted = runsOnArray.some(r => 
        r.includes('self-hosted') || 
        r.includes('${{') // Could be dynamic, potentially self-hosted
      );
      
      if (isSelfHosted && allowsForksExecution) {
        this.findings.push({
          ruleId: 'WF500',
          ruleName: 'self-hosted-fork-execution',
          severity: 'high',
          confidence: 'medium',
          title: `Self-hosted runner with fork execution risk`,
          description: `Job "${jobName}" uses self-hosted runners and may execute code from forks. This could allow attackers to run malicious code on your infrastructure.`,
          remediation: `
1. Use GitHub-hosted runners for jobs triggered by external PRs
2. Configure repository settings to require approval for fork PRs
3. Use environments with protection rules
4. Implement runner groups with restricted access`,
          filePath: workflow.path,
          startLine: this.findLineNumber(workflow.content, 'runs-on:'),
          metadata: { jobName, runsOn },
        });
      }
    }
  }

  /**
   * Check for caching hazards
   */
  private checkCachingHazards(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const jobs = parsed.jobs || {};
    const triggers = this.normalizeOn(parsed.on);
    
    const isPRTrigger = triggers.includes('pull_request') || 
                        triggers.includes('pull_request_target');
    
    for (const [jobName, job] of Object.entries(jobs)) {
      const steps = job.steps || [];
      
      for (const step of steps) {
        if (!step.uses) continue;
        
        // Check for cache actions
        if (step.uses.includes('actions/cache') || 
            step.uses.includes('actions/setup-node') ||
            step.uses.includes('actions/setup-python')) {
          
          // Check for unsafe cache key patterns
          const cacheKey = step.with?.key as string | undefined;
          
          if (cacheKey && isPRTrigger) {
            // Using PR number or head ref in cache key for PRs can allow cache poisoning
            if (cacheKey.includes('github.event.pull_request') ||
                cacheKey.includes('github.head_ref')) {
              this.findings.push({
                ruleId: 'WF600',
                ruleName: 'cache-poisoning-risk',
                severity: 'medium',
                confidence: 'medium',
                title: 'Potential cache poisoning via PR-specific cache key',
                description: `Job "${jobName}" uses a cache key that includes PR-specific data. Malicious PRs could poison caches.`,
                remediation: 'Use base branch and lockfile hash for cache keys, not PR-specific values.',
                filePath: workflow.path,
                startLine: this.findLineNumber(workflow.content, cacheKey),
                metadata: { jobName, cacheKey },
              });
            }
          }
        }
      }
    }
  }

  /**
   * Check for github-script with untrusted inputs
   */
  private checkGithubScriptInjection(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const jobs = parsed.jobs || {};
    
    const untrustedContexts = [
      'github.event.issue.title',
      'github.event.issue.body',
      'github.event.pull_request.title',
      'github.event.pull_request.body',
      'github.event.comment.body',
      'github.event.review.body',
      'github.event.discussion.title',
      'github.event.discussion.body',
      'github.head_ref',
      'github.event.commits[',
    ];
    
    for (const [jobName, job] of Object.entries(jobs)) {
      const steps = job.steps || [];
      
      for (const step of steps) {
        // Check github-script action
        if (step.uses?.includes('actions/github-script')) {
          const script = step.with?.script as string | undefined;
          
          if (script) {
            for (const ctx of untrustedContexts) {
              if (script.includes(`\${{ ${ctx}`) || script.includes(`\${${ctx}`)) {
                this.findings.push({
                  ruleId: 'WF700',
                  ruleName: 'script-injection',
                  severity: 'high',
                  confidence: 'high',
                  title: 'Script injection via untrusted input',
                  description: `Job "${jobName}" uses github-script with untrusted context "${ctx}" which could allow script injection.`,
                  remediation: `
1. Pass untrusted inputs via environment variables
2. Use \`core.getInput()\` instead of expression syntax
3. Validate and sanitize all user inputs

Example safe pattern:
\`\`\`yaml
env:
  TITLE: \${{ github.event.issue.title }}
script: |
  const title = process.env.TITLE;
\`\`\``,
                  filePath: workflow.path,
                  startLine: this.findLineNumber(workflow.content, ctx),
                  metadata: { jobName, untrustedContext: ctx },
                });
              }
            }
          }
        }
        
        // Check run steps for injection
        if (step.run) {
          for (const ctx of untrustedContexts) {
            if (step.run.includes(`\${{ ${ctx}`)) {
              this.findings.push({
                ruleId: 'WF701',
                ruleName: 'command-injection',
                severity: 'critical',
                confidence: 'high',
                title: 'Command injection via untrusted input',
                description: `Job "${jobName}" interpolates untrusted input "${ctx}" directly into a shell command, allowing command injection.`,
                remediation: `
Use environment variables instead:
\`\`\`yaml
env:
  USER_INPUT: \${{ ${ctx} }}
run: |
  echo "$USER_INPUT"  # Safe - shell doesn't re-evaluate
\`\`\``,
                filePath: workflow.path,
                startLine: this.findLineNumber(workflow.content, ctx),
                metadata: { jobName, untrustedContext: ctx },
              });
            }
          }
        }
      }
    }
  }

  /**
   * Check for debug/verbose patterns that could leak secrets
   */
  private checkDebugPatterns(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const content = workflow.content;
    
    // Check for set -x which prints all commands
    if (content.includes('set -x')) {
      this.findings.push({
        ruleId: 'WF800',
        ruleName: 'verbose-shell',
        severity: 'medium',
        confidence: 'high',
        title: 'Verbose shell mode (set -x) enabled',
        description: 'Using "set -x" prints all executed commands including those with secrets.',
        remediation: 'Remove "set -x" or ensure no secrets are used in the same script.',
        filePath: workflow.path,
        startLine: this.findLineNumber(content, 'set -x'),
      });
    }
    
    // Check for ACTIONS_STEP_DEBUG
    if (content.includes('ACTIONS_STEP_DEBUG')) {
      this.findings.push({
        ruleId: 'WF801',
        ruleName: 'debug-mode-enabled',
        severity: 'low',
        confidence: 'medium',
        title: 'Debug mode enabled in workflow',
        description: 'ACTIONS_STEP_DEBUG is set which enables verbose logging.',
        remediation: 'Remove debug mode for production workflows.',
        filePath: workflow.path,
        startLine: this.findLineNumber(content, 'ACTIONS_STEP_DEBUG'),
      });
    }
    
    // Check for printenv
    if (content.includes('printenv') || content.includes('env | ')) {
      this.findings.push({
        ruleId: 'WF802',
        ruleName: 'env-dump',
        severity: 'medium',
        confidence: 'medium',
        title: 'Environment variables dump detected',
        description: 'Dumping environment variables could expose secrets.',
        remediation: 'Remove printenv/env commands or ensure no secrets are in environment.',
        filePath: workflow.path,
        startLine: this.findLineNumber(content, 'printenv'),
      });
    }
  }

  /**
   * Check for unsafe expression patterns
   */
  private checkUnsafeExpressions(workflow: WorkflowContent, parsed: ParsedWorkflow): void {
    const content = workflow.content;
    
    // Check for fromJSON with untrusted input
    const fromJsonPattern = /fromJSON\s*\(\s*['"]?\$\{\{\s*github\.event\.(issue|pull_request|comment|review)/gi;
    let match;
    
    while ((match = fromJsonPattern.exec(content)) !== null) {
      this.findings.push({
        ruleId: 'WF900',
        ruleName: 'unsafe-fromjson',
        severity: 'high',
        confidence: 'medium',
        title: 'Unsafe fromJSON with user-controlled input',
        description: 'Using fromJSON() with user-controlled data could lead to unexpected behavior.',
        remediation: 'Validate JSON input before parsing. Use typed schemas where possible.',
        filePath: workflow.path,
        startLine: this.findLineNumber(content, match[0]),
        snippet: match[0],
      });
    }
    
    // Check for always() without proper guards
    if (content.includes('if: always()') || content.includes("if: ${{ always() }}")) {
      this.findings.push({
        ruleId: 'WF901',
        ruleName: 'unguarded-always',
        severity: 'low',
        confidence: 'low',
        title: 'Unguarded always() condition',
        description: 'Using always() without additional conditions means the step runs even on cancellation.',
        remediation: 'Consider using "if: success() || failure()" instead of "always()" for most cases.',
        filePath: workflow.path,
        startLine: this.findLineNumber(content, 'always()'),
      });
    }
  }

  /**
   * Helper: Normalize the 'on' trigger to an array of event names
   */
  private normalizeOn(on: unknown): string[] {
    if (typeof on === 'string') {
      return [on];
    }
    if (Array.isArray(on)) {
      return on;
    }
    if (typeof on === 'object' && on !== null) {
      return Object.keys(on);
    }
    return [];
  }

  /**
   * Helper: Find line number for a string in content
   */
  private findLineNumber(content: string, searchStr: string): number | undefined {
    const index = content.indexOf(searchStr);
    if (index === -1) return undefined;
    
    const lines = content.substring(0, index).split('\n');
    return lines.length;
  }
}

export const workflowSecurityScanner = new WorkflowSecurityScanner();
