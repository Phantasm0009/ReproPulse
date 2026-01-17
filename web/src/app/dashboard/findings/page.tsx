'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Search, Filter, AlertTriangle } from 'lucide-react';
import { api, type Finding, type Repository } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FindingsList, SeverityBadge } from '@/components/findings';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { groupBy } from '@/lib/utils';
import { useState, useMemo } from 'react';

export default function FindingsPage() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installation');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: repositories } = useQuery({
    queryKey: ['repositories', installationId],
    queryFn: () => api.getRepositories(installationId!),
    enabled: !!installationId,
  });

  // Fetch findings for all repositories
  const { data: allFindings, isLoading } = useQuery({
    queryKey: ['all-findings', installationId, repositories?.map((r) => r.id)],
    queryFn: async () => {
      if (!repositories) return [];
      const findingsPromises = repositories.map((repo) =>
        api.getFindings(repo.id).then((findings) =>
          findings.map((f) => ({ ...f, repository: repo }))
        )
      );
      const results = await Promise.all(findingsPromises);
      return results.flat();
    },
    enabled: !!repositories && repositories.length > 0,
  });

  const triggerFix = useMutation({
    mutationFn: (findingId: string) => api.triggerFix(findingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-findings'] });
    },
  });

  const dismissFinding = useMutation({
    mutationFn: (findingId: string) => api.updateFinding(findingId, { status: 'dismissed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-findings'] });
    },
  });

  const openFindings = useMemo(() => {
    return (allFindings || []).filter((f) => f.status === 'open');
  }, [allFindings]);

  const filteredFindings = useMemo(() => {
    return openFindings.filter((f) => {
      if (search && !f.title.toLowerCase().includes(search.toLowerCase()) &&
          !f.description.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (severityFilter !== 'all' && f.severity.toLowerCase() !== severityFilter.toLowerCase()) {
        return false;
      }
      if (categoryFilter !== 'all' && f.category !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [openFindings, search, severityFilter, categoryFilter]);

  const findingsByCategory = useMemo(() => {
    return groupBy(filteredFindings, 'category');
  }, [filteredFindings]);

  const categories = useMemo(() => {
    return [...new Set(openFindings.map((f) => f.category))];
  }, [openFindings]);

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    openFindings.forEach((f) => {
      const severity = f.severity.toLowerCase() as keyof typeof counts;
      if (severity in counts) {
        counts[severity]++;
      }
    });
    return counts;
  }, [openFindings]);

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Findings</h1>
          <p className="text-muted-foreground">
            Security and health issues across all repositories
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <SeverityCard severity="critical" count={severityCounts.critical} />
          <SeverityCard severity="high" count={severityCounts.high} />
          <SeverityCard severity="medium" count={severityCounts.medium} />
          <SeverityCard severity="low" count={severityCounts.low} />
          <SeverityCard severity="info" count={severityCounts.info} />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search findings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Findings by Category */}
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              All ({filteredFindings.length})
            </TabsTrigger>
            {Object.entries(findingsByCategory).map(([category, findings]) => (
              <TabsTrigger key={category} value={category}>
                {category} ({findings.length})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>All Findings</CardTitle>
                <CardDescription>
                  {filteredFindings.length} open findings across all repositories
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-24" />
                    ))}
                  </div>
                ) : (
                  <FindingsList
                    findings={filteredFindings}
                    onFix={(finding) => triggerFix.mutate(finding.id)}
                    onDismiss={(finding) => dismissFinding.mutate(finding.id)}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {Object.entries(findingsByCategory).map(([category, findings]) => (
            <TabsContent key={category} value={category} className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{category}</CardTitle>
                  <CardDescription>
                    {findings.length} findings in this category
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FindingsList
                    findings={findings}
                    onFix={(finding) => triggerFix.mutate(finding.id)}
                    onDismiss={(finding) => dismissFinding.mutate(finding.id)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

interface SeverityCardProps {
  severity: string;
  count: number;
}

function SeverityCard({ severity, count }: SeverityCardProps) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 border-red-200 dark:bg-red-900/20 dark:border-red-800',
    high: 'bg-orange-100 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800',
    medium: 'bg-yellow-100 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
    low: 'bg-blue-100 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    info: 'bg-gray-100 border-gray-200 dark:bg-gray-800/20 dark:border-gray-700',
  };

  return (
    <Card className={colors[severity]}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <SeverityBadge severity={severity} />
          <span className="text-2xl font-bold">{count}</span>
        </div>
      </CardContent>
    </Card>
  );
}
