// Server-only phone-level Do-Not-Contact registry and append-only compliance audit log.
// Shared contract for one-off calls, campaigns, REST API (#5), WhatsApp (#12), inbound (#19), and widget (#20).
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { asApp, type AppClient, type Json, type TablesUpdate } from "@/lib/supabase";
import { chunk, phoneKey } from "@/lib/campaign-vars";
import {
  toE164,
  validateReactivationReason,
  type ComplianceEvent,
  type DncSource,
} from "@/lib/dnc";

export { toE164, type ComplianceEvent, type DncSource };

export interface BlockNumberInput {
  orgId: string;
  phone: string;
  reason?: string | null;
  source: DncSource;
  callId?: string | null;
  contactId?: string | null;
  actor?: string | null;
  client?: AppClient;
}

export interface UnblockNumberInput {
  orgId: string;
  phone: string;
  reason: string;
  actor?: string | null;
  client?: AppClient;
}

export interface LogBlockedAttemptInput {
  orgId: string;
  phone: string;
  where: string;
  actor?: string | null;
  callId?: string | null;
  contactId?: string | null;
  details?: Record<string, unknown>;
  client?: AppClient;
}

export interface LogConsentInput {
  orgId: string;
  phone?: string | null;
  contactId?: string | null;
  callId?: string | null;
  actor?: string | null;
  details?: Record<string, unknown>;
  client?: AppClient;
}

function getDb(client?: AppClient): AppClient {
  return client ?? asApp(supabaseAdmin);
}

function isMissingTableError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("dnc_numbers") &&
    (msg.includes("does not exist") || msg.includes("could not find"))
  );
}

async function isContactMarkedDncFallback(
  db: AppClient,
  orgId: string,
  e164: string,
): Promise<boolean> {
  const key = phoneKey(e164);
  if (!key) return false;
  try {
    const table = db.from("contacts") as unknown as { select?: unknown };
    if (typeof table?.select !== "function") return false;
    const { data } = await db
      .from("contacts")
      .select("phone, status, tags")
      .eq("organization_id", orgId)
      .ilike("phone", `%${key}%`)
      .limit(20);

    return (data ?? []).some((row) => {
      if (phoneKey(row.phone) !== key) return false;
      return (
        row.status === "inactive" || (Array.isArray(row.tags) && row.tags.includes("do-not-call"))
      );
    });
  } catch {
    return false;
  }
}

async function findMatchingContacts(
  db: AppClient,
  orgId: string,
  e164: string,
): Promise<Array<{ id: string; phone: string | null; status: string; tags: string[] }>> {
  const key = phoneKey(e164);
  if (!key) return [];
  try {
    const table = db.from("contacts") as unknown as { select?: unknown };
    if (typeof table?.select !== "function") return [];
    const { data } = await db
      .from("contacts")
      .select("id, phone, status, tags")
      .eq("organization_id", orgId)
      .ilike("phone", `%${key}%`)
      .limit(20);
    return (data ?? []).filter((row) => phoneKey(row.phone) === key);
  } catch {
    return [];
  }
}

/**
 * Checks whether `phone` has an active Do-Not-Contact block in `orgId` (`removed_at is null`).
 * Normalises every input format to E.164 before querying.
 */
export async function isBlocked(
  orgId: string,
  phone: string,
  client?: AppClient,
): Promise<boolean> {
  const e164 = toE164(phone);
  if (!e164) return false;
  const db = getDb(client);

  try {
    const dncTable = db.from("dnc_numbers") as unknown as { select?: unknown };
    if (typeof dncTable?.select !== "function") {
      return isContactMarkedDncFallback(db, orgId, e164);
    }

    const { data, error } = await db
      .from("dnc_numbers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("phone_e164", e164)
      .is("removed_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return isContactMarkedDncFallback(db, orgId, e164);
      }
      console.error("[dnc] isBlocked query failed:", error.message);
      return isContactMarkedDncFallback(db, orgId, e164);
    }

    return Boolean(data?.id);
  } catch {
    return isContactMarkedDncFallback(db, orgId, e164);
  }
}

/**
 * Loads the set of active blocked E.164 numbers for a batch of candidate phone numbers (used by campaign launch).
 */
export async function getBlockedPhoneSet(
  orgId: string,
  phones: readonly string[],
  client?: AppClient,
): Promise<Set<string>> {
  const uniqueE164 = [
    ...new Set(phones.map((p) => toE164(p)).filter((p): p is string => Boolean(p))),
  ];
  const blocked = new Set<string>();
  if (!uniqueE164.length) return blocked;

  const db = getDb(client);
  for (const batch of chunk(uniqueE164, 500)) {
    const { data, error } = await db
      .from("dnc_numbers")
      .select("phone_e164")
      .eq("organization_id", orgId)
      .is("removed_at", null)
      .in("phone_e164", batch);

    if (error) {
      if (isMissingTableError(error)) {
        for (const e164 of batch) {
          if (await isContactMarkedDncFallback(db, orgId, e164)) blocked.add(e164);
        }
        continue;
      }
      throw new Error(`Could not verify do-not-contact registry: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (row.phone_e164) blocked.add(row.phone_e164);
    }
  }
  return blocked;
}

/**
 * Blocks a phone number in `dnc_numbers`, marks matching contacts inactive + `do-not-call`,
 * and appends an `opt_out` (call) or `blocked` (manual/import) compliance log record.
 */
export async function blockNumber({
  orgId,
  phone,
  reason,
  source,
  callId = null,
  contactId = null,
  actor = null,
  client,
}: BlockNumberInput): Promise<{ id: string; phoneE164: string; alreadyBlocked: boolean }> {
  const e164 = toE164(phone);
  if (!e164) {
    throw new Error("Enter a valid phone number (e.g. +91 98480 12345)");
  }

  const db = getDb(client);
  const logDb = client ?? asApp(supabaseAdmin);
  const trimmedReason = reason?.trim() ? reason.trim().slice(0, 500) : null;
  const now = new Date().toISOString();

  const matches = await findMatchingContacts(db, orgId, e164);
  const resolvedContactId = contactId ?? matches[0]?.id ?? null;

  // Keep matching contact rows marked inactive + tagged do-not-call for backward compatibility.
  for (const contact of matches) {
    const existingTags = Array.isArray(contact.tags) ? contact.tags : [];
    const nextTags = existingTags.includes("do-not-call")
      ? existingTags
      : [...existingTags, "do-not-call"];
    if (contact.status !== "inactive" || nextTags.length !== existingTags.length) {
      await db
        .from("contacts")
        .update({ status: "inactive", tags: nextTags, updated_at: now })
        .eq("id", contact.id);
    }
  }

  const { data: existing, error: lookupError } = await db
    .from("dnc_numbers")
    .select("id, call_id, reason")
    .eq("organization_id", orgId)
    .eq("phone_e164", e164)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not check do-not-contact registry: ${lookupError.message}`);
  }

  let dncId: string;
  let alreadyBlocked = false;

  if (existing?.id) {
    dncId = existing.id;
    alreadyBlocked = true;
    const updates: TablesUpdate<"dnc_numbers"> = {};
    if (trimmedReason && trimmedReason !== existing.reason) updates.reason = trimmedReason;
    if (callId && !existing.call_id) updates.call_id = callId;
    if (Object.keys(updates).length > 0) {
      await db.from("dnc_numbers").update(updates).eq("id", existing.id);
    }
  } else {
    const { data: inserted, error: insertError } = await db
      .from("dnc_numbers")
      .insert({
        organization_id: orgId,
        phone_e164: e164,
        reason: trimmedReason,
        source,
        call_id: callId,
        created_by: actor,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raced } = await db
          .from("dnc_numbers")
          .select("id")
          .eq("organization_id", orgId)
          .eq("phone_e164", e164)
          .is("removed_at", null)
          .limit(1)
          .maybeSingle();
        if (!raced?.id) throw new Error(`Could not block number: ${insertError.message}`);
        dncId = raced.id;
        alreadyBlocked = true;
      } else {
        throw new Error(`Could not block number: ${insertError.message}`);
      }
    } else {
      dncId = inserted.id;
    }
  }

  const event: ComplianceEvent = source === "call" ? "opt_out" : "blocked";
  // Avoid duplicate call opt-out logs if a call webhook is replayed.
  let skipLog = false;
  if (callId) {
    const { data: priorLog } = await logDb
      .from("compliance_log")
      .select("id")
      .eq("organization_id", orgId)
      .eq("call_id", callId)
      .eq("event", event)
      .limit(1)
      .maybeSingle();
    skipLog = Boolean(priorLog?.id);
  }

  if (!skipLog) {
    const details: Record<string, Json> = {
      source,
      ...(trimmedReason ? { reason: trimmedReason } : {}),
      ...(alreadyBlocked ? { already_blocked: true } : {}),
    };
    const { error: logError } = await logDb.from("compliance_log").insert({
      organization_id: orgId,
      phone_e164: e164,
      contact_id: resolvedContactId,
      event,
      actor,
      call_id: callId,
      details,
    });
    if (logError) {
      console.error("[dnc] compliance_log insert failed:", logError.message);
    }
  }

  return { id: dncId, phoneE164: e164, alreadyBlocked };
}

/**
 * Reactivates a blocked phone number (requires a reason of at least 10 chars),
 * restores matching contacts to `active` (removing `do-not-call`), and writes a `reactivated` log row.
 */
export async function unblockNumber({
  orgId,
  phone,
  reason,
  actor = null,
  client,
}: UnblockNumberInput): Promise<{ id: string; phoneE164: string; reactivatedContacts: number }> {
  const reasonError = validateReactivationReason(reason);
  if (reasonError) {
    throw new Error(reasonError);
  }

  const e164 = toE164(phone);
  if (!e164) {
    throw new Error("Enter a valid phone number");
  }

  const db = getDb(client);
  const logDb = client ?? asApp(supabaseAdmin);
  const trimmedReason = reason.trim();
  const now = new Date().toISOString();

  const { data: activeRow, error: findError } = await db
    .from("dnc_numbers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("phone_e164", e164)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`Could not look up blocked number: ${findError.message}`);
  }
  if (!activeRow?.id) {
    throw new Error("This number is not currently on the do-not-contact list.");
  }

  const { error: updateError } = await db
    .from("dnc_numbers")
    .update({
      removed_at: now,
      removed_by: actor,
      removed_reason: trimmedReason,
    })
    .eq("id", activeRow.id)
    .is("removed_at", null);

  if (updateError) {
    throw new Error(`Could not reactivate number: ${updateError.message}`);
  }

  const matches = await findMatchingContacts(db, orgId, e164);
  for (const contact of matches) {
    const nextTags = (Array.isArray(contact.tags) ? contact.tags : []).filter(
      (t) => t !== "do-not-call",
    );
    await db
      .from("contacts")
      .update({ status: "active", tags: nextTags, updated_at: now })
      .eq("id", contact.id);
  }

  const { error: logError } = await logDb.from("compliance_log").insert({
    organization_id: orgId,
    phone_e164: e164,
    contact_id: matches[0]?.id ?? null,
    event: "reactivated",
    actor,
    details: { reason: trimmedReason },
  });
  if (logError) {
    console.error("[dnc] failed to log reactivation:", logError.message);
  }

  return {
    id: activeRow.id,
    phoneE164: e164,
    reactivatedContacts: matches.length,
  };
}

/**
 * Appends a `blocked_attempt` audit row whenever an outbound call or campaign target is refused due to DNC.
 * Best-effort: never throws so it cannot mask the caller's refusal response.
 */
export async function logBlockedAttempt({
  orgId,
  phone,
  where,
  actor = null,
  callId = null,
  contactId = null,
  details = {},
  client,
}: LogBlockedAttemptInput): Promise<void> {
  try {
    const e164 = toE164(phone) ?? phone.trim();
    if (!e164) return;
    const logDb = client ?? asApp(supabaseAdmin);
    const table = logDb.from("compliance_log") as unknown as { insert?: unknown };
    if (typeof table?.insert !== "function") return;

    let resolvedContactId = contactId;
    if (!resolvedContactId) {
      const matches = await findMatchingContacts(logDb, orgId, e164);
      resolvedContactId = matches[0]?.id ?? null;
    }

    const payloadDetails: Record<string, Json> = {
      where,
      ...Object.fromEntries(Object.entries(details).map(([k, v]) => [k, (v ?? null) as Json])),
    };

    const { error } = await logDb.from("compliance_log").insert({
      organization_id: orgId,
      phone_e164: e164,
      contact_id: resolvedContactId,
      event: "blocked_attempt",
      actor,
      call_id: callId,
      details: payloadDetails,
    });
    if (error && !isMissingTableError(error)) {
      console.error("[dnc] logBlockedAttempt failed:", error.message);
    }
  } catch (err) {
    console.error("[dnc] logBlockedAttempt unexpected error:", err);
  }
}

/**
 * Appends a `consent_given` audit row when a caller grants consent during a call (idempotent per callId).
 */
export async function logConsentGiven({
  orgId,
  phone = null,
  contactId = null,
  callId = null,
  actor = null,
  details = {},
  client,
}: LogConsentInput): Promise<void> {
  try {
    const e164 = phone ? (toE164(phone) ?? phone.trim()) : null;
    const logDb = client ?? asApp(supabaseAdmin);
    const table = logDb.from("compliance_log") as unknown as { insert?: unknown; select?: unknown };
    if (typeof table?.insert !== "function") return;

    if (callId && typeof table?.select === "function") {
      const { data: existing } = await logDb
        .from("compliance_log")
        .select("id")
        .eq("organization_id", orgId)
        .eq("call_id", callId)
        .eq("event", "consent_given")
        .limit(1)
        .maybeSingle();
      if (existing?.id) return;
    }

    const payloadDetails: Record<string, Json> = Object.fromEntries(
      Object.entries(details).map(([k, v]) => [k, (v ?? null) as Json]),
    );

    const { error } = await logDb.from("compliance_log").insert({
      organization_id: orgId,
      phone_e164: e164,
      contact_id: contactId,
      event: "consent_given",
      actor,
      call_id: callId,
      details: payloadDetails,
    });
    if (error && !isMissingTableError(error)) {
      console.error("[dnc] logConsentGiven failed:", error.message);
    }
  } catch (err) {
    console.error("[dnc] logConsentGiven unexpected error:", err);
  }
}
