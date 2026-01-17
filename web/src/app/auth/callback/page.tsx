'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const installationId = searchParams.get('installation_id');

    if (sessionId) {
      // Store session ID in localStorage
      localStorage.setItem('session_id', sessionId);
      
      if (installationId) {
        localStorage.setItem('installation_id', installationId);
      }

      // Redirect to dashboard
      router.push('/dashboard');
    } else {
      // No session ID, redirect to error
      router.push('/auth/error?message=No session provided');
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
        <h1 className="text-2xl font-bold mb-2">Signing you in...</h1>
        <p className="text-muted-foreground">Please wait while we complete authentication.</p>
      </div>
    </div>
  );
}
