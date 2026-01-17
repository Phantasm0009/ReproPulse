'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Users, Plus, Trash2, Shield, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { api, type SecurityChampion } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export default function TeamPage() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installation');
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newChampion, setNewChampion] = useState('');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: champions, isLoading } = useQuery({
    queryKey: ['champions', installationId],
    queryFn: () => api.getSecurityChampions(installationId!),
    enabled: !!installationId,
  });

  const addChampion = useMutation({
    mutationFn: () => api.addSecurityChampion(installationId!, { githubLogin: newChampion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['champions'] });
      setIsAddOpen(false);
      setNewChampion('');
    },
  });

  const removeChampion = useMutation({
    mutationFn: (id: string) => api.removeSecurityChampion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['champions'] });
    },
  });

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Team</h1>
            <p className="text-muted-foreground">
              Manage security champions and team settings
            </p>
          </div>
        </div>

        {/* Security Champions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Security Champions
                </CardTitle>
                <CardDescription>
                  Team members who will be mentioned on critical findings
                </CardDescription>
              </div>
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Champion
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Security Champion</DialogTitle>
                    <DialogDescription>
                      Enter the GitHub username of the team member
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="github-login">GitHub Username</Label>
                    <Input
                      id="github-login"
                      value={newChampion}
                      onChange={(e) => setNewChampion(e.target.value)}
                      placeholder="octocat"
                      className="mt-2"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => addChampion.mutate()}
                      disabled={!newChampion || addChampion.isPending}
                    >
                      {addChampion.isPending ? 'Adding...' : 'Add Champion'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                ))}
              </div>
            ) : champions && champions.length > 0 ? (
              <div className="space-y-4">
                {champions.map((champion) => (
                  <div
                    key={champion.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      {champion.avatarUrl ? (
                        <Image
                          src={champion.avatarUrl}
                          alt={champion.githubLogin}
                          width={40}
                          height={40}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <Users className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{champion.name || champion.githubLogin}</p>
                        <a
                          href={`https://github.com/${champion.githubLogin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          @{champion.githubLogin}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeChampion.mutate(champion.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No security champions assigned yet
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Permissions Info */}
        <Card>
          <CardHeader>
            <CardTitle>Team Permissions</CardTitle>
            <CardDescription>
              How team roles affect RepoPulse access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <RoleInfo
                role="Admin"
                description="Full access to all settings, policies, and can manage team members"
                permissions={['Manage policies', 'Configure notifications', 'Add/remove champions', 'View all analyses']}
              />
              <RoleInfo
                role="Security Champion"
                description="Mentioned on critical findings and can apply fixes"
                permissions={['View all analyses', 'Apply one-click fixes', 'Dismiss findings', 'Receive notifications']}
              />
              <RoleInfo
                role="Member"
                description="Read-only access to analyses and findings"
                permissions={['View analyses', 'View findings']}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

interface RoleInfoProps {
  role: string;
  description: string;
  permissions: string[];
}

function RoleInfo({ role, description, permissions }: RoleInfoProps) {
  return (
    <div className="p-4 rounded-lg border">
      <h4 className="font-semibold mb-1">{role}</h4>
      <p className="text-sm text-muted-foreground mb-2">{description}</p>
      <ul className="text-sm space-y-1">
        {permissions.map((perm) => (
          <li key={perm} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {perm}
          </li>
        ))}
      </ul>
    </div>
  );
}
