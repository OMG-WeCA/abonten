'use client';
import Link from 'next/link';
import { Button } from '../Button';
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
  const images = {
    homePage: '/images/hero-billboard.jpg',
    partners: '/images/partners-skyline.jpg',
    planners: '/images/hero-street.jpg',
    clients: '/images/hero-night.jpg',
  };
  if (kind === 'homePage') {
    const home = copy.homePage;
    return (
      <>
        <section className="bg-background">
          <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                {home.title}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{home.subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button href="/sign-in" size="lg">
                  {home.primary}
                </Button>
                <Button href="#how-it-works" size="lg" variant="outline">
                  {home.secondary}
                </Button>
              </div>
            </div>
          </div>
        </section>
        <Section id="how-it-works" variant="surface" size="sm">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {home.heading}
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {home.cards.map(([title, body], index) => (
              <li key={title} className="border-t border-border pt-6">
                <h3 className="text-xl font-bold text-foreground">{title}</h3>
                <p className="mt-3 text-base leading-relaxed text-muted">{body}</p>
                <Link
                  href={['/for-partners', '/for-planners', '/for-clients'][index]}
                  className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                >
                  {copy.nav[index]}
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      </>
    );
  }
  const page = copy[kind];
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
      <Section id="how-it-works" variant="surface" size="lg">
        <SectionHeading eyebrow={copy.how} title={page.workflowTitle} accent="blue" />
        <StepFlow
          locale={locale}
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
        variant="navy"
        eyebrow={page.eyebrow}
        title={page.ctaTitle}
        subtitle={page.ctaDetail}
        primaryLabel={page.primary}
        primaryHref="/sign-in"
      />
    </>
  );
}
