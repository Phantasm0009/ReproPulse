'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Wrench, GitBranch, CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';
import { api, type FixRun, type Repository } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FixTrendChart } from '@/components/charts';
import { RelativeTime } from '@/components/relative-time';
import { useState, useEffect, useMemo } from 'react';

export default function FixesPage() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installation');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: repositories } = useQuery({
    queryKey: ['repositories', installationId],
    queryFn: () => api.getRepositories(installationId!),
    enabled: !!installationId,
  });

  // Fetch fix runs for all repositories
  const { data: allFixRuns, isLoading } = useQuery({
    queryKey: ['all-fixes', installationId, repositories?.map((r) => r.id)],
    queryFn: async () => {
      if (!repositories) return [];
      const fixPromises = repositories.map((repo) =>
        api.getFixRuns(repo.id).then((fixes) =>
          fixes.map((f) => ({ ...f, repository: repo }))
        )
      );
      const results = await Promise.all(fixPromises);
      return results.flat().sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },
    enabled: !!repositories && repositories.length > 0,
  });

  // Track mounted state for hydration-safe rendering
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate stats
  const stats = {
    total: allFixRuns?.length || 0,
    completed: allFixRuns?.filter((f) => f.status === 'completed').length || 0,
    pending: allFixRuns?.filter((f) => f.status === 'pending' || f.status === 'in_progress').length || 0,
    failed: allFixRuns?.filter((f) => f.status === 'failed').length || 0,
  };

  // Prepare chart data (last 7 days) - only calculate on client
  const chartData = useMemo(() => {
    if (!mounted) return [];
    return Array.from({ length: 7 }).map((_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const dayFixes = allFixRuns?.filter((f) => {
        const fixDate = new Date(f.createdAt);
        return fixDate.toDateString() === date.toDateString();
      }) || [];

      return {
        date: dateStr,
        applied: dayFixes.filter((f) => f.status === 'completed').length,
        pending: dayFixes.filter((f) => f.status === 'pending' || f.status === 'in_progress').length,
        failed: dayFixes.filter((f) => f.status === 'failed').length,
      };
    });
  }, [mounted, allFixRuns]);

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Fix History</h1>
          <p className="text-muted-foreground">
            Track automated fixes applied across repositories
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard
            title="Total Fixes"
            value={stats.total}
            icon={Wrench}
          />
          <StatsCard
            title="Completed"
            value={stats.completed}
            icon={CheckCircle2}
            variant="success"
          />
          <StatsCard
            title="Pending"
            value={stats.pending}
            icon={Clock}
            variant="warning"
          />
          <StatsCard
            title="Failed"
            value={stats.failed}
            icon={XCircle}
            variant="destructive"
          />
        </div>

        {/* Fix Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Fix Activity (Last 7 Days)</CardTitle>
            <CardDescription>
              Daily breakdown of fix operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FixTrendChart data={chartData} />
          </CardContent>
        </Card>

        {/* Fix History List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Fixes</CardTitle>
            <CardDescription>
              History of all fix operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : allFixRuns && allFixRuns.length > 0 ? (
              <div className="space-y-4">
                {allFixRuns.slice(0, 20).map((fix) => (
                  <FixRow key={fix.id} fix={fix as FixRun & { repository: Repository }} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No fixes applied yet</p>
                <p className="text-sm text-muted-foreground">
                  Fix operations will appear here when you apply one-click fixes
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}

function StatsCard({ title, value, icon: Icon, variant = 'default' }: StatsCardProps) {
  const variantClasses = {
    default: '',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    destructive: 'text-red-500',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 text-muted-foreground ${variantClasses[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variantClasses[variant]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

interface FixRowProps {
  fix: FixRun & { repository: Repository };
}

function FixRow({ fix }: FixRowProps) {
  const statusConfig = {
    completed: { color: 'success', icon: CheckCircle2 },
    pending: { color: 'secondary', icon: Clock },
    in_progress: { color: 'secondary', icon: Clock },
    failed: { color: 'destructive', icon: XCircle },
  } as const;

  const status = statusConfig[fix.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;

  const fixTypeLabels: Record<string, string> = {
    pin_actions: 'Pin Actions to SHA',
    add_permissions: 'Add Workflow Permissions',
    open_issue: 'Create Issue',
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border">
      <div className="flex items-center gap-4">
        <StatusIcon className={`w-5 h-5 ${
          fix.status === 'completed' ? 'text-green-500' :
          fix.status === 'failed' ? 'text-red-500' : 'text-yellow-500'
        }`} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{fixTypeLabels[fix.fixType] || fix.fixType}</span>
            <Badge variant={status.color as 'success' | 'secondary' | 'destructive'}>
              {fix.status}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <GitBranch className="w-3 h-3" />
            {fix.repository.fullName}
            <span>•</span>
            <RelativeTime date={fix.createdAt} />
          </div>
          {fix.error && (
            <p className="text-sm text-red-500 mt-1">{fix.error}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {fix.prNumber && (
          <a
            href={`https://github.com/${fix.repository.fullName}/pull/${fix.prNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
          >
            PR #{fix.prNumber}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {fix.commitSha && !fix.prNumber && (
          <a
            href={`https://github.com/${fix.repository.fullName}/commit/${fix.commitSha}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
          >
            {fix.commitSha.slice(0, 7)}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
