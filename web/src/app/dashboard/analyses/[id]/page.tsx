'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  GitBranch,
  GitPullRequest,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import { api, type Analysis, type Finding } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScoreGauge, ScoreBadge } from '@/components/score-gauge';
import { FindingsList, SeverityBadge } from '@/components/findings';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RelativeTime } from '@/components/relative-time';
import Link from 'next/link';

export default function AnalysisDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const analysisId = params.id as string;
  const installationId = searchParams.get('installation');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: analysis, isLoading } = useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => api.getAnalysis(analysisId),
    enabled: !!analysisId,
  });

  // Helper to get score from either format
  const getScore = () => {
    return analysis?.score ?? analysis?.overallScore ?? 0;
  };

  const getBreakdownScore = (category: 'workflow' | 'supplyChain' | 'maintainability' | 'hygiene') => {
    if (analysis?.breakdown) {
      const map = {
        workflow: analysis.breakdown.workflowSecurity,
        supplyChain: analysis.breakdown.supplyChain,
        maintainability: analysis.breakdown.maintainability,
        hygiene: analysis.breakdown.hygiene,
      };
      return map[category] ?? 0;
    }
    // Fall back to direct fields
    const map = {
      workflow: analysis?.workflowScore,
      supplyChain: analysis?.supplyChainScore,
      maintainability: analysis?.maintainabilityScore,
      hygiene: analysis?.hygieneScore,
    };
    return map[category] ?? 0;
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle2, color: 'text-green-500', label: 'Completed' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-500', label: 'Failed' };
      case 'in_progress':
        return { icon: Clock, color: 'text-yellow-500', label: 'In Progress' };
      default:
        return { icon: Clock, color: 'text-gray-500', label: status };
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout user={user?.user} installationId={installationId || undefined}>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </DashboardLayout>
    );
  }

  if (!analysis) {
    return (
      <DashboardLayout user={user?.user} installationId={installationId || undefined}>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Analysis Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The analysis you're looking for doesn't exist or has been deleted.
          </p>
          <Link href={`/dashboard?installation=${installationId}`}>
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const statusInfo = getStatusInfo(analysis.status);
  const StatusIcon = statusInfo.icon;

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                href={analysis.repository ? `/dashboard/repositories/${analysis.repository.id}?installation=${installationId}` : `/dashboard?installation=${installationId}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <h1 className="text-3xl font-bold">
                {analysis.repository?.fullName || 'Analysis Details'}
              </h1>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground">
              {analysis.prNumber ? (
                <span className="flex items-center gap-1">
                  <GitPullRequest className="w-4 h-4" />
                  PR #{analysis.prNumber}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <GitBranch className="w-4 h-4" />
                  {analysis.ref || analysis.sha?.slice(0, 7) || 'Unknown'}
                </span>
              )}
              <Badge variant={analysis.status === 'completed' ? 'success' : 'secondary'} className="flex items-center gap-1">
                <StatusIcon className={`w-3 h-3 ${statusInfo.color}`} />
                {statusInfo.label}
              </Badge>
              <span>
                <RelativeTime date={analysis.createdAt} />
              </span>
            </div>
          </div>

          {analysis.repository && (
            <a
              href={`https://github.com/${analysis.repository.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <ExternalLink className="w-4 h-4 mr-2" />
                View on GitHub
              </Button>
            </a>
          )}
        </div>

        {/* Score Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Health Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <ScoreGauge score={getScore()} size="sm" />
                <div className="text-3xl font-bold">{getScore()}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Findings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{analysis.findings?.length || 0}</p>
              <p className="text-xs text-muted-foreground">
                {analysis.findings?.filter(f => f.severity === 'critical').length || 0} critical
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Percentile</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {analysis.percentile !== undefined ? `${analysis.percentile}th` : 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground">
                Among analyzed repos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Commit</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-mono">{analysis.sha?.slice(0, 7) || 'N/A'}</p>
              {analysis.completedAt && (
                <p className="text-xs text-muted-foreground">
                  Completed <RelativeTime date={analysis.completedAt} />
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Score Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Score Breakdown</CardTitle>
            <CardDescription>
              Detailed scoring across security categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <ScoreCategory
                title="Workflow Security"
                score={getBreakdownScore('workflow')}
                maxScore={40}
                description="GitHub Actions security patterns"
              />
              <ScoreCategory
                title="Supply Chain"
                score={getBreakdownScore('supplyChain')}
                maxScore={30}
                description="Dependencies and package security"
              />
              <ScoreCategory
                title="Maintainability"
                score={getBreakdownScore('maintainability')}
                maxScore={20}
                description="Code quality and documentation"
              />
              <ScoreCategory
                title="Hygiene"
                score={getBreakdownScore('hygiene')}
                maxScore={10}
                description="Repository best practices"
              />
            </div>
          </CardContent>
        </Card>

        {/* Findings */}
        {analysis.findings && analysis.findings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Findings ({analysis.findings.length})</CardTitle>
              <CardDescription>
                Security issues and recommendations identified in this analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FindingsList findings={analysis.findings} />
            </CardContent>
          </Card>
        )}

        {/* No Findings State */}
        {(!analysis.findings || analysis.findings.length === 0) && analysis.status === 'completed' && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Issues Found</h3>
              <p className="text-muted-foreground text-center max-w-md">
                This analysis completed successfully without finding any security issues.
                Great job maintaining a secure repository!
              </p>
            </CardContent>
          </Card>
        )}

        {/* In Progress State */}
        {analysis.status === 'in_progress' && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="w-12 h-12 text-yellow-500 mb-4 animate-pulse" />
              <h3 className="text-lg font-semibold mb-2">Analysis In Progress</h3>
              <p className="text-muted-foreground text-center max-w-md">
                This analysis is currently running. Results will appear here once complete.
                This usually takes 1-2 minutes.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function ScoreCategory({
  title,
  score,
  maxScore,
  description,
}: {
  title: string;
  score: number;
  maxScore: number;
  description: string;
}) {
  const percentage = (score / maxScore) * 100;
  const getColor = () => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 60) return 'bg-yellow-500';
    if (percentage >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">
          {score}/{maxScore}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
