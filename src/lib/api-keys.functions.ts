import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asApp } from "@/lib/supabase";
import { generateRawApiKey, hashApiKey } from "@/lib/api-auth.server";

async function assertOrgAdmin(
  supabase: Parameters<typeof asApp>[0],
  organizationId: string,
  userId: string
) {
  const { data: member } = await asApp(supabase)
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new Error("Only organization owners and admins can manage API keys");
  }
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        name: z
          .string()
          .trim()
          .min(1, "Name is required")
          .max(80, "Name must be under 80 characters"),
        scopes: z.array(z.string()).min(1, "Select at least one scope"),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organizationId, context.userId);

    const rawKey = generateRawApiKey();
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = await hashApiKey(rawKey);

    const { data: inserted, error } = await asApp(context.supabase)
      .from("api_keys")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: data.scopes,
        created_by: context.userId,
      })
      .select("id, organization_id, name, key_prefix, scopes, created_at")
      .single();

    if (error || !inserted) {
      throw new Error(error?.message || "Failed to create API key");
    }

    // Return the full key ONLY ONCE. It is never stored or logged in plaintext.
    return {
      apiKey: rawKey,
      record: inserted,
    };
  });

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organizationId, context.userId);

    // Never select key_hash!
    const { data: keys, error } = await asApp(context.supabase)
      .from("api_keys")
      .select(
        "id, organization_id, name, key_prefix, scopes, created_by, last_used_at, revoked_at, created_at"
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return keys ?? [];
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organizationId, context.userId);

    const { error } = await asApp(context.supabase)
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("organization_id", data.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });
