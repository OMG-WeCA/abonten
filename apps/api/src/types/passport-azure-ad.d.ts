declare module 'passport-azure-ad' {
  export interface IOidcProfile {
    oid?: string;
    sub?: string;
    displayName?: string;
    name?: { givenName?: string; familyName?: string };
    emails?: Array<{ value: string }>;
    _json?: Record<string, unknown>;
    [key: string]: unknown;
  }
  export class OIDCStrategy {
    constructor(options: Record<string, unknown>, verify: (...args: unknown[]) => void);
    name?: string;
  }
}
