import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';

const billboards = [
  { name: 'Ikorodu Road Mega', city: 'Lagos, NG', format: 'Static', size: '8x3 m', price: '\u20A6 450,000/wk', status: 'listed' },
  { name: 'Lekki-Epe Expressway LED', city: 'Lagos, NG', format: 'Digital LED', size: '12x4 m', price: '\u20A6 850,000/wk', status: 'listed' },
  { name: 'Victoria Island Spectacular', city: 'Lagos, NG', format: '3D', size: '10x5 m', price: '\u20A6 1,200,000/wk', status: 'pending_review' },
  { name: 'Graphic Road Billboard', city: 'Accra, GH', format: 'Static', size: '8x3 m', price: '\u20B5 12,000/wk', status: 'listed' },
  { name: 'Spintex Road LED', city: 'Accra, GH', format: 'Digital LED', size: '10x4 m', price: '\u20B5 18,000/wk', status: 'listed' },
  { name: 'Boulevard de la Liberte', city: 'Douala, CM', format: 'Static', size: '8x3 m', price: 'FCFA 350,000/wk', status: 'listed' },
  { name: 'Ikeja City Mall Gantry', city: 'Lagos, NG', format: 'Static', size: '6x3 m', price: '\u20A6 320,000/wk', status: 'listed' },
  { name: 'Liberation Road Gantry', city: 'Accra, GH', format: 'Static', size: '6x3 m', price: '\u20B5 9,500/wk', status: 'listed' },
];

function statusBadge(status: string) {
  if (status === 'listed') return <Badge variant="success">Listed</Badge>;
  if (status === 'pending_review') return <Badge variant="warning">Pending</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}

export default function MarketplacePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Marketplace</h1>
        <Button variant="outline" size="sm">Map View</Button>
      </div>

      {/* Filter bar */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Input placeholder="Search location..." />
        <Input placeholder="Format (static, LED, 3D)" />
        <Input placeholder="Size range" />
        <Input placeholder="Price range" />
      </div>

      {/* Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {billboards.map((b) => (
          <Card key={b.name} className="flex flex-col gap-3 p-4">
            <div className="flex h-32 items-center justify-center rounded-lg bg-border text-3xl text-muted">
              {"\u{1F4F7}"}
            </div>
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-foreground">{b.name}</h3>
              {statusBadge(b.status)}
            </div>
            <div className="text-sm text-muted">
              {b.city} &middot; {b.format} &middot; {b.size}
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="font-medium text-foreground">{b.price}</span>
              <Button size="sm" variant="outline">View Details</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
