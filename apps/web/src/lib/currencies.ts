// Mirror of SUPPORTED_CURRENCIES in apps/api/src/orgs/dto/orgs.dto.ts — keep in
// sync when the server list changes.
export const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
