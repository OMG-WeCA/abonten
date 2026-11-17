/** Agency-owned commercial campaign reads; personal planning drafts remain separate. */
export interface AgencyCampaignPermissions {
  bookings: boolean;
  proof: boolean;
  issues: boolean;
}

export interface AgencyCampaignSummary {
  id: string;
  name: string;
  status: string;
  clientName: string | null;
  currency: string | null;
  flightStart: string | null;
  /** Exclusive end instant; interfaces show the preceding calendar day. */
  flightEnd: string | null;
  planningBudget: number | null;
  /** Complete same-currency quote basis; never inferred from a recorded rate. */
  committedBudget: number | null;
  committedKnownSubtotal: number | null;
  commitmentMissingCount: number | null;
  faceCount: number;
  bookingCount: number | null;
  pendingBookingCount: number | null;
  firmBookingCount: number | null;
  /** Most recent captured timestamp of a synced check; not a delivery verdict. */
  latestProofAt: string | null;
  openIssueCount: number | null;
  updatedAt: string;
}

export interface AgencyCurrencyTotal {
  currency: string;
  campaignCount: number;
  planningBudget: number | null;
  planningKnownSubtotal: number;
  planningMissingCount: number;
  committedBudget: number | null;
  committedKnownSubtotal: number | null;
  commitmentMissingCount: number | null;
}

export interface AgencyCampaignList {
  items: AgencyCampaignSummary[];
  total: number;
  limit: number;
  offset: number;
  asOf: string;
  /** Committed amounts use quote subtotals before tax. */
  commitmentBasis: 'quote_subtotal';
  defaultCurrency: string;
  permissions: AgencyCampaignPermissions;
  /** Counts and currency totals cover the agency, independently of page/status. */
  statusCounts: Record<string, number>;
  currencyTotals: AgencyCurrencyTotal[];
  currencyMissingCount: number;
}

export interface AgencyCampaignProof {
  id: string;
  checkDate: string;
  status: string;
  capturedAt: string | null;
  syncState: string;
  conditionNotes: string | null;
  photoCount: number;
  creativeVisiblePhotoCount: number;
  /** Fetch each image through the scoped authenticated photo endpoint. */
  photos: { id: string; kind: string | null }[];
}

export interface AgencyCampaignProofRecord extends AgencyCampaignProof {
  campaignItemId: string;
  bookingId: string | null;
}

export interface AgencyCampaignBooking {
  id: string;
  status: string;
  startDate: string;
  /** Exclusive last day boundary. */
  endDate: string;
  holdExpiresAt: string | null;
  currency: string | null;
  /** Stored rate, whose duration basis is unknown. Never a full-flight amount. */
  recordedRate: number | null;
  committedBudget: number | null;
  /** Currency of the qualifying quote amount, separate from recordedRate's currency. */
  committedCurrency: string | null;
  latestProof: AgencyCampaignProof | null;
}

export interface AgencyCampaignItem {
  id: string;
  faceId: string;
  faceLabel: string | null;
  siteId: string | null;
  siteName: string | null;
  city: string | null;
  country: string | null;
  startDate: string;
  /** Exclusive last day boundary. */
  endDate: string;
  status: string;
  bookings: AgencyCampaignBooking[] | null;
}

export interface AgencyCampaignIssue {
  id: string;
  type: string;
  severity: string | null;
  status: string;
  summary: string | null;
  bookingId: string | null;
  popId: string | null;
  dueAt: string | null;
}

export interface AgencyCampaignQuote {
  id: string;
  bookingId: string | null;
  currency: string | null;
  status: string;
  subtotal: number | null;
  taxes: number | null;
  total: number | null;
}

export interface AgencyCampaignDetail {
  campaign: AgencyCampaignSummary;
  commitmentBasis: 'quote_subtotal';
  permissions: AgencyCampaignPermissions;
  objective: string | null;
  targetAudience: string | null;
  items: AgencyCampaignItem[];
  /** Latest synced check per booking, plus older checks linked to visible open issues. */
  proofs: AgencyCampaignProofRecord[] | null;
  issues: AgencyCampaignIssue[] | null;
  quotes: AgencyCampaignQuote[] | null;
}
