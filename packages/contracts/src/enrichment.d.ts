/** Geographic context is descriptive reference data, never an audience/reach estimate. */
export type EnrichmentLayer = 'roads' | 'pois' | 'admin1' | 'admin2' | 'population' | 'traffic';
export type ContextQuality = 'mapped' | 'modelled' | 'observed';
export type ContextStatus = 'available' | 'partial' | 'unavailable';
export interface ContextProvenance {
  importId: string;
  sourceKey: string;
  version: string;
  referenceYear: number;
  publishedAt: string | null;
  fetchedAt: string;
  licence: string;
  licenceUrl: string;
  attribution: string;
  sourceUrl: string;
  checksum: string;
  quality: ContextQuality;
  warnings: string[];
}
export interface ContextMetric<T> {
  status: ContextStatus;
  value: T | null;
  method: string;
  provenance: ContextProvenance | null;
  warnings: string[];
}
export interface PopulationContext {
  /** Area-weighted modelled residents in valid cells, not audience or footfall. */
  people: number | null;
  validCoverageFraction: number;
  rasterCoverageFraction: number;
  unit: 'people';
}
export interface RoadContext {
  sourceId: string;
  name: string | null;
  roadClass: string;
  /** Source route reference, never substituted for a missing name. */
  ref?: string | null;
  distanceMetres: number;
}
export interface NamedRoadMetric extends ContextMetric<RoadContext> {
  /** Optional for compatibility with earlier additive responses. */
  searchRadiusMetres?: 1000;
  searchCoverage?: 'complete' | 'partial' | 'outside' | 'unavailable';
}
export interface PoiContext {
  sourceId: string;
  name: string | null;
  category: string;
  distanceMetres: number;
}
export interface PoiSummary {
  mappedCount: number;
  byCategory: Record<string, number>;
  nearest: PoiContext[];
  completeness: 'unknown';
}
export interface AdministrativeContext {
  sourceId: string;
  name: string;
  level: 1 | 2;
}
export interface TrafficObservation {
  sourceId: string;
  observedFrom: string;
  observedTo: string;
  durationMinutes: number;
  count: number | null;
  unit: 'vehicles' | 'pedestrians';
  direction: string;
  vehicleClasses: string[];
  method: string;
  distanceMetres: number;
}
export interface SiteGeographicContext {
  siteId: string;
  countryCode: string | null;
  supported: boolean;
  generatedAt: string;
  dataClass: 'production';
  disclaimer: string;
  /** Absolute closest mapped segment; includes unnamed service/link roads. */
  nearestRoad: ContextMetric<RoadContext>;
  /** Additive: closest segment with a source name within 1000m. Older APIs omit it. */
  nearestNamedRoad?: NamedRoadMetric;
  administrative: ContextMetric<AdministrativeContext[]>[];
  catchments: {
    radiusMetres: 250 | 500 | 1000;
    pois: ContextMetric<PoiSummary>;
    population: ContextMetric<PopulationContext>;
  }[];
  traffic: ContextMetric<TrafficObservation[]>;
}
