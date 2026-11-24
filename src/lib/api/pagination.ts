export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString("base64");
}

export function decodeCursor(
  cursor?: string | null
): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf-8");
    const [createdAt, id] = raw.split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
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
