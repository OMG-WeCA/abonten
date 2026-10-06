import type { PartnerTermsDocument as Document } from '../../lib/partner-terms';
import { getTermsCopy } from '../../lib/partner-terms';

export function PartnerTermsDocument({ document }: { document: Document }) {
  const copy = getTermsCopy(document.locale);
  return (
    <article lang={document.locale} className="space-y-7">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          {document.status === 'review_draft' ? copy.draft : 'Abonten'}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">{document.title}</h2>
        <p className="mt-2 text-sm text-muted">
          {copy.version} {document.version} · {copy.date} {document.publishedDate}
        </p>
        {document.status === 'review_draft' && (
          <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6">
            {copy.draftNotice}
          </p>
        )}
        {document.translationStatus === 'translation_for_review' && (
          <p className="mt-3 text-sm leading-6 text-muted">{copy.translationNotice}</p>
        )}
      </header>
      {document.sections.map((section) => (
        <section
          key={section.number}
          className="border-t border-border pt-6"
          aria-labelledby={`terms-section-${section.number}`}
        >
          <h3 id={`terms-section-${section.number}`} className="text-lg font-semibold">
            {section.number}. {section.heading}
          </h3>
          <div className="mt-3 space-y-3 text-sm leading-7 text-muted">
            {section.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
