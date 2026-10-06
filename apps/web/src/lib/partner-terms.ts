import { apiJson } from './api';

export interface PartnerTermsDocument {
  version: string;
  publishedDate: string;
  locale: 'en' | 'fr';
  status: 'review_draft' | 'approved';
  translationStatus: 'source_draft' | 'translation_for_review' | 'approved';
  title: string;
  sections: Array<{ number: number; heading: string; paragraphs: string[] }>;
  digest: string;
  sourceEnglishDigest: string;
  acceptanceRequired: boolean;
  acceptanceMode: 'disabled' | 'preview' | 'approved';
}
export function loadPartnerTerms(locale: 'en' | 'fr', signal?: AbortSignal) {
  return apiJson<PartnerTermsDocument>(`/api/partner-terms/current?locale=${locale}`, {
    auth: false,
    signal,
    headers: { 'Accept-Language': locale },
  });
}
export function getTermsCopy(locale: 'en' | 'fr') {
  return locale === 'fr'
    ? {
        heading: 'Conditions des partenaires',
        read: 'Lire les conditions',
        close: 'Revenir au formulaire',
        draft: 'Projet pour révision',
        draftNotice:
          'Ce projet n’est pas en vigueur. Son accusé de lecture en prévisualisation ne crée pas d’acceptation juridiquement contraignante.',
        translationNotice:
          'Traduction française pour révision ; elle n’a pas fait l’objet d’une validation juridique. Aucune langue faisant foi n’a été désignée.',
        previewAccept:
          'Je confirme mon autorité pour représenter cette organisation et j’accuse lecture de cette version de révision pour tester la prévisualisation.',
        accept:
          'Je suis autorisé à représenter cette organisation et j’accepte expressément cette version des conditions des partenaires.',
        disabled: 'L’acceptation de ce projet n’est pas activée.',
        loading: 'Chargement des conditions…',
        readerLoadError: 'Impossible de charger les conditions. Réessayez.',
        loadError:
          'Impossible de charger les conditions. Vos informations saisies sont conservées.',
        retry: 'Réessayer',
        required: 'Consultez les conditions et confirmez votre autorité avant de continuer.',
        version: 'Version',
        date: 'Date du document',
        back: 'Retour',
      }
    : {
        heading: 'Partner terms',
        read: 'Read the terms',
        close: 'Back to your form',
        draft: 'Review draft',
        draftNotice:
          'This draft is not in force. A preview acknowledgement does not create legally binding acceptance.',
        translationNotice:
          'French translation for review; it has not been legally reviewed. No controlling language has been designated.',
        previewAccept:
          'I confirm my authority to represent this organization and acknowledge this review version for preview testing.',
        accept:
          'I am authorized to represent this organization and expressly accept this version of the partner terms.',
        disabled: 'Acceptance of this draft is not active.',
        loading: 'Loading terms…',
        readerLoadError: 'Could not load the terms. Please retry.',
        loadError: 'Could not load the terms. Your entered details are preserved.',
        retry: 'Retry',
        required: 'Review the terms and confirm your authority before continuing.',
        version: 'Version',
        date: 'Document date',
        back: 'Back',
      };
}
