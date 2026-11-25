export const ALL_SCOPES = [
  "contacts:read",
  "contacts:write",
  "leads:read",
  "deals:read",
  "calls:read",
  "calls:write",
] as const;

export type Scope = (typeof ALL_SCOPES)[number];

export const READ_ONLY_SCOPES: readonly Scope[] = [
  "contacts:read",
  "leads:read",
  "deals:read",
  "calls:read",
] as const;
