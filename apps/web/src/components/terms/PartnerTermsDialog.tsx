'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getTermsCopy, type PartnerTermsDocument as Document } from '../../lib/partner-terms';
import { PartnerTermsDocument } from './PartnerTermsDocument';

/** Native modal traps focus, supports Escape and restores focus without leaving onboarding. */
export function PartnerTermsDialog({
  open,
  document,
  onClose,
  closeLabel,
}: {
  open: boolean;
  document: Document;
  onClose: () => void;
  closeLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const effectClosures = useRef(0);
  const copy = getTermsCopy(document.locale);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
      const previousOverflow = window.document.body.style.overflow;
      window.document.body.style.overflow = 'hidden';
      return () => {
        window.document.body.style.overflow = previousOverflow;
        if (node.open) {
          effectClosures.current += 1;
          node.close();
        }
      };
    }
    if (node.open) {
      effectClosures.current += 1;
      node.close();
    }
  }, [open]);
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        dialog.current?.close();
      }}
      onClose={() => {
        if (effectClosures.current > 0) {
          effectClosures.current -= 1;
          return;
        }
        onClose();
      }}
      aria-label={copy.heading}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface-2 p-0 text-foreground shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
        <p className="font-bold">{copy.heading}</p>
        <button
          type="button"
          autoFocus
          onClick={() => dialog.current?.close()}
          className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
        >
          {closeLabel ?? copy.close}
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[calc(90dvh-5rem)] overflow-y-auto overscroll-contain p-5 sm:p-7">
        <PartnerTermsDocument document={document} />
      </div>
    </dialog>
  );
}
