'use client';

import { useAgencyDialog } from './useAgencyDialog';
import { X } from 'lucide-react';

/** Information only: opening or closing this dialog never changes brief-sharing permission. */
export function PlannerDataUseDialog({
  locale,
  connected,
  onClose,
}: {
  locale: 'en' | 'fr';
  connected: boolean;
  onClose: () => void;
}) {
  const dialog = useAgencyDialog();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  return (
    <dialog
      ref={dialog}
      className="agency-save-dialog"
      aria-labelledby="planner-data-use-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="planner-data-use-title">{t('Data use', 'Utilisation des données')}</h2>
        <button
          type="button"
          className="agency-icon-button"
          autoFocus
          onClick={onClose}
          aria-label={t('Close data use', 'Fermer l’utilisation des données')}
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      {!connected && (
        <p>{t('AI chat is not connected.', 'La conversation IA n’est pas connectée.')}</p>
      )}
      <p>
        {t(
          'When AI chat is connected, sending a message shares your messages and planning context with OpenAI.',
          'Lorsque la conversation IA est connectée, vos messages et le contexte du plan sont envoyés à OpenAI à chaque envoi.',
        )}
      </p>
      <p>
        {t(
          'Abonten extracts brief text. Brief text is sent to OpenAI only after you confirm and authorize it; the original file is not sent. Editing or removing the brief clears permission and chat.',
          'Abonten extrait le texte du document. Son texte est envoyé à OpenAI uniquement après votre confirmation et votre autorisation ; le fichier original n’est pas envoyé. Modifier ou retirer le document efface l’autorisation et la conversation.',
        )}
      </p>
      <p>
        {t(
          'Saved plans do not include documents, chat or sharing permission.',
          'Les plans enregistrés ne contiennent ni documents, ni conversation, ni autorisation de partage.',
        )}
      </p>
    </dialog>
  );
}
