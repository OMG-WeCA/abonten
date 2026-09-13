import {
  Camera,
  Activity,
  BellRing,
  ShieldCheck,
  Images,
  LayoutDashboard,
  AlertTriangle,
  Sunrise,
} from 'lucide-react';
import { Hero } from '../../components/marketing/Hero';
import { Section } from '../../components/marketing/Section';
import { SectionHeading } from '../../components/marketing/SectionHeading';
import { PillarCard } from '../../components/marketing/PillarCard';
import { CtaBand } from '../../components/marketing/CtaBand';
import { Reveal } from '../../components/marketing/Reveal';

const DEMO_MAILTO = 'mailto:hello@abonten.com?subject=Abonten%20client%20demo';

const benefits = [
  {
    icon: Camera,
    accent: 'gold' as const,
    title: 'Daily proof of performance',
    body: 'A fresh photo of every site, every day — time-stamped, geo-tagged, and stored immutably. Corrections are appended, never overwritten.',
  },
  {
    icon: Activity,
    accent: 'teal' as const,
    title: 'Real-time monitoring',
    body: 'Live status across all your campaigns and cities, refreshed as field teams sync — even on weak mobile signal.',
  },
  {
    icon: BellRing,
    accent: 'primary' as const,
    title: 'Issue alerts',
    body: 'The moment a creative is torn, missing, or unverified, you are alerted — before it costs you a day of spend.',
  },
  {
    icon: ShieldCheck,
    accent: 'blue' as const,
    title: 'Peace of mind',
    body: 'No more chasing the agency for status. The proof is just there, every morning, for every site.',
  },
];

const features = [
  {
    icon: Images,
    accent: 'gold' as const,
    title: 'Daily POP gallery',
    body: 'Browse every site\u2019s proof photos by day, with verified, pending, and issue status at a glance.',
  },
  {
    icon: LayoutDashboard,
    accent: 'teal' as const,
    title: 'Status dashboard',
    body: 'Verified, pending, and issue counts across all campaigns — so you always know where things stand.',
  },
  {
    icon: AlertTriangle,
    accent: 'primary' as const,
    title: 'Issue tracking',
    body: 'See open issues, severity, and resolution status in real time, with a full audit trail behind each one.',
  },
  {
    icon: Sunrise,
    accent: 'blue' as const,
    title: 'Morning digest',
    body: 'A daily summary in your inbox: what is live, what is pending, and what needs your eye today.',
  },
];

export default function ForClientsPage() {
  return (
    <>
      <Hero
        eyebrow="For clients & advertisers"
        title={
          <>
            Know your ads are live.
            <br />
            <span className="text-accent-gold">Every day.</span>
          </>
        }
        subtitle="Stop asking your agency if it is up. Open Abonten each morning and see photographic proof that every one of your sites is live and intact — across Lagos, Accra, and Douala."
        primaryLabel="See It In Action"
        primaryHref={DEMO_MAILTO}
        secondaryLabel="How verification works"
        secondaryHref="#features"
        trust="Time-stamped · geo-tagged · immutable proof"
        image={{ src: '/images/hero-night.jpg', alt: 'A city at night with illuminated billboards' }}
      />

      <Section variant="surface" size="lg">
        <SectionHeading
          eyebrow="Why brands trust Abonten"
          title="The gap between promised and delivered — closed."
          subtitle="Abonten was built on a simple idea: measure what was promised. KPIs at planning time, photographic proof at delivery time, and the difference in between is the value."
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
          eyebrow="Proof, on your terms"
          title="Verification you can actually check"
          subtitle="The tools a marketing lead needs to confirm delivery without picking up the phone."
          accent="blue"
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 80} className="h-full">
              <PillarCard icon={f.icon} accent={f.accent} title={f.title}>
                {f.body}
              </PillarCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaBand
        variant="primary"
        eyebrow="See it for yourself"
        title="Watch your campaigns go live — and stay live"
        subtitle="Get a walkthrough of the daily proof-of-performance flow your agency can put in front of you tomorrow."
        primaryLabel="See It In Action"
        primaryHref={DEMO_MAILTO}
        secondaryLabel="Talk to us"
        secondaryHref={DEMO_MAILTO}
      />
    </>
  );
}