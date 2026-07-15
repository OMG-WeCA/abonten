import type { Auditable, GeoPoint, LifecycleStatus } from './common';

export type BillboardFormat =
  | 'static'
  | 'digital_led'
  | '3d'
  | 'tri_vision'
  | 'mural'
  | 'transit'
  | 'street_furniture';

export type IlluminationType = 'none' | 'front_lit' | 'back_lit' | 'edge_lit' | 'led';

/** A billboard/site structure (SPEC.md §6.2). */
export interface BillboardSite extends Auditable {
  organizationId: string; // media partner owner
  code: string;
  name: string;
  type: string;
  format: BillboardFormat;
  subFormat?: string;
  location: GeoPoint;
  geoPolygon?: GeoPoint[];
  address?: string;
  city?: string;
  region?: string;
  country: string;
  marketId?: string;
  orientationDeg?: number;
  viewingDistance?: number;
  elevation?: number;
  illuminationType: IlluminationType;
  illuminationHours?: string;
  status: LifecycleStatus;
  permitRef?: string;
  permitExpiresAt?: string;
}

/** A bookable face on a site (SPEC.md §6.2). */
export interface SiteFace extends Auditable {
  siteId: string;
  faceLabel: string;
  width: number;
  height: number;
  area: number;
  units: string;
  printableArea?: string;
  bookable: boolean;
}
