import type { Auditable } from './common';

export type PopStatus =
  | 'intact'
  | 'damaged'
  | 'creative_missing'
  | 'lighting_issue'
  | 'wrong_creative'
  | 'obstructed'
  | 'competitor_overlap'
  | 'site_down';

export type SyncState = 'pending' | 'synced' | 'failed';

/** A daily site update / proof-of-performance check (SPEC.md §6.4). */
export interface ProofOfPerformance extends Auditable {
  bookingId: string;
  checkDate: string;
  status: PopStatus;
  conditionNotes?: string;
  latitude?: number;
  longitude?: number;
  capturedAt: string;
  deviceId?: string;
  syncState: SyncState;
  integrityFlags?: string[];
}

export interface PopPhoto extends Auditable {
  popId: string;
  storageRef: string;
  kind: 'creative_visible' | 'context' | 'night';
  exif?: Record<string, unknown>;
  aiFlags?: string[];
}
