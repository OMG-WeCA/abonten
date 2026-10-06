'use client';

import { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { displayUiText } from '../../lib/display-ui-text';

export function PlanningDraftDialog({
  name,
  onName,
  onSubmit,
  onClose,
  busy,
  error,
  conflict,
  onSaveAsNew,
  onOpenLatest,
  locale,
  replayPending,
}: {
  name: string;
  onName: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  conflict: boolean;
  onSaveAsNew: () => void;
  onOpenLatest: () => void;
  locale: 'en' | 'fr';
  replayPending: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="agency-save-dialog"
      aria-labelledby="save-plan-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !conflict) onSubmit();
        }}
      >
        <header>
          <h2 id="save-plan-title">
            {t('Save planning draft', 'Enregistrer le brouillon de plan')}
          </h2>
          <button
            type="button"
            className="agency-icon-button"
            disabled={busy}
            onClick={onClose}
            aria-label={t('Close save dialog', 'Fermer l’enregistrement')}
          >
            <X size={18} />
          </button>
        </header>
        <label className="agency-field">
          <span>{t('Plan name', 'Nom du plan')}</span>
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(event) => onName(event.target.value)}
            disabled={busy || replayPending}
          />
        </label>
        {replayPending && (
          <p role="status">
            {t(
              'The last save may have completed. Retry that same save first; your current edits stay in this tab.',
              'Le dernier enregistrement a peut-être abouti. Réessayez d’abord ce même enregistrement ; vos changements actuels restent dans cet onglet.',
            )}
          </p>
        )}
        <p>
          {t(
            'Save dates, budget, filters and selected faces for your own use in this agency. Documents, chat and sharing permissions are not saved.',
            'Enregistrez les dates, le budget, les filtres et les faces pour les retrouver dans cette agence. Ce brouillon vous est personnel et ne contient ni document, ni conversation, ni autorisation de partage.',
          )}
        </p>
        <p>
          {t(
            'Prices and availability are checked again when you resume. Saving does not reserve boards.',
            'Les prix et la disponibilité sont revérifiés à la reprise. L’enregistrement ne réserve aucun panneau.',
          )}
        </p>
        {error && (
          <p role="alert" className="agency-save-error">
            {displayUiText(error, locale)}
          </p>
        )}
        {conflict && (
          <div className="agency-save-conflict" role="alert">
            <p>
              {t(
                'This plan changed elsewhere. Your edits remain here. Save a separate copy, or open the latest saved version.',
                'Ce plan a été modifié ailleurs. Vos changements restent ici. Enregistrez une copie séparée ou ouvrez la dernière version enregistrée.',
              )}
            </p>
            <button
              type="button"
              className="agency-secondary-button"
              onClick={onSaveAsNew}
              disabled={busy}
            >
              {t('Save as a new plan', 'Enregistrer un nouveau plan')}
            </button>
            <button
              type="button"
              className="agency-secondary-button"
              onClick={onOpenLatest}
              disabled={busy}
            >
              {t('Open latest saved version', 'Ouvrir la dernière version')}
            </button>
          </div>
        )}
        <footer>
          <button
            type="button"
            className="agency-secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            {t('Cancel', 'Annuler')}
          </button>
          <button
            className="agency-save-primary"
            type="submit"
            disabled={busy || conflict || !name.trim()}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('Saving…', 'Enregistrement…')}
              </>
            ) : (
              t('Save plan', 'Enregistrer le plan')
            )}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
