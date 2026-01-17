'use client';

import { useState, useEffect } from 'react';
import { formatRelativeTime } from '@/lib/utils';

interface RelativeTimeProps {
  date: string | Date;
  className?: string;
}

/**
 * Client-side only component to display relative time.
 * This prevents hydration mismatches since Date.now() differs
 * between server and client.
 */
export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Return a placeholder during SSR to prevent hydration mismatch
  if (!mounted) {
    return <span className={className}>...</span>;
  }

  return <span className={className}>{formatRelativeTime(date)}</span>;
}

/**
 * Client-side only component to display formatted date.
 * Prevents hydration mismatches with date formatting.
 */
export function FormattedDate({ date, className }: RelativeTimeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className={className}>...</span>;
  }

  return (
    <span className={className}>
      {new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}
    </span>
  );
}
