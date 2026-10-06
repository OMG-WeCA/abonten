'use client';
import { useAgencyDialog } from './useAgencyDialog';
export function PlanningReplacementDialog({
  locale,
  onContinue,
  onCancel,
}: {
  locale: 'en' | 'fr';
  onContinue: () => void;
  onCancel: () => void;
}) {
  const dialog = useAgencyDialog();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  return (
    <dialog
      ref={dialog}
      className="agency-save-dialog"
      aria-labelledby="replace-plan-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="replace-plan-title">
        {t('Replace this tab’s draft?', 'Remplacer le brouillon de cet onglet ?')}
      </h2>
      <p>
        {t(
          'Replaces this tab’s unsaved draft or unconfirmed save, and clears its brief and chat. Saved account plans remain available.',
          'Remplace le brouillon non enregistré ou l’enregistrement non confirmé de cet onglet et efface son document et sa conversation. Les plans enregistrés restent disponibles.',
        )}
      </p>
      <footer>
        <button autoFocus className="agency-secondary-button" onClick={onCancel}>
          {t('Keep current work', 'Conserver le travail actuel')}
        </button>
        <button className="agency-save-primary" onClick={onContinue}>
          {t('Continue and replace tab draft', 'Continuer et remplacer le brouillon')}
        </button>
      </footer>
    </dialog>
  );
}
