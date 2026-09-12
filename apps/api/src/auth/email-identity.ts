/** Canonical identity form used by every authentication and invitation entry point. */
export function normalizeEmailIdentity(email: string): string {
  return email.trim().toLowerCase();
}
