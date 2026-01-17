'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message') || 'An unknown error occurred';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="mb-6">
          <div className="relative inline-block">
            <Shield className="w-16 h-16 text-muted-foreground" />
            <AlertTriangle className="w-8 h-8 text-destructive absolute -bottom-1 -right-1" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-2">Authentication Failed</h1>
        <p className="text-muted-foreground mb-6">{message}</p>
        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/">Go Home</Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/github`}>
              Try Again
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
