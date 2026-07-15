import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';

const orgs = [
  { name: 'Accra Outdoor Media', type: 'media_partner', country: 'Ghana', status: 'active' },
  { name: 'mediaReach OMD Lagos', type: 'agency', country: 'Nigeria', status: 'active' },
  { name: 'Unilever West Africa', type: 'brand', country: 'Nigeria', status: 'active' },
  { name: 'OMG WeCA', type: 'platform', country: 'Nigeria', status: 'active' },
];

const pending = [
  { name: 'Abidjan Digital Screens', type: 'media_partner', country: 'Cote d\'Ivoire' },
  { name: 'Douala Transit Ads', type: 'media_partner', country: 'Cameroon' },
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Platform Admin</h1>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="text-center">
          <div className="text-3xl font-bold text-foreground">4</div>
          <div className="text-sm text-muted">Organizations</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-foreground">12</div>
          <div className="text-sm text-muted">Users</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-foreground">10</div>
          <div className="text-sm text-muted">Billboard sites</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-warning">2</div>
          <div className="text-sm text-muted">Pending approvals</div>
        </Card>
      </div>

      {/* Org table */}
      <h2 className="text-lg font-semibold text-foreground">Organizations</h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orgs.map((o) => (
              <tr key={o.name} className="hover:bg-surface">
                <td className="px-4 py-3 font-medium text-foreground">{o.name}</td>
                <td className="px-4 py-3 text-muted">{o.type}</td>
                <td className="px-4 py-3 text-muted">{o.country}</td>
                <td className="px-4 py-3"><Badge variant="success">{o.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending approvals */}
      <h2 className="text-lg font-semibold text-foreground">Pending Approvals</h2>
      <div className="space-y-3">
        {pending.map((p) => (
          <Card key={p.name} className="flex items-center justify-between p-4">
            <div>
              <span className="font-medium text-foreground">{p.name}</span>
              <span className="ml-2 text-sm text-muted">{p.type} &middot; {p.country}</span>
            </div>
            <Badge variant="warning">Pending</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
