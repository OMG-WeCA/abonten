import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { Capability } from '../capabilities/capability.enum';

const CURRENCIES = ['USD', 'EUR', 'GHS', 'NGN', 'XAF', 'XOF'];
export interface ExchangeSnapshot { source: string; asOf: string; rates: Record<string, number> }
export function validateExchangeSnapshot(data: unknown, now = Date.now()): ExchangeSnapshot {
  const d = data as { result?: string; base_code?: string; time_last_update_unix?: number; rates?: Record<string, number> } | null;
  const timestamp = Number(d?.time_last_update_unix) * 1000;
  if (d?.result !== 'success' || d.base_code !== 'USD' || !Number.isFinite(timestamp) ||
    now - timestamp > 48 * 60 * 60 * 1000 || timestamp > now + 5 * 60 * 1000) throw new Error('Invalid exchange snapshot');
  const rates: Record<string, number> = {};
  for (const c of CURRENCIES) {
    const value = d.rates?.[c];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('Missing exchange rate');
    rates[c] = value;
  }
  if (rates.USD !== 1) throw new Error('Invalid base rate');
  return { source: 'ExchangeRate-API', asOf: new Date(timestamp).toISOString(), rates };
}

@Controller('inventory/exchange-rates')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.INVENTORY_VIEW)
export class ExchangeRatesController {
  private cached?: { at: number; snapshot: ExchangeSnapshot };
  private pending?: Promise<ExchangeSnapshot>;

  @Get()
  async get(): Promise<ExchangeSnapshot> {
    if (this.cached && Date.now() - this.cached.at < 60 * 60 * 1000 && Date.now() - Date.parse(this.cached.snapshot.asOf) < 48 * 60 * 60 * 1000) return this.cached.snapshot;
    if (this.pending) return this.pending;
    this.pending = this.load();
    try { return await this.pending; } finally { this.pending = undefined; }
  }

  private async load(): Promise<ExchangeSnapshot> {
    try {
      // Fixed public endpoint; no tenant data or credentials are sent upstream.
      const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Exchange provider unavailable');
      const snapshot = validateExchangeSnapshot(await response.json());
      this.cached = { at: Date.now(), snapshot };
      return snapshot;
    } catch { throw new ServiceUnavailableException('Currency conversion is temporarily unavailable.'); }
  }
}
