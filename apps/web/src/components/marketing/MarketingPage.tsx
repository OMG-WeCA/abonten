'use client';
import { Building2, Target, ShieldCheck, Upload, MapPinned, ClipboardList } from 'lucide-react';
import { useLocale } from '../LocaleProvider';
import { marketingCopy } from '../../lib/marketing-copy';
import { Hero } from './Hero';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';
import { PillarCard } from './PillarCard';
import { StepFlow } from './StepFlow';
import { CtaBand } from './CtaBand';
import { Reveal } from './Reveal';
import { BillboardShowcase } from './BillboardShowcase';
const icons = [Building2, Target, ShieldCheck];
const stepIcons = [Upload, MapPinned, ClipboardList];
const accents = ['blue', 'gold', 'teal'] as const;
export function MarketingPage({
  kind,
}: {
  kind: 'homePage' | 'partners' | 'planners' | 'clients';
}) {
  const { locale } = useLocale();
  const copy = marketingCopy[locale];
  const page = copy[kind];
  const images = {
    homePage: '/images/hero-billboard.jpg',
    partners: '/images/partners-skyline.jpg',
    planners: '/images/hero-street.jpg',
    clients: '/images/hero-night.jpg',
  };
  return (
    <>
      <Hero
        eyebrow={page.eyebrow}
        title={
          <>
            {page.title}
            <br />
            <span className="text-accent-gold">{page.accent}</span>
          </>
        }
        subtitle={page.subtitle}
        primaryLabel={page.primary}
        primaryHref="/sign-in"
        secondaryLabel={page.secondary}
        secondaryHref="#how-it-works"
        trust={`${copy.markets} · ${copy.language}`}
        image={{
          src: images[kind],
          alt:
            locale === 'fr'
              ? 'Publicité extérieure en Afrique de l’Ouest et centrale'
              : 'Outdoor advertising in West & Central Africa',
        }}
      />
      <Section variant="surface" size="lg">
        <SectionHeading
          eyebrow={page.section}
          title={page.heading}
          subtitle={page.intro}
          accent="gold"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {page.cards.map(([title, body], index) => (
            <Reveal key={title} delay={index * 90} className="h-full">
              <PillarCard icon={icons[index]} accent={accents[index]} title={title}>
                {body}
              </PillarCard>
            </Reveal>
          ))}
        </div>
      </Section>
      {kind === 'homePage' && (
        <Section variant="navy" size="lg">
          <SectionHeading
            eyebrow="Illustration"
            title={
              locale === 'fr' ? 'Un panneau, de jour comme de nuit' : 'A board, by day and by night'
            }
            subtitle={
              locale === 'fr'
                ? 'Cette animation illustre un panneau. Les photos et vidéos des annonces montrent les sites réels.'
                : 'This animation illustrates a billboard. Listing photos and videos show the actual sites.'
            }
            accent="gold"
          />
          <div className="mt-12">
            <BillboardShowcase />
          </div>
        </Section>
      )}
      <Section id="how-it-works" variant="surface" size="lg">
        <SectionHeading eyebrow={copy.how} title={page.workflowTitle} accent="blue" />
        <StepFlow
          steps={page.steps.map(([title, body], index) => ({
            title,
            body,
            icon: stepIcons[index],
            accent: accents[index],
          }))}
          className="mt-14"
        />
      </Section>
      <CtaBand
        variant={kind === 'homePage' ? 'primary' : 'navy'}
        eyebrow={page.eyebrow}
        title={page.ctaTitle}
        subtitle={page.ctaDetail}
        primaryLabel={page.primary}
        primaryHref="/sign-in"
      />
    </>
  );
}
