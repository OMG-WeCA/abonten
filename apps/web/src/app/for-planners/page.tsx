import {
  Layers,
  Gauge,
  Blocks,
  Map,
  SlidersHorizontal,
  Target,
  PieChart,
  GitBranch,
  Search,
  ClipboardList,
  CalendarCheck,
  Activity,
} from 'lucide-react';
import { Hero } from '../../components/marketing/Hero';
import { Section } from '../../components/marketing/Section';
import { SectionHeading } from '../../components/marketing/SectionHeading';
import { PillarCard } from '../../components/marketing/PillarCard';
import { StepFlow } from '../../components/marketing/StepFlow';
import { CtaBand } from '../../components/marketing/CtaBand';
import { Reveal } from '../../components/marketing/Reveal';

const DEMO_MAILTO = 'mailto:hello@abonten.com?subject=Abonten%20planner%20access';

const benefits = [
  {
    icon: Layers,
    accent: 'blue' as const,
    title: 'Unified inventory view',
    body: 'Every media partner, every billboard, one searchable marketplace — no more chasing vendor catalogs and spreadsheets across Lagos, Accra, and Douala.',
  },
  {
    icon: Gauge,
    accent: 'gold' as const,
    title: 'KPI estimates',
    body: 'Impressions, reach, frequency, and demographic coverage calculated at planning time, so your site selection is defensible to clients.',
  },
  {
    icon: Blocks,
    accent: 'violet' as const,
    title: 'Campaign builder',
    body: 'Assemble 50-site, multi-city WeCA plans in minutes. Save scenarios, compare options, and pick the winning mix before you book.',
  },
  {
    icon: Map,
    accent: 'teal' as const,
    title: 'Map-based discovery',
    body: 'Draw a polygon or radius over your target area and see every bookable billboard with KPIs in seconds.',
  },
];

const features = [
  {
    icon: SlidersHorizontal,
    accent: 'blue' as const,
    title: 'Search & filter',
    body: 'Filter by city, format, illumination, size, audience, and proximity to POIs like malls, markets, and universities.',
  },
  {
    icon: Map,
    accent: 'teal' as const,
    title: 'Map view',
    body: 'Pan across Lagos, Accra, and Douala; draw to select; click any pin for full specs and live availability.',
  },
  {
    icon: Target,
    accent: 'gold' as const,
    title: 'KPI estimation',
    body: 'Per-site and per-plan impressions, reach, frequency, and coverage — recalculated as you add and remove sites.',
  },
  {
    icon: PieChart,
    accent: 'violet' as const,
    title: 'Budget allocation',
    body: 'Set a budget in any currency; track spend against it live, with FX reference rates captured at quote time.',
  },
  {
    icon: GitBranch,
    accent: 'orange' as const,
    title: 'Campaign scenarios',
    body: 'Save and compare plan variants side by side — city mix, budget tiers, flight dates — before you commit.',
  },
];

const workflow = [
  {
    icon: Search,
    accent: 'blue' as const,
    title: 'Discover',
    body: 'Search the map and filter to shortlist the right sites for your audience and budget.',
  },
  {
    icon: ClipboardList,
    accent: 'gold' as const,
    title: 'Plan',
    body: 'Estimate KPIs, allocate budget across markets, and save scenarios to compare.',
  },
  {
    icon: CalendarCheck,
    accent: 'teal' as const,
    title: 'Book',
    body: 'Reserve and confirm sites with holds, amendments, and multi-currency quotes.',
  },
  {
    icon: Activity,
    accent: 'violet' as const,
    title: 'Monitor',
    body: 'Watch live status and daily proof of performance roll in from the field.',
  },
];

export default function ForPlannersPage() {
  return (
    <>
      <Hero
        eyebrow="For planners & buyers"
        title={
          <>
            Plan smarter. Book faster.
            <br />
            <span className="text-accent-gold">Prove everything.</span>
          </>
        }
        subtitle="A unified view of inventory across every media partner in WeCA. Draw a polygon over Lagos, estimate KPIs in seconds, and build defensible multi-city campaigns your clients will trust."
        primaryLabel="Start Planning"
        primaryHref={DEMO_MAILTO}
        secondaryLabel="Explore the platform"
        secondaryHref="#features"
        trust="One marketplace · every media partner · defensible KPIs"
        image={{ src: '/abonten/images/hero-street.jpg', alt: 'A busy West African street with outdoor ads' }}
      />

      <Section variant="surface" size="lg">
        <SectionHeading
          eyebrow="Why planners choose Abonten"
          title="See it all. Plan it well. Defend every choice."
          subtitle="Replace ad-hoc vendor catalogs and spreadsheets with a single source of truth for outdoor inventory across West & Central Africa."
          accent="gold"
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {benefits.map((b, i) => (
            <Reveal key={b.title} delay={i * 80} className="h-full">
              <PillarCard icon={b.icon} accent={b.accent} title={b.title}>
                {b.body}
              </PillarCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="features" variant="navy" size="lg">
        <SectionHeading
          eyebrow="The planning toolkit"
          title="From search to booked in one workflow"
          subtitle="Everything a planner needs to move from a blank map to a locked, budget-balanced, KPI-backed plan."
          accent="blue"
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 70} className="h-full">
              <PillarCard icon={f.icon} accent={f.accent} title={f.title}>
                {f.body}
              </PillarCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section variant="surface" size="lg">
        <SectionHeading
          eyebrow="Your workflow"
          title="Discover. Plan. Book. Monitor."
          subtitle="A connected flow that takes a brief from idea to live campaign — with proof built in."
          accent="teal"
        />
        <StepFlow steps={workflow} className="mt-14" />
      </Section>

      <CtaBand
        variant="navy"
        eyebrow="Ready to plan your next WeCA campaign?"
        title="Start planning today"
        subtitle="Search live inventory, estimate KPIs, and build defensible multi-city plans in minutes — not days."
        primaryLabel="Start Planning"
        primaryHref={DEMO_MAILTO}
        secondaryLabel="Talk to us"
        secondaryHref={DEMO_MAILTO}
      />
    </>
  );
}