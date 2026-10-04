import { PLANNING_CURRENCIES } from './agency-planning';

interface SelectedFace {
  site: { id: string };
  faceId: string;
  pricingCurrency?: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep face IDs and their parents together. The open board takes priority, then
 * draft order. Omitted faces never become a complete budget-fit calculation. */
export function buildPlannerSelection(
  shortlist: readonly SelectedFace[],
  selectedId: string | null,
) {
  const selectedSiteIds = new Set<string>();
  const selectedFaceIds: string[] = [];
  const faceCurrencies: { faceId: string; currency: string }[] = [];
  if (selectedId && UUID.test(selectedId)) selectedSiteIds.add(selectedId);
  const unique = [...new Map(shortlist.map((item) => [item.faceId, item])).values()];
  for (const item of unique) {
    if (!UUID.test(item.faceId) || !UUID.test(item.site.id)) continue;
    if (
      selectedFaceIds.length === 24 ||
      (!selectedSiteIds.has(item.site.id) && selectedSiteIds.size === 12)
    )
      continue;
    selectedSiteIds.add(item.site.id);
    selectedFaceIds.push(item.faceId);
    if (PLANNING_CURRENCIES.some((currency) => currency === item.pricingCurrency))
      faceCurrencies.push({ faceId: item.faceId, currency: item.pricingCurrency! });
  }
  const omittedFaces = unique.length - selectedFaceIds.length;
  return {
    selectedSiteIds: [...selectedSiteIds],
    selectedFaceIds,
    faceCurrencies,
    selectionTruncated: omittedFaces > 0,
    omittedFaces,
  };
}
