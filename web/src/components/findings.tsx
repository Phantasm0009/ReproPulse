'use client';

import { cn, getSeverityColor } from '@/lib/utils';
import { AlertTriangle, Info, AlertCircle, XCircle, Shield } from 'lucide-react';
import type { Finding } from '@/lib/api';

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const icons: Record<string, React.ReactNode> = {
    critical: <XCircle className="w-3 h-3" />,
    high: <AlertTriangle className="w-3 h-3" />,
    medium: <AlertCircle className="w-3 h-3" />,
    low: <Info className="w-3 h-3" />,
    info: <Info className="w-3 h-3" />,
  };

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', getSeverityColor(severity), className)}>
      {icons[severity.toLowerCase()]}
      {severity}
    </span>
  );
}

interface FindingCardProps {
  finding: Finding;
  onFix?: () => void;
  onDismiss?: () => void;
  showActions?: boolean;
}

export function FindingCard({ finding, onFix, onDismiss, showActions = true }: FindingCardProps) {
  return (
    <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <SeverityBadge severity={finding.severity} />
            {finding.introducedInPr && (
              <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 px-2 py-0.5 rounded-full">
                New in PR
              </span>
            )}
            <span className="text-xs text-muted-foreground">{finding.category}</span>
          </div>
          <h4 className="font-medium mb-1">{finding.title}</h4>
          <p className="text-sm text-muted-foreground mb-2">{finding.description}</p>
          {finding.filePath && (
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {finding.filePath}
              {finding.line && `:${finding.line}`}
            </code>
          )}
        </div>
        {showActions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {finding.fixType && finding.status === 'open' && onFix && (
              <button
                onClick={onFix}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
              >
                <Shield className="w-3 h-3" />
                Fix
              </button>
            )}
            {finding.status === 'open' && onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FindingsListProps {
  findings: Finding[];
  onFix?: (finding: Finding) => void;
  onDismiss?: (finding: Finding) => void;
}

export function FindingsList({ findings, onFix, onDismiss }: FindingsListProps) {
  const sortedFindings = [...findings].sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (
      (severityOrder[a.severity.toLowerCase() as keyof typeof severityOrder] || 5) -
      (severityOrder[b.severity.toLowerCase() as keyof typeof severityOrder] || 5)
    );
  });

  if (findings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No findings to display</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedFindings.map((finding) => (
        <FindingCard
          key={finding.id}
          finding={finding}
          onFix={onFix ? () => onFix(finding) : undefined}
          onDismiss={onDismiss ? () => onDismiss(finding) : undefined}
        />
      ))}
    </div>
  );
}
