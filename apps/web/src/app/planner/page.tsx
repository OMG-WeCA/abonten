import { Button } from '../../components/Button';
import { Card } from '../../components/Card';

export default function PlannerPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Campaign Planner</h1>
        <Button>New Campaign</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Map placeholder */}
        <Card className="min-h-[400px] items-center justify-center flex flex-col">
          <div className="text-4xl text-muted">{'\u{1F5FA}\uFE0F'}</div>
          <p className="mt-2 text-muted">Interactive map — select sites by drawing a polygon or radius.</p>
        </Card>

        {/* Campaign details */}
        <Card className="space-y-4">
          <h3 className="font-semibold text-foreground">Campaign Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Campaign name</span>
              <span className="text-foreground">Q4 FMCG Lagos Push</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Client</span>
              <span className="text-foreground">Unilever West Africa</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Budget</span>
              <span className="text-foreground">{'\u20A6'} 5,000,000</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Flight</span>
              <span className="text-foreground">Oct 1 - Nov 15, 2026</span>
            </div>
          </div>
          {/* Budget allocation */}
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>Budget allocated</span>
              <span>{'\u20A6'} 3,200,000 / 5,000,000</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary" style={{ width: '64%' }} />
            </div>
          </div>
          {/* KPI summary */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg bg-surface p-3 text-center">
              <div className="text-lg font-bold text-foreground">2.4M</div>
              <div className="text-xs text-muted">Impressions</div>
            </div>
            <div className="rounded-lg bg-surface p-3 text-center">
              <div className="text-lg font-bold text-foreground">38%</div>
              <div className="text-xs text-muted">Reach</div>
            </div>
            <div className="rounded-lg bg-surface p-3 text-center">
              <div className="text-lg font-bold text-foreground">4.2x</div>
              <div className="text-xs text-muted">Frequency</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
