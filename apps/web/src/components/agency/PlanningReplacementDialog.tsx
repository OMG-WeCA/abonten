'use client';
import { useEffect, useRef } from 'react';
export function PlanningReplacementDialog({
  locale,
  onContinue,
  onCancel,
}: {
  locale: 'en' | 'fr';
  onContinue: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  useEffect(() => {
    const old = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (old instanceof HTMLElement && old.isConnected) old.focus();
    };
  }, []);
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
          'This tab has unsaved changes or an unconfirmed save. Continuing replaces its settings and shortlist, removes the attached brief and clears chat. Keeping your work lets you resume it later. Saved account plans remain available.',
          'Cet onglet contient des changements non enregistrés ou un enregistrement à vérifier. Continuer remplace ses paramètres et sa sélection, retire le document joint et efface la conversation. Conserver votre travail permet de le reprendre ensuite. Vos plans enregistrés restent disponibles.',
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
