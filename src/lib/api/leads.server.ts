import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { decodeCursor, encodeCursor, parseLimit } from "./pagination";

export const LEAD_COLUMNS =
  "id, organization_id, contact_id, name, company_name, email, phone, status, score, value, source, owner_id, last_call_id, created_at, updated_at";

export async function listLeads(
  orgId: string,
  params: {
    status?: string | null;
    limit?: string | null;
    cursor?: string | null;
  }
) {
  const limit = parseLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  let query = supabaseAdmin
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("organization_id", orgId);

  if (params.status) {
    query = query.eq("status", params.status);
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
