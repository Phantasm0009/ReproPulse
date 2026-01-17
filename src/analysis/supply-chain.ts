import { distance } from 'fastest-levenshtein';
import { createLogger } from '../config/logger';
import type { Severity, Confidence } from './workflow-security';

const logger = createLogger('supply-chain');

export interface SupplyChainFinding {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  description: string;
  remediation: string;
  filePath?: string;
  metadata?: Record<string, unknown>;
}

interface DependencyChange {
  name: string;
  ecosystem: string;
  previousVersion?: string;
  newVersion?: string;
  changeType: 'added' | 'removed' | 'updated';
  vulnerabilities?: Array<{
    severity: string;
    advisory_ghsa_id: string;
    advisory_summary: string;
  }>;
  license?: string;
  sourceRepository?: string;
}

interface SBOMPackage {
  name: string;
  versionInfo?: string;
  licenseConcluded?: string;
  licenseDeclared?: string;
  supplier?: string;
  downloadLocation?: string;
  externalRefs?: Array<{
    referenceCategory: string;
    referenceType: string;
    referenceLocator: string;
  }>;
}

// Popular packages to check for typosquatting
const POPULAR_PACKAGES: Record<string, string[]> = {
  npm: [
    'react', 'lodash', 'express', 'axios', 'moment', 'webpack', 'babel-core',
    'typescript', 'jquery', 'vue', 'angular', 'next', 'nuxt', 'svelte',
    'redux', 'mobx', 'rxjs', 'chalk', 'commander', 'yargs', 'dotenv',
    'eslint', 'prettier', 'jest', 'mocha', 'chai', 'sinon', 'puppeteer',
    'mongoose', 'sequelize', 'prisma', 'graphql', 'apollo-server', 'fastify',
    'socket.io', 'redis', 'pg', 'mysql', 'mongodb', 'aws-sdk', 'firebase',
  ],
  pypi: [
    'requests', 'numpy', 'pandas', 'django', 'flask', 'tensorflow', 'torch',
    'scikit-learn', 'matplotlib', 'pillow', 'beautifulsoup4', 'selenium',
    'pytest', 'sphinx', 'celery', 'redis', 'psycopg2', 'sqlalchemy', 'boto3',
    'pyyaml', 'cryptography', 'paramiko', 'fabric', 'ansible', 'scrapy',
  ],
  rubygems: [
    'rails', 'rake', 'bundler', 'rspec', 'puma', 'sidekiq', 'devise',
    'nokogiri', 'pg', 'mysql2', 'redis', 'activerecord', 'activesupport',
  ],
  maven: [
    'spring-boot', 'junit', 'log4j', 'guava', 'jackson', 'gson', 'lombok',
    'commons-lang3', 'commons-io', 'httpclient', 'slf4j', 'logback',
  ],
  go: [
    'gin', 'echo', 'fiber', 'gorm', 'cobra', 'viper', 'zap', 'logrus',
    'testify', 'wire', 'fx', 'chi', 'mux', 'negroni',
  ],
};

// Problematic licenses that may require legal review
const PROBLEMATIC_LICENSES = [
  'GPL-3.0', 'GPL-2.0', 'AGPL-3.0', 'LGPL-3.0', 'LGPL-2.1',
  'SSPL-1.0', 'BSL-1.1', 'Elastic-2.0', 'Commons Clause',
  'UNLICENSED', 'PROPRIETARY', 'Custom',
];

// Permissive licenses (informational)
const PERMISSIVE_LICENSES = [
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC',
  'Unlicense', 'CC0-1.0', '0BSD', 'WTFPL',
];

/**
 * Supply Chain Security Scanner
 * Analyzes dependencies for vulnerabilities, typosquatting, and license issues
 */
export class SupplyChainScanner {
  private findings: SupplyChainFinding[] = [];

  /**
   * Analyze dependency changes between base and head
   */
  async analyzeDependencyDiff(diffData: unknown): Promise<SupplyChainFinding[]> {
    this.findings = [];

    if (!diffData || !Array.isArray(diffData)) {
      logger.debug('No dependency diff data available');
      return this.findings;
    }

    const changes = diffData as DependencyChange[];
    
    for (const change of changes) {
      // Check for new dependencies
      if (change.changeType === 'added') {
        await this.checkNewDependency(change);
      }
      
      // Check for vulnerabilities
      if (change.vulnerabilities && change.vulnerabilities.length > 0) {
        this.checkVulnerabilities(change);
      }
      
      // Check for downgrades (suspicious)
      if (change.changeType === 'updated' && this.isDowngrade(change)) {
        this.checkDowngrade(change);
      }
      
      // Check license
      if (change.license) {
        this.checkLicense(change);
      }
    }

    return this.findings;
  }

  /**
   * Analyze SBOM for license and visibility issues
   */
  async analyzeSBOM(sbomData: unknown): Promise<SupplyChainFinding[]> {
    const sbomFindings: SupplyChainFinding[] = [];

    if (!sbomData || typeof sbomData !== 'object') {
      return sbomFindings;
    }

    const sbom = sbomData as { sbom?: { packages?: SBOMPackage[] } };
    const packages = sbom.sbom?.packages || [];

    let unknownLicenseCount = 0;
    let problematicLicenses: string[] = [];

    for (const pkg of packages) {
      const license = pkg.licenseConcluded || pkg.licenseDeclared;
      
      if (!license || license === 'NOASSERTION') {
        unknownLicenseCount++;
      } else if (PROBLEMATIC_LICENSES.some(l => license.includes(l))) {
        problematicLicenses.push(`${pkg.name}: ${license}`);
      }
    }

    if (unknownLicenseCount > 5) {
      sbomFindings.push({
        ruleId: 'SC400',
        ruleName: 'unknown-licenses',
        severity: 'medium',
        confidence: 'high',
        title: `${unknownLicenseCount} dependencies with unknown licenses`,
        description: 'Multiple dependencies lack license information, which could pose compliance risks.',
        remediation: 'Review dependencies and ensure license compatibility. Consider using license scanning tools.',
        metadata: { count: unknownLicenseCount },
      });
    }

    if (problematicLicenses.length > 0) {
      sbomFindings.push({
        ruleId: 'SC401',
        ruleName: 'copyleft-licenses',
        severity: 'medium',
        confidence: 'high',
        title: `${problematicLicenses.length} dependencies with copyleft/restrictive licenses`,
        description: `The following dependencies have licenses that may require legal review:\n${problematicLicenses.slice(0, 10).join('\n')}`,
        remediation: 'Consult with legal team about license compliance. Consider alternative packages with permissive licenses.',
        metadata: { licenses: problematicLicenses },
      });
    }

    return sbomFindings;
  }

  /**
   * Check for typosquatting in new packages
   */
  async checkTyposquatting(packageName: string, ecosystem: string): Promise<SupplyChainFinding | null> {
    const popularPackages = POPULAR_PACKAGES[ecosystem] || [];
    
    // Skip if the package is itself popular
    if (popularPackages.includes(packageName.toLowerCase())) {
      return null;
    }

    for (const popular of popularPackages) {
      const dist = distance(packageName.toLowerCase(), popular);
      const maxLen = Math.max(packageName.length, popular.length);
      const similarity = 1 - (dist / maxLen);

      // If very similar but not exact match
      if (similarity >= 0.8 && similarity < 1.0) {
        // Check for common typosquatting patterns
        const patterns = [
          packageName.replace(/-/g, ''), // removed hyphens
          packageName.replace(/js$/, ''), // removed js suffix
          packageName + 's', // added s
          packageName.slice(0, -1), // removed last char
          popular.replace(/-/g, '_'), // hyphen to underscore
          popular + '-js',
          popular + 'js',
        ];

        const isLikelyTyposquat = patterns.some(p => 
          packageName.toLowerCase() === p.toLowerCase()
        ) || dist <= 2;

        if (isLikelyTyposquat) {
          return {
            ruleId: 'SC200',
            ruleName: 'typosquat-candidate',
            severity: 'high',
            confidence: 'medium',
            title: `Potential typosquat: "${packageName}" similar to "${popular}"`,
            description: `The package "${packageName}" is suspiciously similar to the popular package "${popular}". This could be a typosquatting attempt.`,
            remediation: `Verify this is the intended package:
1. Check the package on the registry
2. Verify the author/maintainer
3. Review the package contents
4. If suspicious, use the popular package "${popular}" instead`,
            metadata: { 
              similarTo: popular, 
              distance: dist, 
              similarity: Math.round(similarity * 100) 
            },
          };
        }
      }
    }

    return null;
  }

  /**
   * Check a new dependency for various issues
   */
  private async checkNewDependency(change: DependencyChange): Promise<void> {
    // Check for typosquatting
    const typosquatFinding = await this.checkTyposquatting(
      change.name, 
      change.ecosystem
    );
    
    if (typosquatFinding) {
      this.findings.push(typosquatFinding);
    }

    // Flag new dependencies for review
    this.findings.push({
      ruleId: 'SC100',
      ruleName: 'new-dependency',
      severity: 'info',
      confidence: 'high',
      title: `New dependency added: ${change.name}`,
      description: `A new ${change.ecosystem} dependency "${change.name}@${change.newVersion}" was added.`,
      remediation: 'Review the new dependency for necessity, maintenance status, and security.',
      metadata: {
        name: change.name,
        version: change.newVersion,
        ecosystem: change.ecosystem,
        license: change.license,
      },
    });
  }

  /**
   * Check for known vulnerabilities
   */
  private checkVulnerabilities(change: DependencyChange): void {
    if (!change.vulnerabilities) return;

    for (const vuln of change.vulnerabilities) {
      const severityMap: Record<string, Severity> = {
        critical: 'critical',
        high: 'high',
        moderate: 'medium',
        medium: 'medium',
        low: 'low',
      };

      this.findings.push({
        ruleId: 'SC300',
        ruleName: 'vulnerable-dependency',
        severity: severityMap[vuln.severity.toLowerCase()] || 'medium',
        confidence: 'high',
        title: `Vulnerability in ${change.name}: ${vuln.advisory_ghsa_id}`,
        description: vuln.advisory_summary,
        remediation: `Update ${change.name} to a patched version. See https://github.com/advisories/${vuln.advisory_ghsa_id}`,
        metadata: {
          name: change.name,
          version: change.newVersion || change.previousVersion,
          advisory: vuln.advisory_ghsa_id,
          vulnSeverity: vuln.severity,
        },
      });
    }
  }

  /**
   * Check for suspicious version downgrades
   */
  private checkDowngrade(change: DependencyChange): void {
    this.findings.push({
      ruleId: 'SC500',
      ruleName: 'dependency-downgrade',
      severity: 'medium',
      confidence: 'medium',
      title: `Dependency downgrade: ${change.name}`,
      description: `${change.name} was downgraded from ${change.previousVersion} to ${change.newVersion}. This could reintroduce vulnerabilities or be part of an attack.`,
      remediation: 'Verify the downgrade is intentional. Check if it reintroduces known vulnerabilities.',
      metadata: {
        name: change.name,
        from: change.previousVersion,
        to: change.newVersion,
        ecosystem: change.ecosystem,
      },
    });
  }

  /**
   * Check for problematic licenses
   */
  private checkLicense(change: DependencyChange): void {
    if (!change.license) return;

    const isProblematic = PROBLEMATIC_LICENSES.some(l => 
      change.license!.toUpperCase().includes(l.toUpperCase())
    );

    if (isProblematic) {
      this.findings.push({
        ruleId: 'SC600',
        ruleName: 'problematic-license',
        severity: 'medium',
        confidence: 'high',
        title: `Restrictive license: ${change.name} (${change.license})`,
        description: `The dependency "${change.name}" uses a ${change.license} license which may have compliance implications.`,
        remediation: 'Review license compatibility with your project. Consult legal if needed.',
        metadata: {
          name: change.name,
          license: change.license,
          ecosystem: change.ecosystem,
        },
      });
    }
  }

  /**
   * Determine if a version change is a downgrade
   */
  private isDowngrade(change: DependencyChange): boolean {
    if (!change.previousVersion || !change.newVersion) return false;

    try {
      // Simple semver comparison (not handling all cases)
      const prev = this.parseVersion(change.previousVersion);
      const next = this.parseVersion(change.newVersion);

      if (prev.major > next.major) return true;
      if (prev.major === next.major && prev.minor > next.minor) return true;
      if (prev.major === next.major && prev.minor === next.minor && prev.patch > next.patch) {
        return true;
      }
    } catch {
      // Can't parse version, assume not a downgrade
    }

    return false;
  }

  /**
   * Parse a version string into components
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } {
    const clean = version.replace(/^[v^~>=<]/, '');
    const parts = clean.split('.');
    
    return {
      major: parseInt(parts[0] || '0', 10),
      minor: parseInt(parts[1] || '0', 10),
      patch: parseInt(parts[2]?.split('-')[0] || '0', 10),
    };
  }
}

export const supplyChainScanner = new SupplyChainScanner();
