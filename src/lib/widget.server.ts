import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { hashCallbackToken, makeCallbackToken } from "@/lib/sarvam-auth.server";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { isBlocked as isDncBlocked, logBlockedAttempt } from "@/lib/dnc.server";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";
import { asVariableMap, greetingValues, nameVariables, openingLine, phoneKey, resolveVariables } from "@/lib/campaign-vars";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_CALLING_HOURS,
  isOriginAllowed,
  isWithinCallingHours,
  maskPhone,
  nextCallingWindowStart,
  type CallingHours,
  type WidgetAppearance,
} from "@/lib/widget";

export interface WidgetRow {
  id: string;
  organization_id: string;
  widget_key: string;
  allowed_domains: string[];
  project_id: string | null;
  agent_id: string | null;
  instant_callback: boolean;
  calling_hours: CallingHours;
  appearance: WidgetAppearance;
  privacy_url: string | null;
}

// Fixed-window in-memory rate limiters (per server instance).
const ipHits = new Map<string, { count: number; resetAt: number }>();
const keyHits = new Map<string, { count: number; resetAt: number }>();

export function resetWidgetRateLimits(): void {
  ipHits.clear();
  keyHits.clear();
}

export function checkWidgetRateLimit(
  ip: string,
  widgetKey: string,
  now = Date.now()
): { allowed: boolean; reason?: string } {
  const ipEntry = ipHits.get(ip);
  if (!ipEntry || now >= ipEntry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + 60_000 });
  } else if (ipEntry.count >= 5) {
    return { allowed: false, reason: "Too many requests from this IP. Please try again in a minute." };
  } else {
    ipEntry.count += 1;
  }

  const keyEntry = keyHits.get(widgetKey);
  if (!keyEntry || now >= keyEntry.resetAt) {
    keyHits.set(widgetKey, { count: 1, resetAt: now + 3_600_000 });
  } else if (keyEntry.count >= 100) {
    return { allowed: false, reason: "Widget hourly rate limit reached. Please try again later." };
  } else {
    keyEntry.count += 1;
  }

  return { allowed: true };
}

export function normalizeWidgetRow(row: {
  id: string;
  organization_id: string;
  widget_key: string;
  allowed_domains: string[];
  project_id: string | null;
  agent_id: string | null;
  instant_callback: boolean;
  calling_hours: unknown;
  appearance: unknown;
  privacy_url: string | null;
}): WidgetRow {
  const ch = (row.calling_hours ?? {}) as Partial<CallingHours>;
  const ap = (row.appearance ?? {}) as Partial<WidgetAppearance>;
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
}

export async function loadWidgetByKey(
  client: SupabaseClient<Database>,
  widgetKey: string
): Promise<{ widget: WidgetRow; orgName: string } | null> {
  const { data, error } = await client
    .from("widget_settings")
    .select("*")
    .eq("widget_key", widgetKey)
    .maybeSingle();
  if (error || !data) return null;

  const { data: org } = await client
    .from("organizations")
    .select("name")
    .eq("id", data.organization_id)
    .maybeSingle();

  return {
    widget: normalizeWidgetRow(data),
    orgName: org?.name ?? "Our team",
  };
}

/**
 * DNC check using #13's phone-level registry (`dnc_numbers`) plus contact-level fallback:
 * returns true if the normalised phone is in `dnc_numbers` or if any contact with the same
 * phone in the org is `inactive` or carries the `do-not-call` tag.
 */
export async function isBlocked(
  client: SupabaseClient<Database>,
  organizationId: string,
  phone: string
): Promise<boolean> {
  if (await isDncBlocked(organizationId, phone, client)) return true;
  const key = phoneKey(phone);
  if (!key) return false;
  const { data } = await client
    .from("contacts")
    .select("phone, status, tags")
    .eq("organization_id", organizationId)
    .ilike("phone", `%${key}%`)
    .limit(20);

  return (data ?? []).some((row) => {
    if (phoneKey(row.phone) !== key) return false;
    return row.status === "inactive" || (Array.isArray(row.tags) && row.tags.includes("do-not-call"));
  });
}

export function corsHeaders(origin: string | null, methods = "POST, OPTIONS"): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export const WidgetSubmitSchema = z.object({
  key: z.string().trim().min(4).max(120),
  name: z.string().trim().min(1, "Please enter your name").max(120),
  phone: z.string().trim().min(6, "Please enter a valid mobile number").max(40),
  interest: z.string().trim().max(200).optional(),
  consent: z.boolean().optional(),
  company_website: z.string().max(200).optional(),
  renderedAt: z.number().finite().optional(),
});

async function placeWidgetCallbackCall({
  client,
  organizationId,
  agentId,
  contactId,
  phone,
  customerName,
  interest,
  requestOrigin,
}: {
  client: SupabaseClient<Database>;
  organizationId: string;
  agentId: string;
  contactId: string;
  phone: string;
  customerName: string;
  interest?: string;
  requestOrigin?: string;
}): Promise<boolean> {
  const { sarvamJson, workspacePath, publicAppUrl, getOrgSarvamConfig } = await import("@/lib/sarvam.server");

  const { data: agent } = await client
    .from("voice_agents")
    .select("id, status, greeting, greeting_no_name, agent_variables, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!agent || agent.status !== "active") return false;

  const appId = agent.sarvam_agent_id?.trim() || SARVAM_DEFAULTS.agentId;
  const connectionId = agent.sarvam_connection_id?.trim() || SARVAM_DEFAULTS.connectionId;
  const agentPhoneNumber = normalizePhoneNumber(agent.sarvam_agent_phone_number?.trim() || SARVAM_DEFAULTS.callerNumber);
  if (!appId || !connectionId || !agentPhoneNumber) return false;

  const { data: active } = await client
    .from("calls")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .in("status", ["queued", "in_progress"])
    .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();
  if (active) return false;

  const config = await getOrgSarvamConfig(organizationId);
  const webhookUrl = `${publicAppUrl(requestOrigin)}/api/public/sarvam-call-webhook`;

  const extra: Record<string, string> = {
    customer_name: customerName,
    full_name: customerName,
    ...(interest ? { interest } : {}),
  };
  const variableMap = asVariableMap(agent.agent_variables);
  const contactStub = {
    first_name: customerName,
    last_name: null,
    email: null,
    city: null,
    job_title: null,
    custom_fields: interest ? { interest } : {},
  };
  const agentVariables = Object.keys(variableMap).length
    ? {
        ...resolveVariables(contactStub, variableMap),
        ...Object.fromEntries(nameVariables(variableMap).map((n) => [n, customerName])),
        ...(interest ? { interest } : {}),
      }
    : { customer_name: customerName, ...(interest ? { interest } : {}) };

  const greeting = openingLine(agent.greeting, greetingValues(contactStub, extra), agent.greeting_no_name);
  const callbackToken = makeCallbackToken();

  const { data: call, error: insertError } = await client
    .from("calls")
    .insert({
      organization_id: organizationId,
      agent_id: agent.id,
      contact_id: contactId,
      phone,
      direction: "outbound",
      status: "queued",
      sarvam_status: "queued",
      webhook_token_hash: await hashCallbackToken(callbackToken),
      is_test_call: false,
    })
    .select("id")
    .single();
  if (insertError || !call) return false;

  try {
    const payload = await sarvamJson<{ attempt_id?: string }>(
      `/outbounds/v1${workspacePath(config.sarvamOrg, config.workspace)}/outbounds`,
      {
        method: "POST",
        body: {
          app_config: {
            app_id: appId,
            app_version: agent.sarvam_app_version,
            connection_config: { connection_id: connectionId, agent_phone_number: agentPhoneNumber },
            agent_variables: agentVariables,
            app_overrides: { initial_bot_message: greeting },
          },
          user_config: { user_phone_number: phone },
          webhook_config: { url: webhookUrl, metadata: { call_id: call.id, callback_token: callbackToken } },
        },
      }
    );
    if (!payload.attempt_id) {
      throw new Error("Missing attempt_id from Sarvam");
    }
    await client
      .from("calls")
      .update({ external_id: payload.attempt_id, status: "in_progress", sarvam_status: "dialing" })
      .eq("id", call.id);
    return true;
  } catch (err) {
    console.warn("[widget] Instant callback failed for", maskPhone(phone), err instanceof Error ? err.message : err);
    await client
      .from("calls")
      .update({
        status: "failed",
        sarvam_status: "failed",
        sarvam_failure_reason: err instanceof Error ? err.message : "Callback failed",
      })
      .eq("id", call.id);
    return false;
  }
}

export interface WidgetSubmitResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Processes a public widget submission: validates origin, rate limits, spam checks,
 * normalizes phone, upserts contact, and triggers instant AI callback (or schedules task).
 */
export async function handleWidgetSubmit({
  client,
  input,
  origin,
  referer,
  ip,
  requestOrigin,
  now = new Date(),
}: {
  client: SupabaseClient<Database>;
  input: unknown;
  origin: string | null;
  referer: string | null;
  ip: string;
  requestOrigin?: string;
  now?: Date;
}): Promise<WidgetSubmitResult> {
  const parsed = WidgetSubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.issues[0]?.message ?? "Invalid submission" } };
  }
  const data = parsed.data;

  const found = await loadWidgetByKey(client, data.key);
  if (!found) {
    return { status: 403, body: { error: "Origin not allowed" } };
  }
  const { widget } = found;

  if (!isOriginAllowed(origin, widget.allowed_domains)) {
    return { status: 403, body: { error: "Origin not allowed" } };
  }

  // Honeypot or too-fast bot check: pretend success and drop silently.
  if (data.company_website?.trim()) {
    return { status: 200, body: { ok: true, callback: "none" } };
  }
  if (typeof data.renderedAt === "number" && now.getTime() - data.renderedAt < 3000) {
    return { status: 200, body: { ok: true, callback: "none" } };
  }

  const limit = checkWidgetRateLimit(ip, widget.widget_key, now.getTime());
  if (!limit.allowed) {
    return { status: 429, body: { error: limit.reason } };
  }

  const normalizedPhone = normalizePhoneNumber(data.phone);
  if (!normalizedPhone) {
    return { status: 400, body: { error: "Please enter a valid mobile number" } };
  }

  const nameParts = data.name.trim().split(/\s+/);
  const firstName = nameParts[0] || data.name.trim();
  const lastName = nameParts.slice(1).join(" ") || null;
  const key = phoneKey(normalizedPhone);

  // Match existing contact by normalized phone in this org.
  const { data: existingRows } = await client
    .from("contacts")
    .select("id, phone, tags, custom_fields, project_id")
    .eq("organization_id", widget.organization_id)
    .ilike("phone", `%${key}%`)
    .limit(20);

  const existing = (existingRows ?? []).find((row) => phoneKey(row.phone) === key);
  const customFields: Record<string, unknown> = {
    ...((existing?.custom_fields as Record<string, unknown> | null) ?? {}),
    ...(data.interest ? { interest: data.interest } : {}),
    ...(referer ? { source_url: referer } : {}),
  };

  let contactId: string;
  if (existing) {
    const nextTags = Array.from(new Set([...(existing.tags ?? []), "website-widget"]));
    await client
      .from("contacts")
      .update({
        first_name: firstName,
        ...(lastName ? { last_name: lastName } : {}),
        ...(widget.project_id && !existing.project_id ? { project_id: widget.project_id } : {}),
        tags: nextTags,
        custom_fields: customFields as Database["public"]["Tables"]["contacts"]["Update"]["custom_fields"],
        updated_at: now.toISOString(),
      })
      .eq("id", existing.id);
    contactId = existing.id;
  } else {
    const { data: created, error: createError } = await client
      .from("contacts")
      .insert({
        organization_id: widget.organization_id,
        project_id: widget.project_id,
        first_name: firstName,
        last_name: lastName,
        phone: normalizedPhone,
        tags: ["website-widget"],
        custom_fields: customFields as Database["public"]["Tables"]["contacts"]["Insert"]["custom_fields"],
      })
      .select("id")
      .single();
    if (createError || !created) {
      return { status: 500, body: { error: "Could not save your enquiry. Please try again." } };
    }
    contactId = created.id;
  }

  // Instant callback only when enabled, consent ticked, and not blocked.
  let callback: "now" | "scheduled" | "none" = "none";
  if (widget.instant_callback && data.consent === true) {
    const blocked = await isBlocked(client, widget.organization_id, normalizedPhone);
    if (blocked) {
      await logBlockedAttempt({
        orgId: widget.organization_id,
        phone: normalizedPhone,
        where: "lead_widget",
        contactId,
        client,
      });
    } else {
      if (!isWithinCallingHours(widget.calling_hours, now)) {
        const due = nextCallingWindowStart(widget.calling_hours, now);
        await client.from("tasks").insert({
          organization_id: widget.organization_id,
          contact_id: contactId,
          title: `Call back ${data.name.trim()}`,
          description: data.interest ? `Website widget enquiry: ${data.interest}` : "Website widget enquiry",
          due_at: due.toISOString(),
          priority: "high",
          status: "open",
        });
        callback = "scheduled";
      } else if (widget.agent_id) {
        const placed = await placeWidgetCallbackCall({
          client,
          organizationId: widget.organization_id,
          agentId: widget.agent_id,
          contactId,
          phone: normalizedPhone,
          customerName: data.name.trim(),
          interest: data.interest,
          requestOrigin,
        });
        callback = placed ? "now" : "scheduled";
        if (!placed) {
          await client.from("tasks").insert({
            organization_id: widget.organization_id,
            contact_id: contactId,
            title: `Call back ${data.name.trim()}`,
            description: "Website widget enquiry (instant call could not be placed automatically)",
            due_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
            priority: "high",
            status: "open",
          });
        }
      }
    }
  }

  return { status: 200, body: { ok: true, callback } };
}
