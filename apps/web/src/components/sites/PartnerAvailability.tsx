'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Trash2 } from 'lucide-react';
import { ApiError } from '../../lib/api';
import {
  addFaceBlackout,
  listFaceBlackouts,
  removeFaceBlackout,
  type FaceBlackout,
  type SiteFace,
} from '../../lib/sites-api';
import { getSitesCopy, type SiteLocale } from '../../lib/sites-locale';
import { Field, inputClass, SectionCard } from './sites-ui';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const date = new Date();
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

export function PartnerAvailability({
  orgId,
  faces,
  editable,
  locale,
}: {
  orgId: string | undefined;
  faces: SiteFace[];
  editable: boolean;
  locale: SiteLocale | undefined;
}) {
  const copy = getSitesCopy(locale);
  const [faceId, setFaceId] = useState(faces[0]?.id ?? '');
  const selectedFaceRef = useRef(faceId);
  const [month, setMonth] = useState(monthStart);
  const [blackouts, setBlackouts] = useState<FaceBlackout[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!faces.some((face) => face.id === faceId)) {
      const next = faces[0]?.id ?? '';
      selectedFaceRef.current = next;
      setFaceId(next);
    }
  }, [faces, faceId]);

  const reload = async (id: string) => {
    if (!orgId || !id) return;
    const rows = await listFaceBlackouts(orgId, id);
    if (selectedFaceRef.current === id) setBlackouts(rows);
  };
  useEffect(() => {
    if (!orgId || !faceId) return;
    let cancelled = false;
    setBlackouts(null);
    setError('');
    void listFaceBlackouts(orgId, faceId)
      .then((rows) => { if (!cancelled) setBlackouts(rows); })
      .catch(() => { if (!cancelled) setError(copy.detail.availabilityError); });
    return () => { cancelled = true; };
  }, [orgId, faceId, copy.detail.availabilityError]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!orgId || !faceId || busy) return;
    if (!startDate || !endDate || endDate <= startDate) {
      setError(copy.detail.availabilityWindowError);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await addFaceBlackout(orgId, faceId, { startDate, endDate, reason: reason.trim() });
      await reload(faceId);
      setEndDate('');
      setReason('');
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status < 500 ? failure.message : copy.detail.availabilityError);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!orgId || !window.confirm(copy.detail.availabilityRemoveConfirm) || busy) return;
    setBusy(true);
    setError('');
    try {
      await removeFaceBlackout(orgId, id);
      await reload(faceId);
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status < 500 ? failure.message : copy.detail.availabilityError);
    } finally {
      setBusy(false);
    }
  };

  const first = new Date(month);
  const year = first.getUTCFullYear();
  const monthIndex = first.getUTCMonth();
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const language = locale === 'fr' ? 'fr-FR' : 'en-GB';
  const monthLabel = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + index)))
  );
  const prettyDate = (date: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(date + 'T00:00:00Z'));

  return (
    <SectionCard title={copy.detail.availability} className="lg:col-span-2">
      <p className="text-sm leading-6 text-muted">{copy.detail.availabilityIntro}</p>
      {faces.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{copy.detail.noFaces}</p>
      ) : (
        <>
          <div className="mt-4 max-w-xs">
            <Field label={copy.detail.availabilityFace} htmlFor="availabilityFace">
              <select id="availabilityFace" className={inputClass} value={faceId} disabled={busy}
                onChange={(event) => {
                  selectedFaceRef.current = event.target.value;
                  setFaceId(event.target.value);
                }}>
                {faces.map((face) => (
                  <option key={face.id} value={face.id}>{face.faceLabel}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="rounded-xl border border-border bg-surface-2 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold capitalize">
                  <CalendarDays className="h-4 w-4 text-primary" />{monthLabel}
                </h3>
                <div className="flex gap-1">
                  <button type="button" aria-label={copy.detail.availabilityPreviousMonth} onClick={() => setMonth(Date.UTC(year, monthIndex - 1, 1))}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-surface">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={copy.detail.availabilityNextMonth} onClick={() => setMonth(Date.UTC(year, monthIndex + 1, 1))}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-surface">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                {weekdays.map((day, index) => <span key={index} className="pb-1 text-xs font-semibold text-muted">{day}</span>)}
                {Array.from({ length: leading }, (_, index) => <span key={'empty-' + index} />)}
                {Array.from({ length: days }, (_, index) => {
                  const date = new Date(Date.UTC(year, monthIndex, index + 1)).toISOString().slice(0, 10);
                  const block = blackouts?.find((row) => row.startDate <= date && date < row.endDate);
                  const status = blackouts === null
                    ? error ? copy.detail.availabilityUnknown : copy.detail.availabilityLoading
                    : block ? copy.detail.availabilityBlocked : copy.detail.availabilityFree;
                  return <span key={date} title={block?.reason ?? status}
                    aria-label={date + ': ' + status}
                    className={'grid min-h-9 place-items-center rounded-lg text-xs font-semibold ' +
                      (blackouts === null ? 'text-muted/60' : block ? 'bg-warning/20 text-warning' : date === today() ? 'border border-primary text-primary' : 'text-foreground')}>
                    {index + 1}
                  </span>;
                })}
              </div>
              <p className="mt-3 text-xs text-muted">
                {blackouts === null ? (error ? copy.detail.availabilityUnknown : copy.detail.availabilityLoading) : (
                  <><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-warning/50" />{copy.detail.availabilityBlocked}</>
                )}
              </p>
            </div>
            <div>
              {editable && (
                <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
                  <Field label={copy.detail.availabilityStart} htmlFor="blackoutStart">
                    <input id="blackoutStart" type="date" min={today()} required className={inputClass}
                      value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                  </Field>
                  <Field label={copy.detail.availabilityEnd} htmlFor="blackoutEnd">
                    <input id="blackoutEnd" type="date" min={startDate || today()} required className={inputClass}
                      value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                  </Field>
                  <Field label={copy.detail.availabilityReason} htmlFor="blackoutReason" className="sm:col-span-2">
                    <input id="blackoutReason" required maxLength={240} className={inputClass}
                      value={reason} onChange={(event) => setReason(event.target.value)} />
                  </Field>
                  <button type="submit" disabled={busy || !reason.trim()} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50">
                    {copy.detail.availabilityAdd}
                  </button>
                </form>
              )}
              {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
              {blackouts && blackouts.length === 0 && <p className="mt-5 text-sm text-muted">{copy.detail.availabilityEmpty}</p>}
              {blackouts && blackouts.length > 0 && (
                <ul className="mt-5 space-y-2">
                  {blackouts.map((block) => (
                    <li key={block.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3 text-sm">
                      <div>
                        <p className="font-semibold">{prettyDate(block.startDate)} – {prettyDate(block.endDate)}</p>
                        <p className="mt-1 text-xs text-muted">{block.reason}</p>
                      </div>
                      {editable && <button type="button" disabled={busy} aria-label={copy.detail.availabilityRemove}
                        onClick={() => void remove(block.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-error">
                        <Trash2 className="h-4 w-4" />
                      </button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
