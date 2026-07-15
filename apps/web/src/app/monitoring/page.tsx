import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';

const sites = [
  { name: 'Ikorodu Road Mega', status: 'verified', city: 'Lagos' },
  { name: 'Lekki-Epe LED', status: 'verified', city: 'Lagos' },
  { name: 'Victoria Island', status: 'pending', city: 'Lagos' },
  { name: 'Graphic Road', status: 'issue', city: 'Accra' },
  { name: 'Spintex Road LED', status: 'verified', city: 'Accra' },
  { name: 'Bd. de la Liberte', status: 'pending', city: 'Douala' },
];

const issues = [
  { site: 'Graphic Road Billboard', severity: 'high', desc: 'Creative torn at lower edge' },
  { site: 'Victoria Island', severity: 'medium', desc: 'Photo not yet uploaded today' },
];

function siteBadge(status: string) {
  switch (status) {
    case 'verified': return <Badge variant="success">Verified</Badge>;
    case 'pending': return <Badge variant="warning">Pending</Badge>;
    case 'issue': return <Badge variant="error">Issue</Badge>;
    default: return <Badge variant="muted">{status}</Badge>;
  }
}

export default function MonitoringPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Monitoring Dashboard</h1>

      {/* Status overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <div className="text-3xl font-bold text-success">3</div>
          <div className="text-sm text-muted">Sites verified today</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-warning">2</div>
          <div className="text-sm text-muted">Pending checks</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-error">1</div>
          <div className="text-sm text-muted">Open issues</div>
        </Card>
      </div>

      {/* Site cards */}
      <h2 className="text-lg font-semibold text-foreground">Site Status</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((s) => (
          <Card key={s.name} className="flex flex-col gap-2 p-4">
            <div className="flex h-24 items-center justify-center rounded-lg bg-border text-2xl text-muted">{'\u{1F4F7}'}</div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">{s.name}</span>
              {siteBadge(s.status)}
            </div>
            <span className="text-sm text-muted">{s.city}</span>
          </Card>
        ))}
      </div>

      {/* Issues */}
      <h2 className="text-lg font-semibold text-foreground">Open Issues</h2>
      <div className="space-y-3">
        {issues.map((i) => (
          <Card key={i.site} className="flex items-center justify-between p-4">
            <div>
              <span className="font-medium text-foreground">{i.site}</span>
              <p className="text-sm text-muted">{i.desc}</p>
            </div>
            <Badge variant={i.severity === 'high' ? 'error' : 'warning'}>{i.severity}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
