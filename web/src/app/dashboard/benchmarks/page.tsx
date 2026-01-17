'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Award, Target } from 'lucide-react';
import { api, type Benchmark } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BenchmarkChart } from '@/components/charts';
import { ScoreGauge, ScoreBadge } from '@/components/score-gauge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

export default function BenchmarksPage() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installation');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: benchmarks, isLoading: benchmarksLoading } = useQuery({
    queryKey: ['benchmarks'],
    queryFn: api.getBenchmarks,
  });

  const { data: stats } = useQuery({
    queryKey: ['stats', installationId],
    queryFn: () => api.getDashboardStats(installationId!),
    enabled: !!installationId,
  });

  const currentScore = stats?.averageScore || 0;

  // Find current percentile
  const currentPercentile = benchmarks?.reduce((acc, b) => {
    if (b.score <= currentScore) return b.percentile;
    return acc;
  }, 0) || 0;

  // Calculate scores for comparison
  const getScoreForPercentile = (percentile: number) => {
    const benchmark = benchmarks?.find((b) => b.percentile === percentile);
    return benchmark?.score || 0;
  };

  const p50Score = getScoreForPercentile(50);
  const p75Score = getScoreForPercentile(75);
  const p90Score = getScoreForPercentile(90);

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Benchmarks</h1>
          <p className="text-muted-foreground">
            Compare your security posture against industry standards
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Your Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <ScoreGauge score={currentScore} size="sm" showLabel={false} />
                <div>
                  <p className="text-2xl font-bold">{currentScore}</p>
                  <p className="text-xs text-muted-foreground">
                    {currentPercentile}th percentile
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4" />
                Median (P50)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{p50Score}</p>
              <p className="text-xs text-muted-foreground">
                {currentScore >= p50Score ? (
                  <span className="text-green-500">✓ Above median</span>
                ) : (
                  <span className="text-orange-500">{p50Score - currentScore} points to go</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Good (P75)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{p75Score}</p>
              <p className="text-xs text-muted-foreground">
                {currentScore >= p75Score ? (
                  <span className="text-green-500">✓ Above 75th percentile</span>
                ) : (
                  <span className="text-orange-500">{p75Score - currentScore} points to go</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Award className="w-4 h-4" />
                Excellent (P90)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{p90Score}</p>
              <p className="text-xs text-muted-foreground">
                {currentScore >= p90Score ? (
                  <span className="text-green-500">✓ Top 10%</span>
                ) : (
                  <span className="text-orange-500">{p90Score - currentScore} points to go</span>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Benchmark Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
            <CardDescription>
              How your score compares to other repositories
            </CardDescription>
          </CardHeader>
          <CardContent>
            {benchmarksLoading ? (
              <Skeleton className="h-[300px]" />
            ) : benchmarks && benchmarks.length > 0 ? (
              <BenchmarkChart data={benchmarks} currentScore={currentScore} />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Benchmark data not available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Percentile Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Percentile Breakdown</CardTitle>
            <CardDescription>
              Score thresholds for each percentile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {benchmarksLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))
              ) : (
                benchmarks?.filter((b) => b.percentile % 10 === 0).map((benchmark) => (
                  <div key={benchmark.percentile} className="flex items-center gap-4">
                    <div className="w-20 text-sm font-medium">
                      P{benchmark.percentile}
                    </div>
                    <div className="flex-1">
                      <Progress value={benchmark.score} className="h-3" />
                    </div>
                    <div className="w-16 text-right">
                      <ScoreBadge score={benchmark.score} />
                    </div>
                    <div className="w-24 text-right text-sm text-muted-foreground">
                      {benchmark.repoCount.toLocaleString()} repos
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Improvement Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Improve</CardTitle>
            <CardDescription>
              Recommendations to increase your score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ImprovementTip
                title="Pin GitHub Actions to SHA"
                description="Using full commit SHAs instead of version tags prevents supply chain attacks from compromised action releases."
                impact="High"
              />
              <ImprovementTip
                title="Add Minimal Permissions"
                description="Explicitly declare minimal permissions for workflows to limit the blast radius of any compromise."
                impact="High"
              />
              <ImprovementTip
                title="Enable Dependabot"
                description="Keep dependencies up to date automatically and receive security alerts for vulnerable packages."
                impact="Medium"
              />
              <ImprovementTip
                title="Add Security Policy"
                description="Create a SECURITY.md file to help security researchers report vulnerabilities responsibly."
                impact="Low"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

interface ImprovementTipProps {
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
}

function ImprovementTip({ title, description, impact }: ImprovementTipProps) {
  const impactColors = {
    High: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    Low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border">
      <div className="flex-1">
        <h4 className="font-medium mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span className={`px-2 py-1 rounded text-xs font-medium ${impactColors[impact]}`}>
        {impact} Impact
      </span>
    </div>
  );
}
