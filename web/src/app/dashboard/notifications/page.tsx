'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Bell, Plus, Trash2, Edit2, Slack, MessageCircle, Mail } from 'lucide-react';
import { api, type NotificationConfig } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

const EVENT_OPTIONS = [
  { id: 'analysis_complete', label: 'Analysis Complete' },
  { id: 'score_drop', label: 'Score Drop' },
  { id: 'critical_finding', label: 'Critical Finding' },
  { id: 'fix_applied', label: 'Fix Applied' },
  { id: 'fix_failed', label: 'Fix Failed' },
  { id: 'policy_violation', label: 'Policy Violation' },
];

const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low', 'info'];

export default function NotificationsPage() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installation');
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<NotificationConfig | null>(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.getCurrentUser,
  });

  const { data: configs, isLoading } = useQuery({
    queryKey: ['notifications', installationId],
    queryFn: () => api.getNotificationConfigs(installationId!),
    enabled: !!installationId,
  });

  const createConfig = useMutation({
    mutationFn: (data: Omit<NotificationConfig, 'id'>) =>
      api.createNotificationConfig(installationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setIsCreateOpen(false);
    },
  });

  const updateConfig = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NotificationConfig> }) =>
      api.updateNotificationConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setEditingConfig(null);
    },
  });

  const deleteConfig = useMutation({
    mutationFn: (id: string) => api.deleteNotificationConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'slack':
        return <Slack className="w-5 h-5" />;
      case 'discord':
        return <MessageCircle className="w-5 h-5" />;
      case 'email':
        return <Mail className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  return (
    <DashboardLayout user={user?.user} installationId={installationId || undefined}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">
              Configure alerts for security events
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <NotificationForm
                onSubmit={(data) => createConfig.mutate(data)}
                onCancel={() => setIsCreateOpen(false)}
                isPending={createConfig.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Notification Configs */}
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))
          ) : configs && configs.length > 0 ? (
            configs.map((config) => (
              <Card key={config.id} className={!config.active ? 'opacity-60' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getTypeIcon(config.type)}
                      <div>
                        <CardTitle className="capitalize">{config.type}</CardTitle>
                        <CardDescription>
                          {config.type === 'slack' || config.type === 'discord'
                            ? config.webhookUrl?.slice(0, 50) + '...'
                            : config.channelId}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.active}
                        onCheckedChange={(active) =>
                          updateConfig.mutate({ id: config.id, data: { active } })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingConfig(config)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteConfig.mutate(config.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {config.events.map((event) => (
                      <Badge key={event} variant="secondary">
                        {event.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Min severity: <span className="capitalize">{config.minSeverity}</span>
                  </p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No notifications configured</h3>
                <p className="text-muted-foreground mb-4">
                  Set up Slack, Discord, or email notifications
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Integration
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Edit Dialog */}
        {editingConfig && (
          <Dialog open={!!editingConfig} onOpenChange={() => setEditingConfig(null)}>
            <DialogContent className="max-w-lg">
              <NotificationForm
                initialData={editingConfig}
                onSubmit={(data) =>
                  updateConfig.mutate({ id: editingConfig.id, data })
                }
                onCancel={() => setEditingConfig(null)}
                isPending={updateConfig.isPending}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}

interface NotificationFormProps {
  initialData?: NotificationConfig;
  onSubmit: (data: Omit<NotificationConfig, 'id'>) => void;
  onCancel: () => void;
  isPending: boolean;
}

function NotificationForm({ initialData, onSubmit, onCancel, isPending }: NotificationFormProps) {
  const [type, setType] = useState(initialData?.type || 'slack');
  const [webhookUrl, setWebhookUrl] = useState(initialData?.webhookUrl || '');
  const [channelId, setChannelId] = useState(initialData?.channelId || '');
  const [events, setEvents] = useState<string[]>(initialData?.events || ['critical_finding']);
  const [minSeverity, setMinSeverity] = useState(initialData?.minSeverity || 'high');
  const [active, setActive] = useState(initialData?.active ?? true);

  const toggleEvent = (eventId: string) => {
    setEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    );
  };

  const handleSubmit = () => {
    onSubmit({
      type,
      webhookUrl: type !== 'email' ? webhookUrl : undefined,
      channelId: type === 'email' ? channelId : undefined,
      events,
      minSeverity,
      active,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{initialData ? 'Edit Integration' : 'Add Integration'}</DialogTitle>
        <DialogDescription>
          Configure notification settings for security events
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Integration Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slack">Slack</SelectItem>
              <SelectItem value="discord">Discord</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type !== 'email' ? (
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={`https://hooks.${type}.com/...`}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="channelId">Email Address</Label>
            <Input
              id="channelId"
              type="email"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="security@example.com"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Events</Label>
          <div className="grid grid-cols-2 gap-2">
            {EVENT_OPTIONS.map((event) => (
              <div key={event.id} className="flex items-center space-x-2">
                <Checkbox
                  id={event.id}
                  checked={events.includes(event.id)}
                  onCheckedChange={() => toggleEvent(event.id)}
                />
                <Label htmlFor={event.id} className="text-sm font-normal">
                  {event.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Minimum Severity</Label>
          <Select value={minSeverity} onValueChange={setMinSeverity}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map((sev) => (
                <SelectItem key={sev} value={sev} className="capitalize">
                  {sev}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="active" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="active">Active</Label>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={(!webhookUrl && !channelId) || events.length === 0 || isPending}
        >
          {isPending ? 'Saving...' : initialData ? 'Update' : 'Add Integration'}
        </Button>
      </DialogFooter>
    </>
  );
}
