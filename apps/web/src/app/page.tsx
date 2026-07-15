import {
  Building2,
  Target,
  ShieldCheck,
  Upload,
  ClipboardList,
  Camera,
} from 'lucide-react';
import { Hero } from '../components/marketing/Hero';
import { Section } from '../components/marketing/Section';
import { SectionHeading } from '../components/marketing/SectionHeading';
import { PillarCard } from '../components/marketing/PillarCard';
import { StepFlow } from '../components/marketing/StepFlow';
import { StatBand } from '../components/marketing/StatBand';
import { CtaBand } from '../components/marketing/CtaBand';

const DEMO_MAILTO = 'mailto:hello@abonten.com?subject=Abonten%20demo%20request';

const pillars = [
  {
    icon: Building2,
    accent: 'blue' as const,
    title: 'Publish your inventory',
    body: 'Register your billboards with full specs — location, format, illumination, orientation, POIs — and they are bookable across the marketplace within a day. From one depot in Kumasi to a national estate in Lagos.',
  },
  {
    icon: Target,
    accent: 'gold' as const,
    title: 'Plan with confidence',
    body: 'Draw a polygon over Lagos and see every bookable billboard with KPI estimates in seconds. Build 50-site, multi-city WeCA plans with defensible reach, frequency, and budget — not spreadsheets.',
  },
  {
    icon: ShieldCheck,
    accent: 'teal' as const,
    title: 'Verify every placement',
    body: 'Field teams snap daily proof-of-performance photos, even offline. Clients open their phone each morning and see photographic proof every site is live and intact — no chasing the agency.',
  },
];

const steps = [
  {
    icon: Upload,
    accent: 'blue' as const,
    title: 'Publish',
    body: 'Media partners list billboard sites with specs, rate cards, and availability — one at a time or in bulk.',
  },
  {
    icon: ClipboardList,
    accent: 'gold' as const,
    title: 'Plan',
    body: 'Planners discover inventory on the map, estimate KPIs, allocate budget, and book across WeCA.',
  },
  {
    icon: Camera,
    accent: 'teal' as const,
    title: 'Verify',
    body: 'Field operators capture daily proof-of-performance; clients get live status and issue alerts in real time.',
  },
];

const stats = [
  { value: '23+', label: 'Markets', sub: 'across West & Central Africa' },
  { value: '1000s', label: 'Billboards', sub: 'ready to book' },
  { value: 'Daily', label: 'Verification', sub: 'proof every day' },
  { value: 'Multi', label: 'Currency', sub: 'NGN · GHS · XAF · XOF' },
];

export default function Home() {
  return (
    <>
      <Hero
        eyebrow="Built for OMG WeCA · West & Central Africa"
        title={
          <>
            Outdoor advertising,
            <br />
            <span className="text-accent-gold">planned &amp; verified.</span>
          </>
        }
        subtitle="The planning, booking, and proof-of-performance platform for West & Central Africa. List inventory, plan multi-city campaigns with real KPIs, and prove every billboard is live — across 23+ markets."
        primaryLabel="Request a Demo"
        primaryHref={DEMO_MAILTO}
        secondaryLabel="See how it works"
        secondaryHref="#how-it-works"
        trust="Backed by OMG WeCA · English & French · NGN · GHS · XAF · XOF · USD · EUR"
      />

      {/* Three value pillars */}
      <Section variant="surface" size="lg">
        <SectionHeading
          eyebrow="One platform, three jobs"
          title="Publish. Plan. Verify."
          subtitle="Abonten connects the people who own billboard inventory, the people who plan campaigns, and the brands who pay for results — on one shared marketplace."
          accent="gold"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {pillars.map((p) => (
            <PillarCard key={p.title} icon={p.icon} accent={p.accent} title={p.title}>
              {p.body}
            </PillarCard>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" variant="navy" size="lg">
        <SectionHeading
          eyebrow="How it works"
          title="From listing to proof in three moves"
          subtitle="A connected flow that turns fragmented vendor catalogs and spreadsheets into one auditable pipeline."
          accent="blue"
        />
        <StepFlow steps={steps} className="mt-14" />
      </Section>

      {/* Stats */}
      <Section id="stats" variant="surface" size="md">
        <StatBand stats={stats} />
      </Section>

      {/* Final CTA */}
      <CtaBand
        variant="primary"
        eyebrow="Ready when you are"
        title="Plan, book, and verify across WeCA"
        subtitle="Join the media partners, planners, and brands building the future of outdoor advertising in West & Central Africa."
        primaryLabel="Request a Demo"
        primaryHref={DEMO_MAILTO}
        secondaryLabel="Talk to us"
        secondaryHref={DEMO_MAILTO}
      />
    </>
  );
}