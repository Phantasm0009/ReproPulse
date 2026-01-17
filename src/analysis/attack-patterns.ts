import { createLogger } from '../config/logger';
import type { Severity, Confidence } from './workflow-security';

const logger = createLogger('attack-patterns');

export interface AttackPatternFinding {
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
  metadata?: Record<string, unknown>;
}

interface FileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

interface CommitInfo {
  sha: string;
  commit: {
    message: string;
    verification?: {
      verified: boolean;
      reason: string;
    };
  };
  author?: {
    login: string;
  };
}

interface WorkflowPermissionChange {
  file: string;
  oldPermissions?: unknown;
  newPermissions?: unknown;
}

/**
 * Attack Pattern Heuristics Scanner
 * Detects potentially malicious patterns in PRs and commits
 */
export class AttackPatternScanner {
  private findings: AttackPatternFinding[] = [];

  /**
   * Analyze PR changes for attack patterns
   */
  async analyze(
    files: FileChange[],
    commits: CommitInfo[],
    workflowChanges: WorkflowPermissionChange[]
  ): Promise<AttackPatternFinding[]> {
    this.findings = [];

    // Run all attack pattern checks
    this.checkObfuscatedCode(files);
    this.checkMinifiedCodeSpikes(files);
    this.checkSuspiciousRenames(files);
    this.checkBuildScriptChanges(files);
    this.checkInstallScriptChanges(files);
    this.checkWorkflowPermissionEscalation(workflowChanges);
    this.checkCommitVerification(commits);
    this.checkSuspiciousPatterns(files);
    this.checkExfilPatterns(files);

    return this.findings;
  }

  /**
   * Check for obfuscated code patterns
   */
  private checkObfuscatedCode(files: FileChange[]): void {
    const jsFiles = files.filter(f => 
      f.filename.endsWith('.js') || 
      f.filename.endsWith('.ts') ||
      f.filename.endsWith('.mjs')
    );

    for (const file of jsFiles) {
      if (!file.patch) continue;

      // Patterns indicating obfuscation
      const obfuscationPatterns = [
        // Hex-encoded strings
        /\\x[0-9a-f]{2}/gi,
        // Base64 in code
        /atob\s*\(\s*['"][A-Za-z0-9+/=]{50,}/g,
        /Buffer\.from\s*\(\s*['"][A-Za-z0-9+/=]{50,}/g,
        // Eval with encoded content
        /eval\s*\(\s*(?:atob|Buffer\.from|decodeURI)/gi,
        // Very long single lines (common in minified malware)
        /^.{500,}$/m,
        // Variable names that are just characters
        /\b(?:var|let|const)\s+[_$a-z]{1,2}\s*=/gi,
        // Unicode escapes
        /\\u[0-9a-f]{4}/gi,
        // String concatenation obfuscation
        /\+\s*['"][a-z]{1,2}['"]\s*\+/gi,
      ];

      let matches = 0;
      for (const pattern of obfuscationPatterns) {
        const found = file.patch.match(pattern);
        if (found) {
          matches += found.length;
        }
      }

      // Threshold for suspicion
      if (matches > 20) {
        this.findings.push({
          ruleId: 'AP100',
          ruleName: 'obfuscated-code',
          severity: 'high',
          confidence: 'medium',
          title: `Potentially obfuscated code in ${file.filename}`,
          description: `The file contains ${matches} patterns commonly associated with code obfuscation. This could indicate an attempt to hide malicious code.`,
          remediation: 'Carefully review the actual code changes. Request readable, non-minified source.',
          filePath: file.filename,
          metadata: { matchCount: matches },
        });
      }
    }
  }

  /**
   * Check for unexpected spikes in minified code
   */
  private checkMinifiedCodeSpikes(files: FileChange[]): void {
    const jsFiles = files.filter(f => 
      (f.filename.endsWith('.js') || f.filename.endsWith('.ts')) &&
      !f.filename.includes('.min.') &&
      !f.filename.includes('/dist/') &&
      !f.filename.includes('/build/')
    );

    for (const file of jsFiles) {
      // Large additions to non-minified files that look minified
      if (file.additions > 100 && file.patch) {
        const addedLines = file.patch
          .split('\n')
          .filter(l => l.startsWith('+') && !l.startsWith('+++'));
        
        const longLines = addedLines.filter(l => l.length > 200);
        const avgLineLength = addedLines.reduce((a, l) => a + l.length, 0) / addedLines.length;

        if (longLines.length > 5 || avgLineLength > 150) {
          this.findings.push({
            ruleId: 'AP101',
            ruleName: 'minified-source-code',
            severity: 'medium',
            confidence: 'medium',
            title: `Minified code added to source file: ${file.filename}`,
            description: `Large amount of minified/compressed code added to what appears to be a source file. This makes review difficult and could hide malicious code.`,
            remediation: 'Ensure only readable source code is committed. Use build processes for minification.',
            filePath: file.filename,
            metadata: { 
              longLineCount: longLines.length, 
              avgLineLength: Math.round(avgLineLength) 
            },
          });
        }
      }
    }
  }

  /**
   * Check for suspicious file renames
   */
  private checkSuspiciousRenames(files: FileChange[]): void {
    const renamedFiles = files.filter(f => f.status === 'renamed' && f.previous_filename);

    // Dangerous file patterns
    const dangerousPatterns = [
      /package\.json$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.npmrc$/,
      /\.yarnrc/,
      /setup\.py$/,
      /pyproject\.toml$/,
      /requirements.*\.txt$/,
      /Gemfile(\.lock)?$/,
      /go\.(mod|sum)$/,
      /Cargo\.(toml|lock)$/,
      /composer\.(json|lock)$/,
      /build\.(gradle|xml)$/,
      /pom\.xml$/,
      /Makefile$/,
      /Dockerfile/,
      /\.github\/workflows\//,
    ];

    for (const file of renamedFiles) {
      const wasDestructive = dangerousPatterns.some(p => p.test(file.previous_filename!));
      const isDestructive = dangerousPatterns.some(p => p.test(file.filename));

      // Renaming critical files is suspicious
      if (wasDestructive || isDestructive) {
        this.findings.push({
          ruleId: 'AP200',
          ruleName: 'suspicious-rename',
          severity: 'high',
          confidence: 'medium',
          title: `Suspicious rename of critical file`,
          description: `"${file.previous_filename}" renamed to "${file.filename}". Renaming build/config files can be used to bypass security controls or hide malicious changes.`,
          remediation: 'Verify the rename is intentional and review the file contents carefully.',
          filePath: file.filename,
          metadata: { 
            from: file.previous_filename, 
            to: file.filename 
          },
        });
      }
    }
  }

  /**
   * Check for build script modifications
   */
  private checkBuildScriptChanges(files: FileChange[]): void {
    const buildFiles = files.filter(f => 
      f.filename.match(/package\.json$/) ||
      f.filename.match(/setup\.py$/) ||
      f.filename.match(/pyproject\.toml$/) ||
      f.filename.match(/Makefile$/) ||
      f.filename.match(/build\.(gradle|xml)$/) ||
      f.filename.match(/pom\.xml$/) ||
      f.filename.match(/Cargo\.toml$/)
    );

    for (const file of buildFiles) {
      if (!file.patch) continue;

      // Look for suspicious script additions
      const suspiciousPatterns = [
        // Network calls in build scripts
        /curl\s+[^|]*\s*\|/,
        /wget\s+.*-O\s*-\s*\|/,
        /fetch\s*\(/,
        /http\.get/,
        /request\s*\(/,
        // Shell execution
        /exec\s*\(/,
        /spawn\s*\(/,
        /child_process/,
        /subprocess/,
        /os\.system/,
        /os\.popen/,
        // Environment/credential access
        /process\.env\./,
        /os\.environ/,
        /getenv\s*\(/,
        // Encoded commands
        /base64.*decode/i,
        /eval\s*\(/,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(file.patch)) {
          // Check if it's in an added line
          const addedLines = file.patch.split('\n').filter(l => l.startsWith('+'));
          const hasPatternInAdded = addedLines.some(l => pattern.test(l));
          
          if (hasPatternInAdded) {
            this.findings.push({
              ruleId: 'AP300',
              ruleName: 'suspicious-build-script',
              severity: 'high',
              confidence: 'medium',
              title: `Suspicious pattern in build file: ${file.filename}`,
              description: `Build/config file contains patterns that could indicate supply chain attack (network calls, shell execution, credential access in build scripts).`,
              remediation: 'Carefully review the build script changes. Verify any network calls or script executions are necessary and safe.',
              filePath: file.filename,
              metadata: { pattern: pattern.source },
            });
            break; // One finding per file
          }
        }
      }
    }
  }

  /**
   * Check for install script changes (npm postinstall, etc.)
   */
  private checkInstallScriptChanges(files: FileChange[]): void {
    const packageJson = files.find(f => 
      f.filename === 'package.json' || 
      f.filename.endsWith('/package.json')
    );

    if (!packageJson?.patch) return;

    // Check for postinstall/preinstall script additions
    const installScriptPatterns = [
      /"preinstall"\s*:/,
      /"postinstall"\s*:/,
      /"prepare"\s*:/,
      /"prepublish"\s*:/,
    ];

    for (const pattern of installScriptPatterns) {
      const addedLines = packageJson.patch.split('\n').filter(l => l.startsWith('+'));
      const hasInstallScript = addedLines.some(l => pattern.test(l));
      
      if (hasInstallScript) {
        this.findings.push({
          ruleId: 'AP301',
          ruleName: 'install-script-added',
          severity: 'high',
          confidence: 'high',
          title: 'Install script added to package.json',
          description: 'A preinstall/postinstall script was added. These scripts run automatically on npm install and are a common attack vector.',
          remediation: 'Review the install script contents. Ensure it only performs necessary operations.',
          filePath: packageJson.filename,
          metadata: {},
        });
        break;
      }
    }
  }

  /**
   * Check for workflow permission escalation in same PR
   */
  private checkWorkflowPermissionEscalation(changes: WorkflowPermissionChange[]): void {
    for (const change of changes) {
      const oldPerms = this.normalizePermissions(change.oldPermissions);
      const newPerms = this.normalizePermissions(change.newPermissions);

      // Check for escalations
      const escalations: string[] = [];
      
      for (const [perm, level] of Object.entries(newPerms)) {
        const oldLevel = oldPerms[perm] || 'none';
        
        if (this.isEscalation(oldLevel, level)) {
          escalations.push(`${perm}: ${oldLevel} → ${level}`);
        }
      }

      // Check for write-all
      if (newPerms['write-all'] && !oldPerms['write-all']) {
        escalations.push('Added write-all permissions');
      }

      if (escalations.length > 0) {
        this.findings.push({
          ruleId: 'AP400',
          ruleName: 'workflow-permission-escalation',
          severity: 'high',
          confidence: 'high',
          title: `Workflow permission escalation in ${change.file}`,
          description: `The PR escalates workflow permissions:\n${escalations.join('\n')}\n\nThis could be combined with other changes to gain unauthorized access.`,
          remediation: 'Review the permission changes carefully. Ensure they follow the principle of least privilege.',
          filePath: change.file,
          metadata: { escalations },
        });
      }
    }
  }

  /**
   * Check commit verification status
   */
  private checkCommitVerification(commits: CommitInfo[]): void {
    const unverifiedCount = commits.filter(c => 
      c.commit.verification && !c.commit.verification.verified
    ).length;
    
    const totalVerifiable = commits.filter(c => c.commit.verification).length;
    
    // If most commits are verified but some aren't, flag it
    if (totalVerifiable > 0 && unverifiedCount > 0) {
      const verifiedRatio = (totalVerifiable - unverifiedCount) / totalVerifiable;
      
      if (verifiedRatio > 0.5 && unverifiedCount > 0) {
        const unverified = commits
          .filter(c => c.commit.verification && !c.commit.verification.verified)
          .map(c => ({
            sha: c.sha.substring(0, 7),
            author: c.author?.login,
            reason: c.commit.verification?.reason,
          }));

        this.findings.push({
          ruleId: 'AP500',
          ruleName: 'unverified-commits',
          severity: 'medium',
          confidence: 'high',
          title: `${unverifiedCount} unverified commits in a mostly-verified repository`,
          description: `Some commits in this PR are not cryptographically verified while most repo commits are. This could indicate commit spoofing.`,
          remediation: 'Verify the commits are from the expected authors. Consider requiring signed commits.',
          metadata: { unverified },
        });
      }
    }
  }

  /**
   * Check for other suspicious patterns
   */
  private checkSuspiciousPatterns(files: FileChange[]): void {
    for (const file of files) {
      if (!file.patch) continue;

      // Check for crypto mining patterns
      const miningPatterns = [
        /coinhive/i,
        /cryptonight/i,
        /monero/i,
        /stratum\+tcp/i,
        /minergate/i,
        /nicehash/i,
      ];

      for (const pattern of miningPatterns) {
        if (pattern.test(file.patch)) {
          this.findings.push({
            ruleId: 'AP600',
            ruleName: 'crypto-mining',
            severity: 'critical',
            confidence: 'high',
            title: `Cryptocurrency mining code detected in ${file.filename}`,
            description: 'The file contains patterns associated with cryptocurrency mining malware.',
            remediation: 'Remove the mining code immediately. Investigate how it was introduced.',
            filePath: file.filename,
            metadata: { pattern: pattern.source },
          });
          break;
        }
      }

      // Check for reverse shell patterns
      const shellPatterns = [
        /\/bin\/(?:ba)?sh\s+-i/,
        /nc\s+.*-e\s+\/bin/,
        /python.*socket.*connect/,
        /bash.*>\/dev\/tcp/,
        /exec\s+\d+<>\/dev\/tcp/,
      ];

      for (const pattern of shellPatterns) {
        if (pattern.test(file.patch)) {
          this.findings.push({
            ruleId: 'AP601',
            ruleName: 'reverse-shell',
            severity: 'critical',
            confidence: 'high',
            title: `Reverse shell pattern detected in ${file.filename}`,
            description: 'The file contains patterns that could establish a reverse shell connection.',
            remediation: 'Immediately review and remove this code. Investigate the source of this PR.',
            filePath: file.filename,
            metadata: { pattern: pattern.source },
          });
          break;
        }
      }
    }
  }

  /**
   * Check for data exfiltration patterns
   */
  private checkExfilPatterns(files: FileChange[]): void {
    for (const file of files) {
      if (!file.patch) continue;

      // Patterns that might indicate data exfiltration
      const exfilPatterns = [
        // Sending env vars to external URLs
        /(?:fetch|axios|request|http\.get).*process\.env/,
        // Reading and sending SSH keys
        /\.ssh\/id_/,
        // Accessing credentials files
        /\.aws\/credentials/,
        /\.npmrc/,
        /\.netrc/,
        // Base64 encoding secrets
        /btoa.*(?:secret|key|token|password|credential)/i,
        /Buffer\.from.*(?:secret|key|token|password|credential)/i,
      ];

      for (const pattern of exfilPatterns) {
        const addedLines = file.patch.split('\n').filter(l => l.startsWith('+'));
        const hasPattern = addedLines.some(l => pattern.test(l));
        
        if (hasPattern) {
          this.findings.push({
            ruleId: 'AP700',
            ruleName: 'exfil-pattern',
            severity: 'critical',
            confidence: 'medium',
            title: `Potential data exfiltration pattern in ${file.filename}`,
            description: 'The file contains patterns that could be used to steal credentials or sensitive data.',
            remediation: 'Review the code carefully. Verify the purpose of accessing sensitive files or encoding credentials.',
            filePath: file.filename,
            metadata: { pattern: pattern.source },
          });
          break;
        }
      }
    }
  }

  /**
   * Normalize permissions object
   */
  private normalizePermissions(perms: unknown): Record<string, string> {
    if (!perms) return {};
    if (perms === 'write-all') return { 'write-all': 'write' };
    if (perms === 'read-all') return { 'read-all': 'read' };
    if (typeof perms === 'object') return perms as Record<string, string>;
    return {};
  }

  /**
   * Check if a permission change is an escalation
   */
  private isEscalation(oldLevel: string, newLevel: string): boolean {
    const levels = ['none', 'read', 'write'];
    const oldIdx = levels.indexOf(oldLevel);
    const newIdx = levels.indexOf(newLevel);
    return newIdx > oldIdx && newIdx >= 0 && oldIdx >= 0;
  }
}

export const attackPatternScanner = new AttackPatternScanner();
