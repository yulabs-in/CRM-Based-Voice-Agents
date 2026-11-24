import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { decodeCursor, encodeCursor, parseLimit } from "./pagination";

export const CONTACT_COLUMNS =
  "id, organization_id, project_id, first_name, last_name, phone, email, city, custom_fields, created_at, updated_at";

export interface ContactInput {
  first_name: string;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  city?: string | null;
  project_id?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export async function listContacts(
  orgId: string,
  params: {
    q?: string | null;
    projectId?: string | null;
    limit?: string | null;
    cursor?: string | null;
  }
) {
  const limit = parseLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  let query = supabaseAdmin
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("organization_id", orgId);

  if (params.projectId) {
    query = query.eq("project_id", params.projectId);
  }

  if (params.q) {
    const term = params.q.trim();
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
    );
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

export async function getContactById(orgId: string, contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", contactId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createOrUpdateContact(orgId: string, input: ContactInput) {
  const normalizedPhone = normalizePhoneNumber(input.phone);
  if (!normalizedPhone) {
    throw new Error("Invalid phone number. Please provide a valid mobile number.");
  }

  // Check if contact with same phone already exists in this org
  const { data: existing } = await supabaseAdmin
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("organization_id", orgId)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabaseAdmin
      .from("contacts")
      .update({
        first_name: input.first_name,
        last_name: input.last_name !== undefined ? input.last_name : existing.last_name,
        email: input.email !== undefined ? input.email : existing.email,
        city: input.city !== undefined ? input.city : existing.city,
        project_id: input.project_id !== undefined ? input.project_id : existing.project_id,
        custom_fields:
          (input.custom_fields !== undefined
            ? { ...((existing.custom_fields as object) ?? {}), ...input.custom_fields }
            : existing.custom_fields) as never,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", orgId)
      .eq("id", existing.id)
      .select(CONTACT_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return { contact: updated, isNew: false };
  }

  // Create new contact
  const { data: created, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      organization_id: orgId,
      first_name: input.first_name,
      last_name: input.last_name ?? null,
      phone: normalizedPhone,
      email: input.email ?? null,
      city: input.city ?? null,
      project_id: input.project_id ?? null,
      custom_fields: (input.custom_fields ?? {}) as never,
    })
    .select(CONTACT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return { contact: created, isNew: true };
}

export async function updateContact(
  orgId: string,
  contactId: string,
  fields: Partial<ContactInput>
) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.first_name !== undefined) payload.first_name = fields.first_name;
  if (fields.last_name !== undefined) payload.last_name = fields.last_name;
  if (fields.email !== undefined) payload.email = fields.email;
  if (fields.city !== undefined) payload.city = fields.city;
  if (fields.project_id !== undefined) payload.project_id = fields.project_id;
  if (fields.custom_fields !== undefined) payload.custom_fields = fields.custom_fields;

  if (fields.phone !== undefined) {
    const normalizedPhone = normalizePhoneNumber(fields.phone);
    if (!normalizedPhone) throw new Error("Invalid phone number format");
    payload.phone = normalizedPhone;
  }

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .update(payload as never)
    .eq("organization_id", orgId)
    .eq("id", contactId)
    .select(CONTACT_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
