import Link from 'next/link';
import { Shield, GitBranch, Zap, BarChart3, Users, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            <span className="font-bold text-xl">RepoPulse</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="text-muted-foreground hover:text-foreground">
              Docs
            </Link>
            <Button asChild>
              <a href={`${API_URL}/api/auth/github`}>Sign in with GitHub</a>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-green-500 bg-clip-text text-transparent">
          PR Health & Security Scoring
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Automated security analysis for every pull request. Get instant health scores,
          actionable findings, and one-click fixes to keep your codebase secure.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button size="lg" asChild>
            <a href={`${API_URL}/api/auth/github`}>
              <GitBranch className="w-5 h-5 mr-2" />
              Install on GitHub
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/docs">Learn More</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Why RepoPulse?</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={Shield}
            title="Comprehensive Security Analysis"
            description="Scan GitHub Actions workflows, supply chain dependencies, and code patterns for vulnerabilities."
          />
          <FeatureCard
            icon={BarChart3}
            title="Health Scoring (0-100)"
            description="Get an instant health score for every PR with detailed breakdowns across security categories."
          />
          <FeatureCard
            icon={Zap}
            title="One-Click Fixes"
            description="Apply automated fixes directly from GitHub Check Runs with a single click."
          />
          <FeatureCard
            icon={GitBranch}
            title="PR-First Approach"
            description="Analysis runs on every pull request, highlighting new vulnerabilities introduced in the PR."
          />
          <FeatureCard
            icon={Users}
            title="Team Features"
            description="Manage policies, assign security champions, and collaborate on fixing issues."
          />
          <FeatureCard
            icon={Lock}
            title="Industry Benchmarks"
            description="Compare your security posture against thousands of open-source repositories."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="container mx-auto px-4 py-20 bg-muted/50 rounded-3xl">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-8">
          <Step number={1} title="Install" description="Install RepoPulse on your GitHub organization or repositories." />
          <Step number={2} title="Analyze" description="Every PR triggers automatic security analysis across 4 categories." />
          <Step number={3} title="Review" description="Check Run shows health score with detailed findings and fix suggestions." />
          <Step number={4} title="Fix" description="Apply one-click fixes or create issues for manual review." />
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold mb-6">Ready to Secure Your PRs?</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Join thousands of developers using RepoPulse to maintain secure and healthy codebases.
        </p>
        <Button size="lg" asChild>
          <a href={`${API_URL}/api/auth/github`}>Get Started Free</a>
        </Button>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 border-t">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <span>RepoPulse</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/docs">Documentation</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="https://github.com/repopulse" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl border bg-card">
      <Icon className="w-10 h-10 text-primary mb-4" />
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-xl flex items-center justify-center mx-auto mb-4">
        {number}
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
