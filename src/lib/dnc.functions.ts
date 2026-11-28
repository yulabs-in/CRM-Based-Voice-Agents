import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asApp, type AppClient } from "@/lib/supabase";
import { canWrite, isAdmin, type OrgRole } from "@/lib/org";
import { phoneKey } from "@/lib/campaign-vars";
import {
  COMPLIANCE_EVENTS,
  COMPLIANCE_EVENT_LABELS,
  DNC_SOURCES,
  DND_IMPORT_BATCH_SIZE,
  MAX_REASON_LENGTH,
  MIN_REACTIVATION_REASON_LENGTH,
  formatComplianceDetails,
  maskDncPhone,
  toE164,
  type ComplianceEvent,
  type DncSource,
} from "@/lib/dnc";

async function requireMemberRole(
  client: AppClient,
  organizationId: string,
  userId: string,
): Promise<OrgRole> {
  const { data, error } = await client
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("You do not have access to this workspace");
  return data.role;
}

export interface DncRegistryItem {
  id: string;
  phoneDisplay: string;
  phoneE164: string | null; // null for non-admins so full numbers never leave the server
  contactId: string | null;
  contactName: string | null;
  reason: string | null;
  source: DncSource;
  callId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface DncRegistryStats {
  totalActive: number;
  fromCalls: number;
  fromManual: number;
  fromImport: number;
  blockedAttempts: number;
}

export interface DncRegistryResponse {
  items: DncRegistryItem[];
  stats: DncRegistryStats;
  isAdmin: boolean;
  canWrite: boolean;
}

export const listDncRegistry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        search: z.string().trim().max(120).optional(),
        source: z.enum(["all", "call", "manual", "import"]).default("all"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<DncRegistryResponse> => {
    const userClient = asApp(context.supabase);
    const role = await requireMemberRole(userClient, data.organizationId, context.userId);
    const adminView = isAdmin(role);
    const writer = canWrite(role);

    const [activeRes, attemptsRes] = await Promise.all([
      userClient
        .from("dnc_numbers")
        .select("id, phone_e164, reason, source, call_id, created_by, created_at")
        .eq("organization_id", data.organizationId)
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .limit(5000),
      userClient
        .from("compliance_log")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId)
        .eq("event", "blocked_attempt"),
    ]);

    // Graceful empty response if migration 0034 has not been applied on the shared DB yet.
    if (activeRes.error) {
      const code = activeRes.error.code ?? "";
      if (
        code === "42P01" ||
        code === "PGRST205" ||
        activeRes.error.message.includes("dnc_numbers")
      ) {
        return {
          items: [],
          stats: { totalActive: 0, fromCalls: 0, fromManual: 0, fromImport: 0, blockedAttempts: 0 },
          isAdmin: adminView,
          canWrite: writer,
        };
      }
      throw new Error(activeRes.error.message);
    }

    const allRows = activeRes.data ?? [];
    const stats: DncRegistryStats = {
      totalActive: allRows.length,
      fromCalls: allRows.filter((r) => r.source === "call").length,
      fromManual: allRows.filter((r) => r.source === "manual").length,
      fromImport: allRows.filter((r) => r.source === "import").length,
      blockedAttempts: attemptsRes.count ?? 0,
    };

    const actorIds = [
      ...new Set(allRows.map((r) => r.created_by).filter((id): id is string => Boolean(id))),
    ];
    const [profilesRes, contactsRes] = await Promise.all([
      actorIds.length
        ? userClient.from("profiles").select("id, full_name, email").in("id", actorIds)
        : Promise.resolve({ data: [], error: null }),
      allRows.length
        ? userClient
            .from("contacts")
            .select("id, first_name, last_name, phone")
            .eq("organization_id", data.organizationId)
            .not("phone", "is", null)
            .limit(10000)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const profileMap = new Map<string, string>();
    for (const p of profilesRes.data ?? []) {
      profileMap.set(p.id, (p.full_name || p.email || "Team member").trim());
    }

    const contactByKey = new Map<string, { id: string; name: string }>();
    for (const c of contactsRes.data ?? []) {
      const key = phoneKey(c.phone);
      if (!key || contactByKey.has(key)) continue;
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      if (name) contactByKey.set(key, { id: c.id, name });
    }

    const q = (data.search ?? "").trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    const filtered = allRows.filter((row) => {
      if (data.source !== "all" && row.source !== data.source) return false;
      if (!q) return true;
      const key = phoneKey(row.phone_e164);
      const contact = key ? contactByKey.get(key) : undefined;
      const actorName = row.created_by ? (profileMap.get(row.created_by) ?? "") : "";
      if (row.phone_e164.toLowerCase().includes(q)) return true;
      if (qDigits.length >= 2 && row.phone_e164.replace(/\D/g, "").includes(qDigits)) return true;
      if (contact?.name.toLowerCase().includes(q)) return true;
      if ((row.reason ?? "").toLowerCase().includes(q)) return true;
      if (actorName.toLowerCase().includes(q)) return true;
      return false;
    });

    const items: DncRegistryItem[] = filtered.map((row) => {
      const key = phoneKey(row.phone_e164);
      const contact = key ? contactByKey.get(key) : undefined;
      const src = DNC_SOURCES.includes(row.source as DncSource)
        ? (row.source as DncSource)
        : "manual";
      return {
        id: row.id,
        phoneDisplay: maskDncPhone(row.phone_e164, adminView),
        phoneE164: adminView ? row.phone_e164 : null,
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? null,
        reason: row.reason,
        source: src,
        callId: row.call_id,
        createdBy: row.created_by,
        createdByName: row.created_by ? (profileMap.get(row.created_by) ?? "Team member") : null,
        createdAt: row.created_at,
      };
    });

    return {
      items,
      stats,
      isAdmin: adminView,
      canWrite: writer,
    };
  });

export const addDncNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        phone: z.string().trim().min(6).max(40),
        reason: z.string().trim().min(2, "Enter a brief reason").max(MAX_REASON_LENGTH),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const userClient = asApp(context.supabase);
    const role = await requireMemberRole(userClient, data.organizationId, context.userId);
    if (!canWrite(role)) {
      throw new Error("You do not have permission to add numbers to the do-not-contact list");
    }
    const { blockNumber } = await import("@/lib/dnc.server");
    return blockNumber({
      orgId: data.organizationId,
      phone: data.phone,
      reason: data.reason,
      source: "manual",
      actor: context.userId,
    });
  });

export const reactivateDncNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        dncId: z.string().uuid(),
        reason: z
          .string()
          .trim()
          .min(
            MIN_REACTIVATION_REASON_LENGTH,
            `Enter a reason of at least ${MIN_REACTIVATION_REASON_LENGTH} characters`,
          )
          .max(MAX_REASON_LENGTH),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const userClient = asApp(context.supabase);
    const role = await requireMemberRole(userClient, data.organizationId, context.userId);
    if (!isAdmin(role)) {
      throw new Error("Only workspace owners and admins can reactivate do-not-contact numbers");
    }

    const { data: row, error } = await userClient
      .from("dnc_numbers")
      .select("id, phone_e164, removed_at")
      .eq("id", data.dncId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    if (error || !row) {
      throw new Error("Blocked number entry not found in this workspace");
    }
    if (row.removed_at) {
      throw new Error("This number has already been reactivated");
    }

    const { unblockNumber } = await import("@/lib/dnc.server");
    return unblockNumber({
      orgId: data.organizationId,
      phone: row.phone_e164,
      reason: data.reason,
      actor: context.userId,
    });
  });

export const importDncNumbersBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        phones: z.array(z.string().trim().min(4).max(40)).min(1).max(DND_IMPORT_BATCH_SIZE),
        reason: z.string().trim().max(MAX_REASON_LENGTH).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ added: number; alreadyBlocked: number; invalid: number }> => {
      const userClient = asApp(context.supabase);
      const role = await requireMemberRole(userClient, data.organizationId, context.userId);
      if (!isAdmin(role)) {
        throw new Error("Only workspace owners and admins can bulk-import DND lists");
      }

      const normalized = new Set<string>();
      let invalid = 0;
      for (const raw of data.phones) {
        const e164 = toE164(raw);
        if (!e164) invalid += 1;
        else normalized.add(e164);
      }

      const phones = [...normalized];
      if (!phones.length) return { added: 0, alreadyBlocked: 0, invalid };

      const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
      const adminDb = asApp(supabaseAdmin);
      const reasonText = data.reason?.trim() || "Imported from DND list";

      const { data: existingRows, error: existingErr } = await adminDb
        .from("dnc_numbers")
        .select("phone_e164")
        .eq("organization_id", data.organizationId)
        .is("removed_at", null)
        .in("phone_e164", phones);

      if (existingErr) throw new Error(existingErr.message);

      const existingSet = new Set((existingRows ?? []).map((r) => r.phone_e164));
      const toInsert = phones.filter((p) => !existingSet.has(p));
      const alreadyBlocked = phones.length - toInsert.length;

      if (toInsert.length > 0) {
        const { error: insertErr } = await adminDb.from("dnc_numbers").insert(
          toInsert.map((phone_e164) => ({
            organization_id: data.organizationId,
            phone_e164,
            reason: reasonText,
            source: "import",
            created_by: context.userId,
          })),
        );
        if (insertErr) throw new Error(insertErr.message);

        await adminDb.from("compliance_log").insert(
          toInsert.map((phone_e164) => ({
            organization_id: data.organizationId,
            phone_e164,
            event: "blocked",
            actor: context.userId,
            details: { source: "import", reason: reasonText },
          })),
        );
      }

      return {
        added: toInsert.length,
        alreadyBlocked,
        invalid,
      };
    },
  );

export interface ComplianceLogItem {
  id: string;
  event: ComplianceEvent;
  phoneDisplay: string;
  contactId: string | null;
  contactName: string | null;
  actorId: string | null;
  actorName: string;
  callId: string | null;
  detailsText: string;
  createdAt: string;
}

export interface ComplianceLogResponse {
  items: ComplianceLogItem[];
  total: number;
  isAdmin: boolean;
}

const logFilterSchema = z.object({
  organizationId: z.string().uuid(),
  event: z.enum(["all", ...COMPLIANCE_EVENTS]).default("all"),
  fromDate: z.string().trim().max(30).optional(),
  toDate: z.string().trim().max(30).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(10000).default(200),
});

async function queryComplianceItems(
  db: AppClient,
  organizationId: string,
  adminView: boolean,
  filters: z.infer<typeof logFilterSchema>,
): Promise<{ items: ComplianceLogItem[]; total: number }> {
  let query = db
    .from("compliance_log")
    .select("id, phone_e164, contact_id, event, actor, call_id, details, created_at", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(filters.limit);

  if (filters.event !== "all") {
    query = query.eq("event", filters.event);
  }
  if (filters.fromDate) {
    const start = new Date(`${filters.fromDate}T00:00:00+05:30`);
    if (!Number.isNaN(start.getTime())) query = query.gte("created_at", start.toISOString());
  }
  if (filters.toDate) {
    const end = new Date(`${filters.toDate}T23:59:59.999+05:30`);
    if (!Number.isNaN(end.getTime())) query = query.lte("created_at", end.toISOString());
  }

  const { data: rows, count, error } = await query;
  if (error) {
    const code = error.code ?? "";
    if (code === "42P01" || code === "PGRST205" || error.message.includes("compliance_log")) {
      return { items: [], total: 0 };
    }
    throw new Error(error.message);
  }

  const list = rows ?? [];
  const actorIds = [...new Set(list.map((r) => r.actor).filter((id): id is string => Boolean(id)))];
  const contactIds = [
    ...new Set(list.map((r) => r.contact_id).filter((id): id is string => Boolean(id))),
  ];

  const [profilesRes, contactsRes] = await Promise.all([
    actorIds.length
      ? db.from("profiles").select("id, full_name, email").in("id", actorIds)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length
      ? db
          .from("contacts")
          .select("id, first_name, last_name")
          .eq("organization_id", organizationId)
          .in("id", contactIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const profileMap = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    profileMap.set(p.id, (p.full_name || p.email || "Team member").trim());
  }

  const contactMap = new Map<string, string>();
  for (const c of contactsRes.data ?? []) {
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (name) contactMap.set(c.id, name);
  }

  const q = (filters.search ?? "").trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");

  const mapped: ComplianceLogItem[] = [];
  for (const row of list) {
    const ev = COMPLIANCE_EVENTS.includes(row.event as ComplianceEvent)
      ? (row.event as ComplianceEvent)
      : "blocked";
    const contactName = row.contact_id ? (contactMap.get(row.contact_id) ?? null) : null;
    const actorName = row.actor
      ? (profileMap.get(row.actor) ?? "Team member")
      : ev === "opt_out" || ev === "consent_given"
        ? "Caller (AI call)"
        : "System";
    const detailsObj =
      row.details && typeof row.details === "object" && !Array.isArray(row.details)
        ? (row.details as Record<string, unknown>)
        : {};
    const detailsText = formatComplianceDetails(ev, detailsObj);

    if (q) {
      const rawPhone = row.phone_e164 ?? "";
      const matchesPhone =
        rawPhone.toLowerCase().includes(q) ||
        (qDigits.length >= 2 && rawPhone.replace(/\D/g, "").includes(qDigits));
      const matchesText =
        (contactName ?? "").toLowerCase().includes(q) ||
        actorName.toLowerCase().includes(q) ||
        detailsText.toLowerCase().includes(q) ||
        COMPLIANCE_EVENT_LABELS[ev].toLowerCase().includes(q);
      if (!matchesPhone && !matchesText) continue;
    }

    mapped.push({
      id: row.id,
      event: ev,
      phoneDisplay: maskDncPhone(row.phone_e164, adminView),
      contactId: row.contact_id,
      contactName,
      actorId: row.actor,
      actorName,
      callId: row.call_id,
      detailsText,
      createdAt: row.created_at,
    });
  }

  return {
    items: mapped,
    total: q ? mapped.length : (count ?? mapped.length),
  };
}

export const listComplianceLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => logFilterSchema.parse(input))
  .handler(async ({ data, context }): Promise<ComplianceLogResponse> => {
    const userClient = asApp(context.supabase);
    const role = await requireMemberRole(userClient, data.organizationId, context.userId);
    const adminView = isAdmin(role);
    const { items, total } = await queryComplianceItems(
      userClient,
      data.organizationId,
      adminView,
      data,
    );
    return { items, total, isAdmin: adminView };
  });

export interface ComplianceCsvRow {
  timestamp_ist: string;
  timestamp_utc: string;
  event: string;
  event_code: string;
  phone: string;
  contact_name: string;
  actor: string;
  call_id: string;
  details: string;
}

export const exportComplianceLogCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => logFilterSchema.omit({ limit: true }).parse(input))
  .handler(async ({ data, context }): Promise<{ rows: ComplianceCsvRow[] }> => {
    const userClient = asApp(context.supabase);
    const role = await requireMemberRole(userClient, data.organizationId, context.userId);
    const adminView = isAdmin(role);
    const { items } = await queryComplianceItems(userClient, data.organizationId, adminView, {
      ...data,
      limit: 10000,
    });

    const rows: ComplianceCsvRow[] = items.map((item) => ({
      timestamp_ist: new Date(item.createdAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      timestamp_utc: item.createdAt,
      event: COMPLIANCE_EVENT_LABELS[item.event],
      event_code: item.event,
      phone: item.phoneDisplay === "—" ? "" : item.phoneDisplay,
      contact_name: item.contactName ?? "",
      actor: item.actorName,
      call_id: item.callId ?? "",
      details: item.detailsText,
    }));

    return { rows };
  });
