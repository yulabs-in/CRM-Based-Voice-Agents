import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asApp, type AppClient } from "@/lib/supabase";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_CALLING_HOURS,
  generateWidgetKey,
  type WidgetSettingsData,
} from "@/lib/widget";

async function requireAdminRole(client: AppClient, organizationId: string, userId: string): Promise<void> {
  const { data, error } = await client
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Only workspace owners and admins can manage widget settings");
  }
}

export const getWidgetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<WidgetSettingsData> => {
    const client = asApp(context.supabase);
    const { data: row, error } = await client
      .from("widget_settings")
      .select("*")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!row) {
      return {
        organization_id: data.organizationId,
        widget_key: generateWidgetKey(),
        allowed_domains: [],
        project_id: null,
        agent_id: null,
        instant_callback: false,
        calling_hours: { ...DEFAULT_CALLING_HOURS },
        appearance: { ...DEFAULT_APPEARANCE },
        privacy_url: null,
      };
    }

    const ch = (row.calling_hours ?? {}) as Partial<WidgetSettingsData["calling_hours"]>;
    const ap = (row.appearance ?? {}) as Partial<WidgetSettingsData["appearance"]>;
    return {
      id: row.id,
      organization_id: row.organization_id,
      widget_key: row.widget_key,
      allowed_domains: row.allowed_domains ?? [],
      project_id: row.project_id ?? null,
      agent_id: row.agent_id ?? null,
      instant_callback: Boolean(row.instant_callback),
      calling_hours: {
        start: ch.start || DEFAULT_CALLING_HOURS.start,
        end: ch.end || DEFAULT_CALLING_HOURS.end,
        tz: ch.tz || DEFAULT_CALLING_HOURS.tz,
      },
      appearance: {
        colour: ap.colour || DEFAULT_APPEARANCE.colour,
        title: ap.title || DEFAULT_APPEARANCE.title,
        button: ap.button || DEFAULT_APPEARANCE.button,
      },
      privacy_url: row.privacy_url ?? null,
    };
  });

const saveWidgetSchema = z.object({
  organizationId: z.string().uuid(),
  widget_key: z.string().trim().min(6).max(120),
  allowed_domains: z.array(z.string().trim().min(1).max(200)).max(50),
  project_id: z.string().uuid().nullable(),
  agent_id: z.string().uuid().nullable(),
  instant_callback: z.boolean(),
  calling_hours: z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    tz: z.string().trim().min(1).max(60),
  }),
  appearance: z.object({
    colour: z.string().trim().min(3).max(40),
    title: z.string().trim().min(1).max(80),
    button: z.string().trim().min(1).max(40),
  }),
  privacy_url: z.string().trim().url().nullable().or(z.literal("")),
});

export const saveWidgetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveWidgetSchema.parse(input))
  .handler(async ({ data, context }): Promise<WidgetSettingsData> => {
    const client = asApp(context.supabase);
    await requireAdminRole(client, data.organizationId, context.userId);

    const { data: saved, error } = await client
      .from("widget_settings")
      .upsert(
        {
          organization_id: data.organizationId,
          widget_key: data.widget_key,
          allowed_domains: data.allowed_domains,
          project_id: data.project_id,
          agent_id: data.agent_id,
          instant_callback: data.instant_callback,
          calling_hours: data.calling_hours,
          appearance: data.appearance,
          privacy_url: data.privacy_url ? data.privacy_url : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" }
      )
      .select("*")
      .single();

    if (error || !saved) throw new Error(error?.message ?? "Could not save widget settings");

    return {
      id: saved.id,
      organization_id: saved.organization_id,
      widget_key: saved.widget_key,
      allowed_domains: saved.allowed_domains,
      project_id: saved.project_id,
      agent_id: saved.agent_id,
      instant_callback: saved.instant_callback,
      calling_hours: saved.calling_hours as unknown as WidgetSettingsData["calling_hours"],
      appearance: saved.appearance as unknown as WidgetSettingsData["appearance"],
      privacy_url: saved.privacy_url,
    };
  });

export const regenerateWidgetKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ widget_key: string }> => {
    const client = asApp(context.supabase);
    await requireAdminRole(client, data.organizationId, context.userId);

    const nextKey = generateWidgetKey();
    const { data: existing } = await client
      .from("widget_settings")
      .select("id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    if (existing) {
      const { error } = await client
        .from("widget_settings")
        .update({ widget_key: nextKey, updated_at: new Date().toISOString() })
        .eq("organization_id", data.organizationId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client.from("widget_settings").insert({
        organization_id: data.organizationId,
        widget_key: nextKey,
      });
      if (error) throw new Error(error.message);
    }
    return { widget_key: nextKey };
  });
