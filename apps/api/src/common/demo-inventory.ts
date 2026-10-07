/** SQL aliases/parameter expressions come only from source-controlled callers. */
export function demoVisibilitySql(alias: string, orgParameter: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `(${prefix}demo_agency_id IS NULL OR ${prefix}demo_agency_id::text = ${orgParameter}::text OR ${prefix}organization_id::text = ${orgParameter}::text) AND (${prefix}research_agency_id IS NULL OR ${prefix}research_agency_id::text = ${orgParameter}::text OR ${prefix}organization_id::text = ${orgParameter}::text)`;
}

export const DEMO_PROVENANCE =
  'Synthetic agency demonstration sample; dimensions, location and NGN prices are illustrative. No verified media, commercial booking, permit or audience claim.';

export function demoDisclosure(isDemo: boolean) {
  return {
    isDemo,
    ...(isDemo ? { commerciallyBookable: false, demoProvenance: DEMO_PROVENANCE } : {}),
  };
}
