'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  GitBranch,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Activity,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { api, type DashboardStats, type Repository, type Analysis } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreGauge, ScoreBadge } from '@/components/score-gauge';
import { ScoreHistoryChart, FindingsBySeverityChart } from '@/components/charts';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime, getScoreColor } from '@/lib/utils';
import Link from 'next/link';

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Handle both 'installation' and 'installation_id' (GitHub's redirect param)
  const installationId = searchParams.get('installation') || searchParams.get('installation_id');
  const setupAction = searchParams.get('setup_action');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: installations, isLoading: installationsLoading } = useQuery({
    queryKey: ['installations'],
    queryFn: api.getInstallations,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats', installationId],
    queryFn: () => api.getDashboardStats(installationId!),
    enabled: !!installationId,
  });

  const { data: repositories } = useQuery({
    queryKey: ['repositories', installationId],
    queryFn: () => api.getRepositories(installationId!),
    enabled: !!installationId,
  });

  // Handle GitHub App installation redirect - normalize the URL
  useEffect(() => {
    if (searchParams.get('installation_id') && !searchParams.get('installation')) {
      const newParams = new URLSearchParams();
      newParams.set('installation', searchParams.get('installation_id')!);
      router.replace(`/dashboard?${newParams.toString()}`);
    }
  }, [searchParams, router]);

  // Auto-select first installation if none selected
  useEffect(() => {
    if (!installationId && installations && installations.length > 0) {
      router.replace(`/dashboard?installation=${installations[0].id}`);
    }
  }, [installationId, installations, router]);

  const handleLogout = async () => {
    await api.logout();
    router.push('/');
  };

  // Show loading while fetching installations
  if (installationsLoading) {
    return (
      <DashboardLayout user={user?.user} onLogout={handleLogout}>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Loading installations...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!installationId) {
    return (
      <DashboardLayout user={user?.user} onLogout={handleLogout}>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">No Installation Selected</h2>
            <p className="text-muted-foreground mb-4">
              Please install RepoPulse on a GitHub organization or select an installation.
            </p>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/github`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            >
              <GitBranch className="w-4 h-4" />
              Install on GitHub
            </a>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      user={user?.user}
      installationId={installationId}
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your repository health and security status
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Repositories"
            value={stats?.totalRepositories}
            icon={GitBranch}
            loading={statsLoading}
          />
          <StatsCard
            title="Average Score"
            value={stats?.averageScore}
            icon={Activity}
            loading={statsLoading}
            renderValue={(v) => <ScoreBadge score={v} />}
          />
          <StatsCard
            title="Critical Findings"
            value={stats?.criticalFindings}
            icon={AlertTriangle}
            loading={statsLoading}
            variant="destructive"
          />
          <StatsCard
            title="Fixes Applied"
            value={stats?.fixesApplied}
            icon={Wrench}
            loading={statsLoading}
            variant="success"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Score Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Health Score</CardTitle>
              <CardDescription>
                Aggregate score across all repositories
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-6">
              {statsLoading ? (
                <Skeleton className="w-32 h-32 rounded-full" />
              ) : (
                <ScoreGauge score={stats?.averageScore || 0} size="lg" />
              )}
            </CardContent>
          </Card>

          {/* Findings by Severity */}
          <Card>
            <CardHeader>
              <CardTitle>Findings by Severity</CardTitle>
              <CardDescription>
                Distribution of open findings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FindingsBySeverityChart
                data={[
                  { severity: 'Critical', count: stats?.criticalFindings || 0 },
                  { severity: 'High', count: Math.floor((stats?.totalFindings || 0) * 0.2) },
                  { severity: 'Medium', count: Math.floor((stats?.totalFindings || 0) * 0.3) },
                  { severity: 'Low', count: Math.floor((stats?.totalFindings || 0) * 0.3) },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        {/* Recent Repositories */}
        <Card>
          <CardHeader>
            <CardTitle>Repositories</CardTitle>
            <CardDescription>
              Recently analyzed repositories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {repositories?.slice(0, 5).map((repo) => (
                <RepositoryRow key={repo.id} repository={repo} installationId={installationId} />
              ))}
              {repositories?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No repositories found. Repositories will appear here after installation.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

interface StatsCardProps {
  title: string;
  value?: number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  variant?: 'default' | 'destructive' | 'success';
  renderValue?: (value: number) => React.ReactNode;
}

function StatsCard({
  title,
  value,
  icon: Icon,
  loading,
  variant = 'default',
  renderValue,
}: StatsCardProps) {
  const variantClasses = {
    default: 'text-foreground',
    destructive: 'text-red-500',
    success: 'text-green-500',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className={`text-2xl font-bold ${variantClasses[variant]}`}>
            {renderValue ? renderValue(value || 0) : value || 0}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RepositoryRowProps {
  repository: Repository;
  installationId: string;
}

function RepositoryRow({ repository, installationId }: RepositoryRowProps) {
  return (
    <Link
      href={`/dashboard/repositories/${repository.id}?installation=${installationId}`}
      className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-4">
        <GitBranch className="w-5 h-5 text-muted-foreground" />
        <div>
          <h4 className="font-medium">{repository.fullName}</h4>
          <p className="text-sm text-muted-foreground">
            {repository.analysisCount} analyses
            {repository.lastAnalyzedAt && (
              <> • Last analyzed {formatRelativeTime(repository.lastAnalyzedAt)}</>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {repository.latestScore !== undefined && (
          <ScoreBadge score={repository.latestScore} />
        )}
        {repository.latestPercentile !== undefined && (
          <span className="text-sm text-muted-foreground">
            {repository.latestPercentile}th percentile
          </span>
        )}
      </div>
    </Link>
  );
}
