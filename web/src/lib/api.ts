const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }

  return response.json();
}

// Types
export interface Installation {
  id: number;
  installationId: number;
  accountLogin: string;
  accountType: string;
  avatarUrl?: string;
  createdAt: string;
  repositories: Repository[];
}

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  latestScore?: number;
  latestPercentile?: number;
  analysisCount: number;
  lastAnalyzedAt?: string;
}

export interface Analysis {
  id: string;
  sha: string;
  ref?: string;
  prNumber?: number;
  score: number;
  percentile?: number;
  breakdown?: AnalysisBreakdown;
  // Direct score fields from database
  overallScore?: number;
  workflowScore?: number;
  supplyChainScore?: number;
  maintainabilityScore?: number;
  hygieneScore?: number;
  status: string;
  checkRunId?: string;
  createdAt: string;
  completedAt?: string;
  repository?: Repository;
  findings?: Finding[];
}

export interface AnalysisBreakdown {
  workflowSecurity: number;
  supplyChain: number;
  maintainability: number;
  hygiene: number;
}

export interface Finding {
  id: string;
  ruleId: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  filePath?: string;
  line?: number;
  fixType?: string;
  status: string;
  introducedInPr: boolean;
  createdAt: string;
}

export interface FixRun {
  id: string;
  fixType: string;
  status: string;
  commitSha?: string;
  prNumber?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Policy {
  id: string;
  name: string;
  description?: string;
  rules: PolicyRule[];
  active: boolean;
  createdAt: string;
}

export interface PolicyRule {
  ruleId: string;
  action: 'block' | 'warn' | 'ignore';
  severity?: string;
}

export interface NotificationConfig {
  id: string;
  type: string;
  webhookUrl?: string;
  channelId?: string;
  events: string[];
  minSeverity: string;
  active: boolean;
}

export interface SecurityChampion {
  id: string;
  githubLogin: string;
  name?: string;
  avatarUrl?: string;
  active: boolean;
}

export interface Benchmark {
  percentile: number;
  score: number;
  repoCount: number;
  calculatedAt: string;
}

export interface DashboardStats {
  totalRepositories: number;
  averageScore: number;
  totalFindings: number;
  criticalFindings: number;
  recentAnalyses: number;
  fixesApplied: number;
}

// API Functions
export const api = {
  // Installations
  getInstallations: () => request<Installation[]>('/api/installations'),
  getInstallation: (id: string) => request<Installation>(`/api/installations/${id}`),

  // Repositories
  getRepositories: (installationId: string) =>
    request<Repository[]>(`/api/installations/${installationId}/repositories`),
  getRepository: (id: string) => request<Repository>(`/api/repositories/${id}`),

  // Analyses
  getAnalyses: (repoId: string, options?: { page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    return request<{ analyses: Analysis[]; total: number }>(
      `/api/repositories/${repoId}/analyses?${params}`
    );
  },
  getAnalysis: (id: string) => request<Analysis>(`/api/analyses/${id}`),
  triggerAnalysis: (repoId: string, sha?: string) =>
    request<{ jobId: string }>(`/api/repositories/${repoId}/analyze`, {
      method: 'POST',
      body: { sha },
    }),

  // Findings
  getFindings: (repoId: string, options?: { status?: string; severity?: string }) => {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.severity) params.set('severity', options.severity);
    return request<Finding[]>(`/api/repositories/${repoId}/findings?${params}`);
  },
  updateFinding: (id: string, data: { status?: string }) =>
    request<Finding>(`/api/findings/${id}`, { method: 'PATCH', body: data }),
  triggerFix: (findingId: string) =>
    request<{ jobId: string }>(`/api/findings/${findingId}/fix`, { method: 'POST' }),

  // Fix Runs
  getFixRuns: (repoId: string) => request<FixRun[]>(`/api/repositories/${repoId}/fixes`),

  // Policies
  getPolicies: (installationId: string) =>
    request<Policy[]>(`/api/installations/${installationId}/policies`),
  createPolicy: (installationId: string, data: Omit<Policy, 'id' | 'createdAt'>) =>
    request<Policy>(`/api/installations/${installationId}/policies`, {
      method: 'POST',
      body: data,
    }),
  updatePolicy: (id: string, data: Partial<Policy>) =>
    request<Policy>(`/api/policies/${id}`, { method: 'PATCH', body: data }),
  deletePolicy: (id: string) => request<void>(`/api/policies/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotificationConfigs: (installationId: string) =>
    request<NotificationConfig[]>(`/api/installations/${installationId}/notifications`),
  createNotificationConfig: (installationId: string, data: Omit<NotificationConfig, 'id'>) =>
    request<NotificationConfig>(`/api/installations/${installationId}/notifications`, {
      method: 'POST',
      body: data,
    }),
  updateNotificationConfig: (id: string, data: Partial<NotificationConfig>) =>
    request<NotificationConfig>(`/api/notifications/${id}`, { method: 'PATCH', body: data }),
  deleteNotificationConfig: (id: string) =>
    request<void>(`/api/notifications/${id}`, { method: 'DELETE' }),

  // Security Champions
  getSecurityChampions: (installationId: string) =>
    request<SecurityChampion[]>(`/api/installations/${installationId}/champions`),
  addSecurityChampion: (installationId: string, data: { githubLogin: string }) =>
    request<SecurityChampion>(`/api/installations/${installationId}/champions`, {
      method: 'POST',
      body: data,
    }),
  removeSecurityChampion: (id: string) =>
    request<void>(`/api/champions/${id}`, { method: 'DELETE' }),

  // Benchmarks
  getBenchmarks: () => request<Benchmark[]>('/api/benchmarks'),

  // Dashboard
  getDashboardStats: (installationId: string) =>
    request<DashboardStats>(`/api/installations/${installationId}/stats`),

  // Auth
  getCurrentUser: () => request<{ user: { login: string; avatarUrl: string } | null }>('/api/auth/me'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
};
