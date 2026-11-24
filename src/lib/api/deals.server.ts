import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { decodeCursor, encodeCursor, parseLimit } from "./pagination";

export const DEAL_COLUMNS =
  "id, organization_id, contact_id, company_id, title, value, stage, probability, expected_close, owner_id, last_call_id, created_at, updated_at";

export async function listDeals(
  orgId: string,
  params: {
    stage?: string | null;
    limit?: string | null;
    cursor?: string | null;
  }
) {
  const limit = parseLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  let query = supabaseAdmin
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("organization_id", orgId);

  if (params.stage) {
    query = query.eq("stage", params.stage);
  }

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  let next_cursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1] as { created_at: string; id: string };
    next_cursor = encodeCursor(lastItem.created_at, lastItem.id);
  }

  return {
    data: items,
    next_cursor,
  };
}
