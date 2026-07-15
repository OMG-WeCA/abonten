import {
  Users,
  CalendarCheck,
  Wallet,
  Layers,
  CalendarDays,
  ClipboardCheck,
  Camera,
  UserPlus,
  MapPinned,
  Handshake,
} from 'lucide-react';
import { Hero } from '../../components/marketing/Hero';
import { Section } from '../../components/marketing/Section';
import { SectionHeading } from '../../components/marketing/SectionHeading';
import { PillarCard } from '../../components/marketing/PillarCard';
import { StepFlow } from '../../components/marketing/StepFlow';
import { CtaBand } from '../../components/marketing/CtaBand';

const DEMO_MAILTO = 'mailto:hello@abonten.com?subject=Abonten%20media%20partner%20signup';

const benefits = [
  {
    icon: Users,
    accent: 'blue' as const,
    title: 'Reach more buyers',
    body: 'Get your inventory in front of every planner and brand on the OMG WeCA network — one marketplace, hundreds of decision-makers, no more cold pitches.',
  },
  {
    icon: CalendarCheck,
    accent: 'teal' as const,
    title: 'Manage availability',
    body: 'A live availability calendar keeps your faces booked, not double-booked. Update rates, black out dates, and set seasonal pricing in seconds.',
  },
  {
    icon: Wallet,
    accent: 'gold' as const,
    title: 'Get paid faster',
    body: 'Clear bookings, multi-currency rate cards, and FX captured at quote time mean fewer disputes and faster settlement — in NGN, GHS, XAF, XOF, USD, or EUR.',
  },
];

const features = [
  {
    icon: Layers,
    accent: 'violet' as const,
    title: 'Inventory management',
    body: 'Register sites with lat/long, format, illumination, orientation, and POIs. Bulk-load hundreds of sites or add one from your phone.',
  },
  {
    icon: CalendarDays,
    accent: 'blue' as const,
    title: 'Availability calendar',
    body: 'See holds, bookings, and blackouts at a glance. Accept or decline requests in a single tap.',
  },
  {
    icon: ClipboardCheck,
    accent: 'teal' as const,
    title: 'Booking flow',
    body: 'Request, confirm, or cancel — with holds, expiry, and amendments, all fully audited.',
  },
  {
    icon: Camera,
    accent: 'gold' as const,
    title: 'Proof of performance',
    body: 'Delegate daily POP to field staff. Uploads sync even on weak signal, then bookings are verified automatically.',
  },
];

const onboarding = [
  {
    icon: UserPlus,
    accent: 'blue' as const,
    title: 'Register',
    body: 'Create your media-partner organization and invite your team in minutes.',
  },
  {
    icon: MapPinned,
    accent: 'gold' as const,
    title: 'List your sites',
    body: 'Add billboards with specs, photos, and rate cards — one at a time or in bulk.',
  },
  {
    icon: Handshake,
    accent: 'teal' as const,
    title: 'Get booked',
    body: 'Planners discover you on the map and send booking requests. Accept, confirm, get paid.',
  },
];

export default function ForPartnersPage() {
  return (
    <>
      <Hero
        eyebrow="For media partners"
        title={
          <>
            List your billboards.
            <br />
            <span className="text-accent-gold">Get booked.</span>
          </>
        }
        subtitle="Reach every planner and brand on the OMG WeCA network. Manage availability, accept bookings, and get paid — all from one dashboard. From a single depot in Kumasi to a national estate in Lagos."
        primaryLabel="Become a Media Partner"
        primaryHref={DEMO_MAILTO}
        secondaryLabel="See how it works"
        secondaryHref="#how-it-works"
        trust="Listed inventory is bookable across 23+ WeCA markets"
      />

      <Section variant="surface" size="lg">
        <SectionHeading
          eyebrow="Why join Abonten"
          title="More buyers. Less admin. Faster payment."
          subtitle="Stop chasing buyers and reconciling spreadsheets. Abonten puts your inventory where the demand is and handles the booking paperwork for you."
          accent="gold"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {benefits.map((b) => (
            <PillarCard key={b.title} icon={b.icon} accent={b.accent} title={b.title}>
              {b.body}
            </PillarCard>
          ))}
        </div>
      </Section>

      <Section variant="navy" size="lg">
        <SectionHeading
          eyebrow="Everything you need to sell your space"
          title="Features built for outdoor operators"
          subtitle="From a roadside static board in Accra to a digital spectacular in Victoria Island — manage it all in one place."
          accent="blue"
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <PillarCard key={f.title} icon={f.icon} accent={f.accent} title={f.title}>
              {f.body}
            </PillarCard>
          ))}
        </div>
      </Section>

      <Section id="how-it-works" variant="surface" size="lg">
        <SectionHeading
          eyebrow="Onboarding in three steps"
          title="Register. List. Get booked."
          subtitle="You can have your first billboard live and bookable the same day you sign up."
          accent="teal"
        />
        <StepFlow steps={onboarding} className="mt-14" />
      </Section>

      <CtaBand
        variant="navy"
        eyebrow="Your inventory, in front of every buyer"
        title="Become a media partner today"
        subtitle="Join the outdoor operators already listing on Abonten and start receiving booking requests from across West & Central Africa."
        primaryLabel="Become a Media Partner"
        primaryHref={DEMO_MAILTO}
        secondaryLabel="Talk to us"
        secondaryHref={DEMO_MAILTO}
      />
    </>
  );
}