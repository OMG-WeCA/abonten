'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../components/auth/AuthProvider';
import { microsoftSessionFromHash } from '../../../../lib/microsoft-session';

export default function MicrosoftCallbackPage() {
  const router = useRouter();
  const { startSession } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const session = microsoftSessionFromHash(window.location.hash);
    // Remove fragments immediately so no token remains in browser history.
    window.history.replaceState({}, document.title, window.location.pathname);
    if (!session) {
      setError('Microsoft sign-in did not return a usable session. Try an email code instead.');
      return;
    }
    void startSession(session)
      .then(() => router.replace('/dashboard'))
      .catch(() => setError('We could not finish Microsoft sign-in. Try an email code instead.'));
  }, [router, startSession]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
      <div className="max-w-sm">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-primary text-lg font-black text-white">
          A
        </span>
        <h1 className="mt-5 text-2xl font-bold">Finishing sign-in</h1>
        <p
          role={error ? 'alert' : undefined}
          className={`mt-3 text-sm leading-6 ${error ? 'text-error' : 'text-muted'}`}
        >
          {error || 'Checking your Microsoft account…'}
        </p>
      </div>
    </div>
  );
}
