import Link from 'next/link';

const links = [
  { href: '/', label: 'Home' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/planner', label: 'Planner' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/monitoring', label: 'Monitoring' },
  { href: '/admin', label: 'Admin' },
];

export function Nav() {
  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <span className="font-semibold text-slate-900">Abonten</span>
        <div className="flex gap-3 text-sm text-blue-700">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
