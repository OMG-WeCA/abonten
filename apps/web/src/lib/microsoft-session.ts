import type { StoredSession } from './api';

export function microsoftSessionFromHash(hash: string): StoredSession | null {
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = values.get('accessToken');
  const refreshToken = values.get('refreshToken');
  if (!accessToken || !refreshToken) return null;
  const activeOrgId = values.get('activeOrgId');
  return {
    accessToken,
    refreshToken,
    ...(activeOrgId ? { activeOrgId } : {}),
  };
}
