'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  Edit2,
  Shield,
  AlertTriangle,
  Ban,
  Eye,
} from 'lucide-react';
import { api, type Policy, type PolicyRule } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const AVAILABLE_RULES = [
  { id: 'pull_request_target', category: 'Workflow Security', description: 'Detects risky pull_request_target usage' },
  { id: 'unpinned_actions', category: 'Workflow Security', description: 'Actions not pinned to SHA' },
  { id: 'excessive_permissions', category: 'Workflow Security', description: 'Workflow with write-all permissions' },
  { id: 'secrets_in_logs', category: 'Workflow Security', description: 'Potential secret exposure in logs' },
  { id: 'self_hosted_runner', category: 'Workflow Security', description: 'Self-hosted runner usage' },
  { id: 'script_injection', category: 'Workflow Security', description: 'Potential script injection' },
  { id: 'vulnerable_dependency', category: 'Supply Chain', description: 'Known vulnerable dependency' },
  { id: 'typosquat_risk', category: 'Supply Chain', description: 'Potential typosquat package' },
  { id: 'license_issue', category: 'Supply Chain', description: 'Incompatible license detected' },
  { id: 'obfuscated_code', category: 'Attack Patterns', description: 'Obfuscated code detected' },
  { id: 'suspicious_rename', category: 'Attack Patterns', description: 'Suspicious file rename' },
  { id: 'permission_escalation', category: 'Attack Patterns', description: 'Permission escalation detected' },
];

export default function PoliciesPage() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installation');
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: policies, isLoading } = useQuery({
    queryKey: ['policies', installationId],
    queryFn: () => api.getPolicies(installationId!),
    enabled: !!installationId,
  });

  const createPolicy = useMutation({
    mutationFn: (data: Omit<Policy, 'id' | 'createdAt'>) =>
      api.createPolicy(installationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setIsCreateOpen(false);
    },
  });

  const updatePolicy = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Policy> }) =>
      api.updatePolicy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setEditingPolicy(null);
    },
  });

  const deletePolicy = useMutation({
    mutationFn: (id: string) => api.deletePolicy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Policies</h1>
            <p className="text-muted-foreground">
              Configure how findings should be handled
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Policy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <PolicyForm
                onSubmit={(data) => createPolicy.mutate(data)}
                onCancel={() => setIsCreateOpen(false)}
                isPending={createPolicy.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Policy List */}
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))
          ) : policies && policies.length > 0 ? (
            policies.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                onEdit={() => setEditingPolicy(policy)}
                onDelete={() => deletePolicy.mutate(policy.id)}
                onToggle={(active) =>
                  updatePolicy.mutate({ id: policy.id, data: { active } })
                }
              />
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Settings className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No policies configured</h3>
                <p className="text-muted-foreground mb-4">
                  Create policies to customize how findings are handled
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Policy
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Edit Dialog */}
        {editingPolicy && (
          <Dialog open={!!editingPolicy} onOpenChange={() => setEditingPolicy(null)}>
            <DialogContent className="max-w-2xl">
              <PolicyForm
                initialData={editingPolicy}
                onSubmit={(data) =>
                  updatePolicy.mutate({ id: editingPolicy.id, data })
                }
                onCancel={() => setEditingPolicy(null)}
                isPending={updatePolicy.isPending}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}

interface PolicyCardProps {
  policy: Policy;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (active: boolean) => void;
}

function PolicyCard({ policy, onEdit, onDelete, onToggle }: PolicyCardProps) {
  const actionIcons = {
    block: <Ban className="w-3 h-3" />,
    warn: <AlertTriangle className="w-3 h-3" />,
    ignore: <Eye className="w-3 h-3" />,
  };

  const actionColors = {
    block: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    warn: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    ignore: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
  };

  return (
    <Card className={!policy.active ? 'opacity-60' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {policy.name}
            </CardTitle>
            {policy.description && (
              <CardDescription>{policy.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={policy.active} onCheckedChange={onToggle} />
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {policy.rules.map((rule) => (
            <Badge
              key={rule.ruleId}
              variant="outline"
              className={`flex items-center gap-1 ${actionColors[rule.action]}`}
            >
              {actionIcons[rule.action]}
              {rule.ruleId}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface PolicyFormProps {
  initialData?: Policy;
  onSubmit: (data: Omit<Policy, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  isPending: boolean;
}

function PolicyForm({ initialData, onSubmit, onCancel, isPending }: PolicyFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [rules, setRules] = useState<PolicyRule[]>(initialData?.rules || []);
  const [active, setActive] = useState(initialData?.active ?? true);

  const handleAddRule = (ruleId: string, action: 'block' | 'warn' | 'ignore') => {
    if (rules.some((r) => r.ruleId === ruleId)) return;
    setRules([...rules, { ruleId, action }]);
  };

  const handleRemoveRule = (ruleId: string) => {
    setRules(rules.filter((r) => r.ruleId !== ruleId));
  };

  const handleSubmit = () => {
    onSubmit({ name, description, rules, active });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{initialData ? 'Edit Policy' : 'Create Policy'}</DialogTitle>
        <DialogDescription>
          Configure rules to customize how specific findings are handled
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">Policy Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Strict Security Policy"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose of this policy"
          />
        </div>

        <div className="space-y-2">
          <Label>Rules</Label>
          <div className="border rounded-md p-4 space-y-3 max-h-64 overflow-y-auto">
            {AVAILABLE_RULES.map((rule) => {
              const existingRule = rules.find((r) => r.ruleId === rule.id);
              return (
                <div
                  key={rule.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <p className="font-medium">{rule.id}</p>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                  </div>
                  {existingRule ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={existingRule.action}
                        onValueChange={(v) => {
                          setRules(
                            rules.map((r) =>
                              r.ruleId === rule.id
                                ? { ...r, action: v as PolicyRule['action'] }
                                : r
                            )
                          );
                        }}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="block">Block</SelectItem>
                          <SelectItem value="warn">Warn</SelectItem>
                          <SelectItem value="ignore">Ignore</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRemoveRule(rule.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddRule(rule.id, 'warn')}
                    >
                      Add Rule
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="active" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="active">Policy Active</Label>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!name || isPending}>
          {isPending ? 'Saving...' : initialData ? 'Update Policy' : 'Create Policy'}
        </Button>
      </DialogFooter>
    </>
  );
}
