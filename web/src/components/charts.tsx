'use client';

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ScoreHistoryChartProps {
  data: Array<{
    date: string;
    score: number;
  }>;
}

export function ScoreHistoryChart({ data }: ScoreHistoryChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" className="text-xs" />
        <YAxis domain={[0, 100]} className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="#22c55e"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#scoreGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface FindingsByCategoryChartProps {
  data: Array<{
    category: string;
    count: number;
  }>;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

export function FindingsByCategoryChart({ data }: FindingsByCategoryChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
          outerRadius={100}
          fill="#8884d8"
          dataKey="count"
          nameKey="category"
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface FindingsBySeverityChartProps {
  data: Array<{
    severity: string;
    count: number;
  }>;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280',
};

export function FindingsBySeverityChart({ data }: FindingsBySeverityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" className="text-xs" />
        <YAxis dataKey="severity" type="category" className="text-xs" width={80} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={SEVERITY_COLORS[entry.severity.toLowerCase()] || '#6b7280'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface BenchmarkChartProps {
  data: Array<{
    percentile: number;
    score: number;
    repoCount: number;
  }>;
  currentScore?: number;
}

export function BenchmarkChart({ data, currentScore }: BenchmarkChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="percentile"
          className="text-xs"
          tickFormatter={(value) => `${value}%`}
        />
        <YAxis domain={[0, 100]} className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          formatter={(value: number) => [value, 'Score']}
          labelFormatter={(label) => `${label}th Percentile`}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="#3b82f6"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#benchmarkGradient)"
        />
        {currentScore !== undefined && (
          <Line
            type="monotone"
            data={[
              { percentile: 0, currentScore },
              { percentile: 100, currentScore },
            ]}
            dataKey="currentScore"
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface FixTrendChartProps {
  data: Array<{
    date: string;
    applied: number;
    pending: number;
    failed: number;
  }>;
}

export function FixTrendChart({ data }: FixTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" className="text-xs" />
        <YAxis className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Legend />
        <Bar dataKey="applied" stackId="a" fill="#22c55e" name="Applied" />
        <Bar dataKey="pending" stackId="a" fill="#eab308" name="Pending" />
        <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
      </BarChart>
    </ResponsiveContainer>
  );
}
