const POSTGRES_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s'"`]+/gi;

/** Return only the non-secret endpoint and database name for operator logs. */
export function describeDatabaseEndpoint(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      return '[invalid database endpoint]';
    }
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) || '[default]';
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${database}`;
  } catch {
    return '[invalid database endpoint]';
  }
}

/** Preserve actionable migration errors while removing URL credentials and secrets. */
export function sanitizeDatabaseError(error: unknown, databaseUrl: string): string {
  const endpoint = describeDatabaseEndpoint(databaseUrl);
  const rawMessage = error instanceof Error ? error.message : String(error);
  let sanitized = rawMessage.replaceAll(databaseUrl, endpoint);
  sanitized = sanitized.replace(POSTGRES_URL_PATTERN, (url) => describeDatabaseEndpoint(url));

  try {
    const parsed = new URL(databaseUrl);
    for (const credential of credentialVariants(parsed)) {
      sanitized = sanitized.replaceAll(credential, '[redacted]');
    }
  } catch {
    // The invalid raw URL was already replaced as a whole above.
  }

  return sanitized;
}

function credentialVariants(url: URL): string[] {
  const variants = new Set<string>();
  for (const credential of [url.username, url.password]) {
    if (!credential) continue;
    variants.add(credential);
    try {
      variants.add(decodeURIComponent(credential));
    } catch {
      // Keep the encoded form when malformed percent encoding prevents decoding.
    }
  }
  return [...variants].filter(Boolean);
}
