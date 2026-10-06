'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '../../../../components/LocaleProvider';
import { authCopy } from '../../../../lib/auth-copy';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../components/auth/AuthProvider';
import { microsoftSessionFromHash } from '../../../../lib/microsoft-session';

export default function MicrosoftCallbackPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const copy = authCopy[locale];
  const { startSession } = useAuth();
  const [error, setError] = useState<'missing' | 'failed' | ''>('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const session = microsoftSessionFromHash(window.location.hash);
    // Remove fragments immediately so no token remains in browser history.
    window.history.replaceState({}, document.title, window.location.pathname);
    if (!session) {
      setError('missing');
      return;
    }
    void startSession(session)
      .then(() => router.replace('/dashboard'))
      .catch(() => setError('failed'));
  }, [router, startSession]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
      <div className="max-w-sm">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-primary text-lg font-black text-white">
          A
        </span>
        <h1 className="mt-5 text-2xl font-bold">{copy.callbackHeading}</h1>
        <p
          role={error ? 'alert' : undefined}
          className={`mt-3 text-sm leading-6 ${error ? 'text-error' : 'text-muted'}`}
        >
          {error === 'missing'
            ? copy.callbackMissing
            : error === 'failed'
              ? copy.callbackFailed
              : copy.callbackLoading}
        </p>
        {error && (
          <Link
            href="/sign-in"
            className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-bold text-white"
          >
            {copy.back}
          </Link>
        )}
      </div>
    </div>
  );
}
