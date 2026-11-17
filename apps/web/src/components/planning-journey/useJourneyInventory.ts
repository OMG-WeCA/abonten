'use client';

import { useEffect, useState } from 'react';
import {
  getAgencySite,
  getSiteOptions,
  searchAgencySites,
  type AgencyMarketplaceSite,
  type SiteOptions,
} from '../../lib/agency-api';
import {
  planningDays,
  type PlanningAvailability,
  type PlanningWindow,
} from '../../lib/agency-planning';
import type { SiteDetail } from '../../lib/sites-api';

const PAGE_SIZE = 40;
type InventoryResult = { items: AgencyMarketplaceSite[]; total: number };
type RequestResult<T> = { value: T; error?: false } | { value?: undefined; error: true };

export function useJourneyInventory(
  orgId: string,
  country: string,
  search: string,
  format: string,
  page: number,
) {
  const key = JSON.stringify([country, search.trim(), format, page]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: RequestResult<InventoryResult>;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        void searchAgencySites(
          orgId,
          { country, search: search.trim(), format, page, limit: PAGE_SIZE },
          controller.signal,
        ).then(
          (value) => {
            if (!controller.signal.aborted) setResult({ key, data: { value } });
          },
          () => {
            if (!controller.signal.aborted) setResult({ key, data: { error: true } });
          },
        );
      },
      search.trim() ? 240 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [orgId, country, search, format, page, key, retry]);
  const current = result?.key === key ? result.data : null;
  return {
    boards: current?.value?.items ?? [],
    total: current?.value?.total ?? 0,
    pageSize: PAGE_SIZE,
    status: current?.error ? 'error' : current ? 'ready' : 'loading',
    retry: () => {
      setResult(null);
      setRetry((attempt) => attempt + 1);
    },
  } as const;
}

/** Current selection is first; batches keep a reopened large draft from flooding the API. */
export function useJourneyBoardFacts(orgId: string, siteIds: string[], flight: PlanningWindow) {
  const [details, setDetails] = useState<Record<string, RequestResult<SiteDetail>>>({});
  const [checks, setChecks] = useState<Record<string, RequestResult<SiteOptions>>>({});
  const [retryVersion, setRetryVersion] = useState(0);
  const ids = [...new Set(siteIds)].join(',');
  const { startDate, endDate } = flight;
  const checkKey = (siteId: string) => `${siteId}:${startDate}:${endDate}`;

  useEffect(() => {
    const controller = new AbortController();
    const window = { startDate, endDate };
    const validFlight = planningDays(window) !== null;
    async function loadSite(id: string) {
      const requests: Promise<void>[] = [];
      if (!details[id])
        requests.push(
          getAgencySite(orgId, id, controller.signal).then(
            (value) => {
              if (!controller.signal.aborted) setDetails((old) => ({ ...old, [id]: { value } }));
            },
            () => {
              if (!controller.signal.aborted)
                setDetails((old) => ({ ...old, [id]: { error: true } }));
            },
          ),
        );
      const key = `${id}:${startDate}:${endDate}`;
      if (validFlight && !checks[key])
        requests.push(
          getSiteOptions(orgId, id, window, controller.signal).then(
            (value) => {
              if (!controller.signal.aborted) setChecks((old) => ({ ...old, [key]: { value } }));
            },
            () => {
              if (!controller.signal.aborted)
                setChecks((old) => ({ ...old, [key]: { error: true } }));
            },
          ),
        );
      await Promise.all(requests);
    }
    async function run() {
      const pending = ids ? ids.split(',') : [];
      for (let offset = 0; offset < pending.length && !controller.signal.aborted; offset += 4)
        await Promise.all(pending.slice(offset, offset + 4).map(loadSite));
    }
    void run();
    return () => controller.abort();
    // Already loaded facts should not cancel sibling requests or restart the batch.
  }, [orgId, ids, startDate, endDate, retryVersion]);

  function availability(siteId: string, faceId: string): PlanningAvailability {
    const entry = checks[checkKey(siteId)]?.value;
    const available = entry?.faces.find((item) => item.faceId === faceId)?.available;
    return {
      status: available === true ? 'available' : available === false ? 'unavailable' : 'unknown',
      ...(entry
        ? {
            window: { startDate: entry.startDate, endDate: entry.endDate },
            checkedAt: entry.checkedAt,
          }
        : {}),
    };
  }
  function retry(siteId: string) {
    setDetails((old) => {
      const next = { ...old };
      if (next[siteId]?.error) delete next[siteId];
      return next;
    });
    setChecks((old) => {
      const next = { ...old };
      if (next[checkKey(siteId)]?.error) delete next[checkKey(siteId)];
      return next;
    });
    setRetryVersion((version) => version + 1);
  }
  return {
    details,
    availability,
    retry,
    availabilityFailed: (siteId: string) => checks[checkKey(siteId)]?.error === true,
  };
}
