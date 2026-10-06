'use client';

import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, LanguageSwitcher } from '../../components/LocaleProvider';
import { authCopy } from '../../lib/auth-copy';
import { useAuth } from '../../components/auth/AuthProvider';
import { ApiError, apiUrl, publicJson, type StoredSession } from '../../lib/api';

type SignInStage = 'email' | 'code';

export default function SignInPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const copy = authCopy[locale];
  const { profile, ready, startSession } = useAuth();
  const [stage, setStage] = useState<SignInStage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready && profile) router.replace('/dashboard');
  }, [profile, ready, router]);

  useEffect(() => {
    void publicJson<{
      emailCodeEnabled: boolean;
      microsoftEnabled: boolean;
      microsoftUnavailableReason?: string;
    }>('/api/auth/config')
      .then((config) => {
        setMicrosoftEnabled(config.microsoftEnabled);
      })
      .catch(() => setMicrosoftEnabled(false));
  }, []);

  useEffect(() => {
    if (stage === 'code') codeRef.current?.focus();
  }, [stage]);

  const sendCode = async () => {
    setLoading(true);
    setMessage('');
    try {
      await publicJson('/api/auth/email-code/request', { email, locale });
      setStage('code');
    } catch (error) {
      setMessage(errorMessage(error, locale));
    } finally {
      setLoading(false);
    }
  };

  const requestCode = (event: FormEvent) => {
    event.preventDefault();
    void sendCode();
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const session = await publicJson<StoredSession>('/api/auth/email-code/verify', {
        email,
        code,
        locale,
      });
      await startSession(session);
      router.replace('/dashboard');
    } catch (error) {
      setMessage(errorMessage(error, locale, true));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-5 text-foreground sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--color-primary)_30%,transparent),transparent_38%),linear-gradient(120deg,color-mix(in_oklab,var(--color-surface)_94%,transparent),transparent)] lg:block" />
      <div className="relative mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-2xl shadow-black/20 lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-foreground"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-base font-black text-white">
                A
              </span>
              Abonten
            </Link>
            <div className="mt-28 max-w-lg">
              <p className="text-sm font-semibold text-foreground">{copy.access}</p>
              <h1 className="mt-5 text-5xl font-extrabold tracking-[-0.055em] text-balance">
                {copy.hero}
              </h1>
              <p className="mt-6 max-w-md text-lg leading-8 text-muted">{copy.intro}</p>
            </div>
          </div>
          <div className="relative border-l-2 border-primary pl-5 text-sm leading-6 text-muted">
            {copy.expiry}
          </div>
          <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full border-[28px] border-primary/15" />
        </section>

        <section className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
          <div className="mb-5 flex justify-end">
            <LanguageSwitcher />
          </div>
          <div className="mb-12 flex items-center justify-between lg:hidden">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-foreground"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-base font-black text-white">
                A
              </span>
              Abonten
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-muted transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
            >
              {copy.about}
            </Link>
          </div>

          {stage === 'email' ? (
            <div className="mx-auto w-full max-w-sm">
              <div className="mb-8">
                <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="text-3xl font-bold tracking-[-0.04em]">{copy.heading}</h2>
                <p className="mt-3 leading-6 text-muted">{copy.codeIntro}</p>
              </div>
              <form onSubmit={requestCode} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-semibold text-foreground"
                  >
                    {copy.email}
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    placeholder={copy.placeholder}
                    className="h-12 w-full rounded-lg border border-border bg-background px-3.5 text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {message && <FormMessage message={message} />}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 disabled:cursor-wait disabled:opacity-70"
                >
                  {loading ? copy.sending : copy.send}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
              {microsoftEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = apiUrl('/api/auth/microsoft');
                  }}
                  className="mt-4 flex h-11 w-full items-center justify-center rounded-lg border border-border text-sm font-semibold text-foreground transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
                >
                  {copy.microsoft}
                </button>
              ) : (
                <p className="mt-5 text-sm leading-6 text-muted">{copy.unavailable}</p>
              )}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-sm">
              <button
                type="button"
                onClick={() => {
                  setStage('email');
                  setCode('');
                  setMessage('');
                }}
                className="mb-8 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
              >
                <ArrowLeft className="h-4 w-4" /> {copy.different}
              </button>
              <div className="mb-8">
                <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <KeyRound className="h-5 w-5" />
                </div>
                <h2 className="text-3xl font-bold tracking-[-0.04em]">{copy.inbox}</h2>
                <p className="mt-3 leading-6 text-muted">
                  {copy.sent} <span className="font-semibold text-foreground">{email}</span>.
                </p>
              </div>
              <form onSubmit={verifyCode} className="space-y-5">
                <div>
                  <label
                    htmlFor="code"
                    className="mb-2 block text-sm font-semibold text-foreground"
                  >
                    {copy.code}
                  </label>
                  <input
                    ref={codeRef}
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    required
                    placeholder="000000"
                    className="h-14 w-full rounded-lg border border-border bg-background px-3.5 font-mono text-xl tracking-[0.35em] text-foreground outline-none transition placeholder:tracking-[0.2em] placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {message && <FormMessage message={message} />}
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {loading ? copy.checking : copy.continue}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
              <button
                type="button"
                disabled={loading}
                onClick={() => void sendCode()}
                className="mt-5 min-h-10 rounded-lg px-1 text-sm font-semibold text-foreground transition hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 disabled:opacity-60"
              >
                {copy.resend}
              </button>
            </div>
          )}
          <div className="mx-auto mt-10 flex max-w-sm items-start gap-3 text-xs leading-5 text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p>{copy.context}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function FormMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-error/10 px-3 py-2.5 text-sm leading-5 text-error"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}

function errorMessage(error: unknown, locale: 'en' | 'fr', verification = false): string {
  const copy = authCopy[locale];
  if (!(error instanceof ApiError)) return copy.generic;
  if (error.status === 401) return copy.invalid;
  if (error.status === 429) return verification ? copy.verifyLimit : copy.requestLimit;
  if (error.status === 503) return copy.authUnavailable;
  return copy.generic;
}
