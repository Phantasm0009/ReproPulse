'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  GitPullRequest,
  History,
  Shield,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { api, type Analysis, type Finding, type Repository } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScoreGauge, ScoreBadge } from '@/components/score-gauge';
import { FindingsList, SeverityBadge } from '@/components/findings';
import { ScoreHistoryChart } from '@/components/charts';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useState } from 'react';

export default function RepositoryDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const repoId = params.id as string;
  const installationId = searchParams.get('installation');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: repository, isLoading: repoLoading } = useQuery({
    queryKey: ['repository', repoId],
    queryFn: () => api.getRepository(repoId),
  });

  const { data: analysesData, isLoading: analysesLoading } = useQuery({
    queryKey: ['analyses', repoId],
    queryFn: () => api.getAnalyses(repoId, { limit: 20 }),
  });

  const { data: findings, isLoading: findingsLoading } = useQuery({
    queryKey: ['findings', repoId],
    queryFn: () => api.getFindings(repoId),
  });

  const triggerAnalysis = useMutation({
    mutationFn: () => api.triggerAnalysis(repoId),
    onSuccess: (data) => {
      toast({
        title: 'Analysis Started',
        description: `Analysis has been queued for ${repository?.fullName || 'repository'}. This may take a few moments.`,
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['analyses', repoId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to start analysis. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const triggerFix = useMutation({
    mutationFn: (findingId: string) => api.triggerFix(findingId),
    onSuccess: () => {
      toast({
        title: 'Fix Queued',
        description: 'The fix has been queued and will be applied shortly.',
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['findings', repoId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fix Failed',
        description: error.message || 'Failed to apply fix. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const dismissFinding = useMutation({
    mutationFn: (findingId: string) => api.updateFinding(findingId, { status: 'dismissed' }),
    onSuccess: () => {
      toast({
        title: 'Finding Dismissed',
        description: 'The finding has been dismissed.',
      });
      queryClient.invalidateQueries({ queryKey: ['findings', repoId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to dismiss finding.',
        variant: 'destructive',
      });
    },
  });

  const latestAnalysis = analysesData?.analyses[0];
  const openFindings = findings?.filter((f) => f.status === 'open') || [];

  // Prepare chart data
  const scoreHistory = analysesData?.analyses
    .slice()
    .reverse()
    .map((a) => ({
      date: formatDate(a.createdAt).split(',')[0],
      score: a.score,
    })) || [];

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            {repoLoading ? (
              <>
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-48" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <GitBranch className="w-6 h-6" />
                  <h1 className="text-3xl font-bold">{repository?.fullName}</h1>
                  <a
                    href={`https://github.com/${repository?.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-muted-foreground">
                  {repository?.private ? 'Private' : 'Public'} • Default branch: {repository?.defaultBranch}
                </p>
              </>
            )}
          </div>
          <Button
            onClick={() => triggerAnalysis.mutate()}
            disabled={triggerAnalysis.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${triggerAnalysis.isPending ? 'animate-spin' : ''}`} />
            Run Analysis
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Health Score</CardTitle>
            </CardHeader>
            <CardContent>
              {latestAnalysis ? (
                <div className="flex items-center gap-4">
                  <ScoreGauge score={latestAnalysis.score} size="sm" showLabel={false} />
                  <div>
                    <p className="text-2xl font-bold">{latestAnalysis.score}</p>
                    {latestAnalysis.percentile && (
                      <p className="text-xs text-muted-foreground">
                        {latestAnalysis.percentile}th percentile
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No analysis yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Open Findings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{openFindings.length}</p>
              <p className="text-xs text-muted-foreground">
                {openFindings.filter((f) => f.severity === 'critical').length} critical
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Analyses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{analysesData?.total || 0}</p>
              <p className="text-xs text-muted-foreground">
                Last: {latestAnalysis ? formatRelativeTime(latestAnalysis.createdAt) : 'Never'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {latestAnalysis ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Workflow</span>
                    <span>{latestAnalysis.breakdown.workflowSecurity}/40</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Supply Chain</span>
                    <span>{latestAnalysis.breakdown.supplyChain}/30</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Maintainability</span>
                    <span>{latestAnalysis.breakdown.maintainability}/20</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hygiene</span>
                    <span>{latestAnalysis.breakdown.hygiene}/10</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No analysis yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="findings">
          <TabsList>
            <TabsTrigger value="findings">
              <Shield className="w-4 h-4 mr-2" />
              Findings ({openFindings.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="w-4 h-4 mr-2" />
              History
            </TabsTrigger>
            <TabsTrigger value="trends">
              <GitPullRequest className="w-4 h-4 mr-2" />
              Trends
            </TabsTrigger>
          </TabsList>

          <TabsContent value="findings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Open Findings</CardTitle>
                <CardDescription>
                  Security and health issues detected in this repository
                </CardDescription>
              </CardHeader>
              <CardContent>
                {findingsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-24" />
                    ))}
                  </div>
                ) : (
                  <FindingsList
                    findings={openFindings}
                    onFix={(finding) => triggerFix.mutate(finding.id)}
                    onDismiss={(finding) => dismissFinding.mutate(finding.id)}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Analysis History</CardTitle>
                <CardDescription>
                  Recent analysis runs for this repository
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analysesLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {analysesData?.analyses.map((analysis) => (
                      <AnalysisRow
                        key={analysis.id}
                        analysis={analysis}
                        installationId={installationId!}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Score Trend</CardTitle>
                <CardDescription>
                  Health score over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scoreHistory.length > 1 ? (
                  <ScoreHistoryChart data={scoreHistory} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Not enough data to show trends</p>
                    <p className="text-sm">Run more analyses to see score trends</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

interface AnalysisRowProps {
  analysis: Analysis;
  installationId: string;
}

function AnalysisRow({ analysis, installationId }: AnalysisRowProps) {
  return (
    <Link
      href={`/dashboard/analyses/${analysis.id}?installation=${installationId}`}
      className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-4">
        {analysis.prNumber ? (
          <GitPullRequest className="w-5 h-5 text-muted-foreground" />
        ) : (
          <GitBranch className="w-5 h-5 text-muted-foreground" />
        )}
        <div>
          <div className="flex items-center gap-2">
            {analysis.prNumber ? (
              <span className="font-medium">PR #{analysis.prNumber}</span>
            ) : (
              <span className="font-medium">{analysis.ref || analysis.sha.slice(0, 7)}</span>
            )}
            <Badge variant={analysis.status === 'completed' ? 'success' : 'secondary'}>
              {analysis.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatRelativeTime(analysis.createdAt)} • {analysis.findings?.length || 0} findings
          </p>
        </div>
      </div>
      <ScoreBadge score={analysis.score} />
    </Link>
  );
}
