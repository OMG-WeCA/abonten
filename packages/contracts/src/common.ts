// Common primitives shared across the data model (SPEC.md §6).

/** ISO-8601 timestamp string, e.g. "2026-07-14T23:28:35Z". */
export type ISODateString = string;

/** A geographic point [longitude, latitude] in WGS84. PostGIS stores geometry; clients use lon/lat. */
export type GeoPoint = { longitude: number; latitude: number };

/** Money in the smallest currency unit with an ISO-4217 currency code. */
export interface Money {
  amount: number;
  currency: string; // e.g. NGN, GHS, XAF, XOF, USD, EUR
}

/** Lifecycle status values reused across entities. */
export type LifecycleStatus = 'draft' | 'pending_review' | 'approved' | 'listed' | 'suspended' | 'decommissioned';

/** Standard audit fields present on most entities. */
export interface Auditable {
  id: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  createdBy?: string;
  updatedBy?: string;
}

/** A page result envelope. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
