'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, Search, Filter } from 'lucide-react';
import { api, type Repository } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScoreBadge } from '@/components/score-gauge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';
import { useState, useMemo } from 'react';

export default function RepositoriesPage() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installation');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'lastAnalyzed'>('lastAnalyzed');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: repositories, isLoading } = useQuery({
    queryKey: ['repositories', installationId],
    queryFn: () => api.getRepositories(installationId!),
    enabled: !!installationId,
  });

  const filteredAndSortedRepos = useMemo(() => {
    if (!repositories) return [];

    let filtered = repositories.filter((repo) =>
      repo.fullName.toLowerCase().includes(search.toLowerCase())
    );

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.fullName.localeCompare(b.fullName);
        case 'score':
          return (b.latestScore || 0) - (a.latestScore || 0);
        case 'lastAnalyzed':
          if (!a.lastAnalyzedAt) return 1;
          if (!b.lastAnalyzedAt) return -1;
          return new Date(b.lastAnalyzedAt).getTime() - new Date(a.lastAnalyzedAt).getTime();
        default:
          return 0;
      }
    });
  }, [repositories, search, sortBy]);

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Repositories</h1>
          <p className="text-muted-foreground">
            View and manage your connected repositories
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lastAnalyzed">Last Analyzed</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="score">Score</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Repository List */}
        <div className="grid gap-4">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded" />
                    <div className="flex-1">
                      <Skeleton className="h-5 w-48 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="w-16 h-8 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredAndSortedRepos.length > 0 ? (
            filteredAndSortedRepos.map((repo) => (
              <RepositoryCard
                key={repo.id}
                repository={repo}
                installationId={installationId!}
              />
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <GitBranch className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No repositories found</h3>
                <p className="text-muted-foreground">
                  {search
                    ? 'Try adjusting your search query'
                    : 'Repositories will appear here after installation'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

interface RepositoryCardProps {
  repository: Repository;
  installationId: string;
}

function RepositoryCard({ repository, installationId }: RepositoryCardProps) {
  return (
    <Link href={`/dashboard/repositories/${repository.id}?installation=${installationId}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">{repository.fullName}</h3>
                <p className="text-sm text-muted-foreground">
                  {repository.private ? 'Private' : 'Public'} • {repository.defaultBranch}
                  {repository.lastAnalyzedAt && (
                    <> • Analyzed {formatRelativeTime(repository.lastAnalyzedAt)}</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">
                  {repository.analysisCount} analyses
                </p>
                {repository.latestPercentile !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {repository.latestPercentile}th percentile
                  </p>
                )}
              </div>
              {repository.latestScore !== undefined ? (
                <ScoreBadge score={repository.latestScore} />
              ) : (
                <span className="text-sm text-muted-foreground">Not analyzed</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
