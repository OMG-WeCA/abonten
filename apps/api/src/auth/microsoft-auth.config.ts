const INVALID_CLIENT_SECRETS = new Set([
  'change-me',
  'change-me-in-dev',
  'change-me-session-dev',
  'client-secret',
]);

export interface MicrosoftAuthConfiguration {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface MicrosoftAuthAvailability {
  enabled: boolean;
  unavailableReason?: string;
}

export function microsoftAuthAvailability(
  configuration: MicrosoftAuthConfiguration,
): MicrosoftAuthAvailability {
  const tenantId = configuration.tenantId?.trim() ?? '';
  const clientId = configuration.clientId?.trim() ?? '';
  const clientSecret = configuration.clientSecret?.trim() ?? '';
  const secretIsUsable =
    clientSecret.length >= 16 && !INVALID_CLIENT_SECRETS.has(clientSecret.toLowerCase());
  if (tenantId && clientId && secretIsUsable) return { enabled: true };
  return {
    enabled: false,
    unavailableReason:
      'Microsoft sign-in is unavailable because its tenant, client ID, or client secret is missing or invalid. Use an email code instead.',
  };
}

export function microsoftTenantIssuers(tenantId: string): readonly string[] {
  return [`https://login.microsoftonline.com/${tenantId}/v2.0`];
}

export function isMicrosoftIssuerAllowed(issuer: string, tenantId: string): boolean {
  return microsoftTenantIssuers(tenantId).includes(issuer);
}
