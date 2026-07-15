import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';

const campaigns = [
  { name: 'Q4 FMCG Lagos Push', client: 'Unilever WA', status: 'Live', flight: 'Oct 1 - Nov 15, 2026', progress: 64 },
  { name: 'Accra Brand Launch', client: 'Unilever WA', status: 'Planned', flight: 'Dec 1 - Jan 15, 2027', progress: 0 },
  { name: 'Douala Holiday Promo', client: 'Unilever WA', status: 'Draft', flight: 'TBD', progress: 0 },
  { name: 'Lekki Express Summer', client: 'Unilever WA', status: 'Completed', flight: 'Jul 1 - Aug 30, 2026', progress: 100 },
];

function statusBadge(status: string) {
  switch (status) {
    case 'Live': return <Badge variant="success">Live</Badge>;
    case 'Planned': return <Badge variant="info">Planned</Badge>;
    case 'Draft': return <Badge variant="muted">Draft</Badge>;
    case 'Completed': return <Badge variant="muted">Completed</Badge>;
    default: return <Badge variant="muted">{status}</Badge>;
  }
}

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
        <Button>New Campaign</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Flight</th>
              <th className="px-4 py-3 font-medium">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {campaigns.map((c) => (
              <tr key={c.name} className="hover:bg-surface">
                <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-3 text-muted">{c.client}</td>
                <td className="px-4 py-3">{statusBadge(c.status)}</td>
                <td className="px-4 py-3 text-muted">{c.flight}</td>
                <td className="px-4 py-3">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${c.progress}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
