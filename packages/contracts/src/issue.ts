import type { Auditable } from './common';

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';

export interface Issue extends Auditable {
  campaignId?: string;
  bookingId?: string;
  popId?: string;
  type: string;
  severity: IssueSeverity;
  status: IssueStatus;
  ownerOrgId?: string;
  assignedUserId?: string;
  summary: string;
  dueAt?: string;
  resolvedAt?: string;
}
