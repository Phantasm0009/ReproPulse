'use client';

import { cn, getScoreColor, getScoreLabel } from '@/lib/utils';

interface ScoreGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function ScoreGauge({ score, size = 'md', showLabel = true, className }: ScoreGaugeProps) {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  };

  const textSizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const labelSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getStrokeColor = () => {
    if (score >= 90) return '#16a34a'; // green-600
    if (score >= 75) return '#22c55e'; // green-500
    if (score >= 50) return '#eab308'; // yellow-500
    if (score >= 25) return '#f97316'; // orange-500
    return '#ef4444'; // red-500
  };

  return (
    <div className={cn('relative inline-flex items-center justify-center', sizeClasses[size], className)}>
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={getStrokeColor()}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-bold', textSizeClasses[size])}>{score}</span>
        {showLabel && (
          <span className={cn('text-muted-foreground', labelSizeClasses[size])}>
            {getScoreLabel(score)}
          </span>
        )}
      </div>
    </div>
  );
}

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  return (
    <span className={cn('score-badge', getScoreColor(score), className)}>
      {score}
    </span>
  );
}
