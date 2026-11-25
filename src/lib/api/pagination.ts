import { ApiError } from "@/lib/api-auth.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString("base64");
}

export function decodeCursor(
  cursor?: string | null
): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64").toString("utf-8");
  } catch {
    throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  }
  const parts = raw.split("|");
  if (parts.length !== 2) {
    throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  }
  const [createdAt, id] = parts;
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !isUuid(id)) {
    throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  }
  return { createdAt, id };
}

export function parseLimit(
  rawLimit?: string | null,
  defaultLimit = 50,
  maxLimit = 200
): number {
  if (!rawLimit) return defaultLimit;
  const parsed = parseInt(rawLimit, 10);
  if (isNaN(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}
