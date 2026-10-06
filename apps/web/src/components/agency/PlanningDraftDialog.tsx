'use client';

import { useAgencyDialog } from './useAgencyDialog';
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
  const dialog = useAgencyDialog();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
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
              'Save unconfirmed. Retry the same save; your edits are kept.',
              'Enregistrement non confirmé. Réessayez le même enregistrement ; vos changements sont conservés.',
            )}
          </p>
        )}
        <p>
          {t(
            'Personal draft · no reservation. Rates and availability are rechecked on resume.',
            'Brouillon personnel · aucune réservation. Tarifs et disponibilités revérifiés à la reprise.',
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
