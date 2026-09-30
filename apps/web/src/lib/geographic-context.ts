import type { ContextMetric, SiteGeographicContext } from '@abonten/contracts/enrichment';
import { ApiError, apiJson } from './api';

export type GeographicContextState =
  | { status: 'loading' }
  | { status: 'ready'; context: SiteGeographicContext }
  | { status: 'error'; inaccessible: boolean };

/** Private derived context always uses the existing authenticated, tenant-scoped API. */
export async function getGeographicContext(
  orgId: string,
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteGeographicContext> {
  const context = await apiJson<SiteGeographicContext>(
    `/api/inventory/sites/${encodeURIComponent(siteId)}/geographic-context`,
    { method: 'GET', headers: { 'X-Org-Id': orgId }, signal, cache: 'no-store' },
  );
  // Never render demo responses or another site's metrics, even after an API regression.
  if (context.dataClass !== 'production' || context.siteId !== siteId) {
    throw new Error('Invalid geographic context response');
  }
  return context;
}

/** The cleanup cancels transport AND ignores a response that settled after navigation. */
export function beginGeographicContextLoad(
  orgId: string,
  siteId: string,
  onState: (state: GeographicContextState) => void,
): () => void {
  const controller = new AbortController();
  onState({ status: 'loading' });
  void getGeographicContext(orgId, siteId, controller.signal).then(
    (context) => {
      if (!controller.signal.aborted) onState({ status: 'ready', context });
    },
    (error: unknown) => {
      if (!controller.signal.aborted) {
        onState({
          status: 'error',
          inaccessible: error instanceof ApiError && [401, 403, 404].includes(error.status),
        });
      }
    },
  );
  return () => controller.abort();
}

/** Missing and unavailable values stay missing. In particular, null must not become zero. */
export function availableContextValue<T>(metric: ContextMetric<T> | undefined): T | null {
  return metric && metric.status !== 'unavailable' ? metric.value : null;
}

/** Source URLs are untrusted import metadata, never script/data/navigation URLs. */
export function sourceWebUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
