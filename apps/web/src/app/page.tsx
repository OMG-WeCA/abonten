import { Button } from '../components/Button';
import { Card } from '../components/Card';

const features = [
  { icon: '\u{1F4CD}', title: 'Publish Inventory', desc: 'Media partners register billboard sites with full specs — lat/long, format, illumination, orientation.' },
  { icon: '\u{1F4CA}', title: 'Plan & Book', desc: 'Planners search inventory, estimate KPIs, allocate budgets, and book campaigns across WeCA markets.' },
  { icon: '\u2705', title: 'Verify Delivery', desc: 'Daily proof-of-performance photo uploads give clients assurance their ads are intact.' },
];

const stats = [
  { value: '23+', label: 'Markets' },
  { value: 'Multi', label: 'Currency' },
  { value: 'Offline', label: 'First' },
  { value: 'EN/FR', label: 'Bilingual' },
];

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-brand-black px-8 py-20 text-center text-white">
        <div className="absolute left-0 top-0 h-2 w-full bg-primary" />
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Abonten — Outdoor Advertising,<br />Planned &amp; Verified
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-300">
          The planning, booking, and measurement platform for outdoor advertising across West &amp; Central Africa.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" variant="primary">Get Started</Button>
          <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">Browse Marketplace</Button>
        </div>
      </section>

      {/* Feature cards */}
      <section>
        <h2 className="mb-6 text-2xl font-bold text-foreground">How it works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="text-center">
              <div className="mb-4 text-4xl">{f.icon}</div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm text-muted">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-6 text-center">
              <div className="text-3xl font-bold text-primary">{s.value}</div>
              <div className="mt-1 text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-surface p-12 text-center">
        <h2 className="text-2xl font-bold text-foreground">Ready to plan your next campaign?</h2>
        <p className="mt-2 text-muted">Browse available inventory across WeCA and build your campaign in minutes.</p>
        <Button size="lg" className="mt-6">Start Planning</Button>
      </section>
    </div>
  );
}
