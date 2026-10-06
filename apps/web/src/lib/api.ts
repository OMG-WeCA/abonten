import { clearAgencyDrafts } from './agency-draft';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  activeOrgId?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const SESSION_STORAGE_KEY = 'abonten.session';
const SESSION_REFRESH_LOCK = 'abonten.session.refresh';
let refreshInFlight: Promise<boolean> | null = null;

/** Bearer + accept headers for absolute asset URLs (plain fetch only). */
export function fetchAssetHeaders(): Record<string, string> {
  const token = loadSession()?.accessToken;
  return {
    Accept: 'image/*',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function configuredApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function apiUrl(path: string): string {
  return `${configuredApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function loadSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as Partial<StoredSession>;
    return typeof session.accessToken === 'string' && typeof session.refreshToken === 'string'
      ? {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          ...(typeof session.activeOrgId === 'string' ? { activeOrgId: session.activeOrgId } : {}),
        }
      : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  clearAgencyDrafts();
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
  retryOnExpiredAccess?: boolean;
  /** Per-request abort deadline; defaults to 15 s. Uploads use longer budgets. */
  timeoutMs?: number;
}

/** Locale follows the currently rendered UI, with a guest preference fallback. */
export function requestLocale(): 'en' | 'fr' {
  if (typeof document !== 'undefined' && document.documentElement.lang) {
    return document.documentElement.lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem('abonten-locale') === 'fr' ? 'fr' : 'en';
    } catch {
      /* Storage may be disabled. */
    }
  }
  return 'en';
}

export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const { auth = true, retryOnExpiredAccess = true, headers, ...request } = options;
  const session = auth ? loadSession() : null;
  const response = await fetchWithTimeout(apiUrl(path), {
    ...request,
    headers: {
      ...(request.body instanceof FormData ? {} : { Accept: 'application/json' }),
      'Accept-Language': requestLocale(),
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...headers,
    },
  });

  if (response.status === 401 && auth && retryOnExpiredAccess && session) {
    const refreshed = await refreshSession(session);
    if (refreshed) {
      return apiFetch(path, { ...options, retryOnExpiredAccess: false });
    }
  }

  return response;
}

export async function apiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) throw await responseError(response);
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export async function publicJson<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: body === undefined ? 'GET' : 'POST',
    auth: false,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function refreshSession(staleSession: StoredSession): Promise<boolean> {
  return coordinateSessionRefresh(staleSession, false);
}

export async function repairSessionOrganizationContext(): Promise<boolean> {
  const current = loadSession();
  if (!current) return false;
  return coordinateSessionRefresh(current, true);
}

async function coordinateSessionRefresh(
  staleSession: StoredSession,
  clearOrganizationContext: boolean,
): Promise<boolean> {
  const current = loadSession();
  if (!current) return false;
  if (current.refreshToken !== staleSession.refreshToken) return true;
  if (refreshInFlight) return refreshInFlight;

  const attempt = refreshAcrossBrowserContexts(staleSession, clearOrganizationContext);
  refreshInFlight = attempt;
  const release = () => {
    if (refreshInFlight === attempt) refreshInFlight = null;
  };
  void attempt.then(release, release);
  return attempt;
}

async function refreshAcrossBrowserContexts(
  staleSession: StoredSession,
  clearOrganizationContext: boolean,
): Promise<boolean> {
  const redeemIfStillCurrent = async () => {
    const current = loadSession();
    if (!current) return false;
    if (current.refreshToken !== staleSession.refreshToken) return true;
    if (clearOrganizationContext) clearActiveOrganizationIfCurrent(staleSession.refreshToken);
    return redeemRefreshToken({
      ...staleSession,
      activeOrgId: clearOrganizationContext ? undefined : staleSession.activeOrgId,
    });
  };

  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(SESSION_REFRESH_LOCK, redeemIfStillCurrent);
  }
  return redeemIfStillCurrent();
}

async function redeemRefreshToken(
  staleSession: StoredSession,
  repairRejectedOrganization = true,
): Promise<boolean> {
  const response = await fetchWithTimeout(apiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': requestLocale(),
    },
    body: JSON.stringify({
      refreshToken: staleSession.refreshToken,
      activeOrgId: staleSession.activeOrgId,
    }),
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      clearSessionIfCurrent(staleSession.refreshToken);
      return false;
    }
    if (response.status === 403 && staleSession.activeOrgId && repairRejectedOrganization) {
      clearActiveOrganizationIfCurrent(staleSession.refreshToken);
      return redeemRefreshToken({ ...staleSession, activeOrgId: undefined }, false);
    }
    if (response.status === 403) {
      throw new ApiError(
        requestLocale() === 'fr'
          ? 'Actualisez votre accès à l’organisation.'
          : 'Your organization access needs to be refreshed.',
        403,
      );
    }
    throw new ApiError(
      requestLocale() === 'fr'
        ? 'Le renouvellement de la session est temporairement indisponible.'
        : 'Session refresh is temporarily unavailable.',
      response.status,
    );
  }

  const result = (await response.json()) as Partial<StoredSession>;
  if (typeof result.accessToken !== 'string' || typeof result.refreshToken !== 'string') {
    throw new Error('Session refresh returned an invalid response');
  }

  const current = loadSession();
  if (!current) return false;
  if (current.refreshToken !== staleSession.refreshToken) return true;
  saveSession({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    activeOrgId: result.activeOrgId,
  });
  return true;
}

function clearSessionIfCurrent(refreshToken: string): void {
  if (loadSession()?.refreshToken === refreshToken) clearSession();
}

function clearActiveOrganizationIfCurrent(refreshToken: string): void {
  const current = loadSession();
  if (!current || current.refreshToken !== refreshToken) return;
  saveSession({
    accessToken: current.accessToken,
    refreshToken: current.refreshToken,
  });
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 15_000, ...rest } = init;
  init.signal?.throwIfAborted();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  // Combine the caller's signal with the deadline so cancel and timeout both surface.
  const abort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}

async function responseError(response: Response): Promise<ApiError> {
  let message =
    requestLocale() === 'fr'
      ? 'Une erreur est survenue. Veuillez réessayer.'
      : 'Something went wrong. Please try again.';
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message[0] ?? message;
    else if (
      body.message &&
      !(requestLocale() === 'fr' && body.message === 'Internal server error')
    )
      message = body.message;
  } catch {
    // Keep the safe generic message for malformed/non-JSON responses.
  }
  return new ApiError(message, response.status);
}
