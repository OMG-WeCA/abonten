'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '../../components/LocaleProvider';
import { ArrowLeft } from 'lucide-react';
import { PartnerTermsDocument } from '../../components/terms/PartnerTermsDocument';
import {
  getTermsCopy,
  loadPartnerTerms,
  type PartnerTermsDocument as Document,
} from '../../lib/partner-terms';

export default function PartnerTermsPage() {
  const router = useRouter();
  const { locale: preferredLocale } = useLocale();
  const [locale, setLocale] = useState<'en' | 'fr'>('en');
  const [document, setDocument] = useState<Document | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const copy = getTermsCopy(locale);
  useEffect(() => {
    setLocale(preferredLocale);
  }, [preferredLocale]);
  useEffect(() => {
    const controller = new AbortController();
    setDocument(null);
    setFailed(false);
    loadPartnerTerms(locale, controller.signal)
      .then(setDocument)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [locale, retry]);
  return (
    <main
      lang={locale}
      className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12"
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
            className="flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.back}
          </button>
          <label className="text-sm font-semibold">
            <span className="sr-only">Language / Langue</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as 'en' | 'fr')}
              className="min-h-11 rounded-lg border border-border bg-surface-2 px-3"
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
        </div>
        {document ? (
          <PartnerTermsDocument document={document} />
        ) : failed ? (
          <div role="alert" className="rounded-xl border border-border bg-surface p-5">
            <p>{copy.readerLoadError}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-3 rounded-lg bg-primary px-4 py-3 font-semibold text-white"
            >
              {copy.retry}
            </button>
          </div>
        ) : (
          <p role="status">{copy.loading}</p>
        )}
      </div>
    </main>
  );
}
