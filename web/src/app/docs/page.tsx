import Link from 'next/link';
import { Shield, Book, Code, Zap, GitBranch, Lock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Shield className="w-8 h-8 text-primary" />
              <span className="font-bold text-xl">RepoPulse</span>
            </Link>
            <Button asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Documentation</h1>

        {/* Getting Started */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Book className="w-6 h-6" />
            Getting Started
          </h2>
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <p className="text-muted-foreground mb-4">
              RepoPulse is a GitHub App that automatically analyzes your pull requests 
              for security vulnerabilities, supply chain risks, and code maintainability issues.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Install the RepoPulse GitHub App on your organization or repository</li>
              <li>RepoPulse automatically runs on every pull request</li>
              <li>View your security score and findings in the Check Run</li>
              <li>Use one-click fixes to resolve issues instantly</li>
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-6 h-6" />
            Features
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 border rounded-lg">
              <Lock className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Workflow Security</h3>
              <p className="text-sm text-muted-foreground">
                Detects dangerous patterns in GitHub Actions workflows like 
                script injection, excessive permissions, and insecure artifact handling.
              </p>
            </div>
            <div className="p-6 border rounded-lg">
              <GitBranch className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Supply Chain Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Identifies typosquatting, dependency confusion, and unpinned 
                dependencies that could introduce vulnerabilities.
              </p>
            </div>
            <div className="p-6 border rounded-lg">
              <Code className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Code Maintainability</h3>
              <p className="text-sm text-muted-foreground">
                Checks for missing documentation, stale dependencies, 
                and other maintainability issues.
              </p>
            </div>
            <div className="p-6 border rounded-lg">
              <AlertTriangle className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Attack Pattern Detection</h3>
              <p className="text-sm text-muted-foreground">
                Identifies potential malicious patterns in code changes 
                like obfuscation and credential harvesting.
              </p>
            </div>
          </div>
        </section>

        {/* Scoring */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Health Score</h2>
          <p className="text-muted-foreground mb-4">
            Every analysis produces a health score from 0-100 based on:
          </p>
          <ul className="space-y-2 text-muted-foreground">
            <li><strong>Workflow Security (40%)</strong> - Security of CI/CD configurations</li>
            <li><strong>Supply Chain (30%)</strong> - Dependency security and integrity</li>
            <li><strong>Maintainability (20%)</strong> - Code quality and documentation</li>
            <li><strong>Hygiene (10%)</strong> - General repository health</li>
          </ul>
        </section>

        {/* Support */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Support</h2>
          <p className="text-muted-foreground">
            Need help? Open an issue on our{' '}
            <a 
              href="https://github.com/Phantasm0009/ReproPulse/issues" 
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub repository
            </a>.
          </p>
        </section>
      </main>
    </div>
  );
}
