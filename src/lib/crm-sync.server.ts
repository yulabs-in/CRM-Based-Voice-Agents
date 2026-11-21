// Server-only: applies a finished call's outcome to Contacts, Leads, Deals (Sales Pipeline) and Tasks.
// Runs once per call (claimed via calls.crm_synced_at), from the Sarvam webhooks, the Sarvam pull-sync,
// and a background sweep that catches anything missed.
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { asAnswers, humanize } from "@/lib/sarvam-call";
import { phoneKey } from "@/lib/campaign-vars";
import { classifyCallOutcome, nextDealStage, nextLeadStatus, spokenName, type CallVerdict } from "@/lib/crm-outcome";

type CallRow = {
  id: string; organization_id: string; contact_id: string | null; phone: string | null; status: string;
  outcome: string | null; sentiment: string | null; summary: string | null; answers: unknown; crm_synced_at: string | null;
};
type LeadRow = { id: string; status: string; score: number; value: number; name?: string | null };
type ContactRow = { id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null; project_id: string | null };

export type CrmSyncResult = { applied: boolean; verdict?: CallVerdict["kind"]; lead?: string; deal?: string; detail: string };

const nameOf = (contact: ContactRow) => `${contact.first_name} ${contact.last_name ?? ""}`.trim();
const CONTACT_COLUMNS = "id, first_name, last_name, phone, email, project_id";

/** The call's contact; finds one by phone number, or creates it, so leads and deals always have someone attached. */
async function ensureContact(call: CallRow, answers: Record<string, string>): Promise<ContactRow | null> {
  if (call.contact_id) {
    const { data } = await supabaseAdmin.from("contacts").select(CONTACT_COLUMNS).eq("id", call.contact_id).maybeSingle();
    if (data) return withSpokenName(data as ContactRow, answers);
  }
  if (!call.phone) return null;
  const key = phoneKey(call.phone);
  const { data: matches } = await supabaseAdmin.from("contacts").select(CONTACT_COLUMNS)
    .eq("organization_id", call.organization_id).ilike("phone", `%${key}`).order("created_at", { ascending: true }).limit(20);
  let contact = ((matches ?? []) as ContactRow[]).find((row) => phoneKey(row.phone) === key) ?? null;
  if (!contact) {
    const [first, ...rest] = (spokenName(answers) ?? "").split(/\s+/);
    const { data: created, error } = await supabaseAdmin.from("contacts").insert({
      organization_id: call.organization_id, first_name: (first || `Caller ${call.phone.slice(-4)}`).slice(0, 80),
      last_name: rest.join(" ").slice(0, 80) || null, phone: call.phone, source: "AI call", status: "active", owner_id: null,
    } as never).select(CONTACT_COLUMNS).single();
    if (error || !created) throw new Error(`Could not create contact: ${error?.message ?? "unknown"}`);
    contact = created as ContactRow;
  }
  await supabaseAdmin.from("calls").update({ contact_id: contact.id } as never).eq("id", call.id).is("contact_id", null);
  return withSpokenName(contact, answers);
}

/** A placeholder "Caller 1234" contact takes the name the customer gave on the call. Real names are never overwritten. */
async function withSpokenName(contact: ContactRow, answers: Record<string, string>): Promise<ContactRow> {
  const spoken = spokenName(answers);
  if (!spoken || !isPlaceholderName(contact.first_name)) return contact;
  const [first, ...rest] = spoken.split(/\s+/);
  const lastName = rest.join(" ").slice(0, 80) || null;
  await supabaseAdmin.from("contacts").update({ first_name: first!.slice(0, 80), last_name: lastName, updated_at: new Date().toISOString() } as never).eq("id", contact.id);
  return { ...contact, first_name: first!.slice(0, 80), last_name: lastName };
}

const isPlaceholderName = (name: string | null | undefined) => !name || /^Caller \d{3,4}$/.test(name.trim());

/** Applies one finished call to the CRM. Safe to call repeatedly: only the first caller does the work. */
export async function applyCallOutcomeToCrm(callId: string): Promise<CrmSyncResult> {
  const { data } = await supabaseAdmin.from("calls")
    .select("id, organization_id, contact_id, phone, status, outcome, sentiment, summary, answers, crm_synced_at").eq("id", callId).maybeSingle();
  const call = data as CallRow | null;
  if (!call) return { applied: false, detail: "Call not found" };
  if (call.crm_synced_at) return { applied: false, detail: "Already applied" };
  const verdict = classifyCallOutcome(call);
  // Not-connected calls are final for the CRM too (nothing to apply), but completed ones may still be waiting
  // for their answers — leave those unclaimed so a later run sees the disposition.
  if (!verdict) {
    if (call.status !== "completed" && !["queued", "in_progress"].includes(call.status)) {
      await supabaseAdmin.from("calls").update({ crm_synced_at: new Date().toISOString() } as never).eq("id", call.id).is("crm_synced_at", null);
    }
    return { applied: false, detail: "Call did not connect" };
  }

  // Claim the call so the webhook, the pull-sync and the sweep never apply it twice.
  const { data: claimed } = await supabaseAdmin.from("calls").update({ crm_synced_at: new Date().toISOString() } as never)
    .eq("id", call.id).is("crm_synced_at", null).select("id");
  if (!claimed?.length) return { applied: false, detail: "Already applied" };

  try {
    const answers = asAnswers(call.answers);
    const contact = await ensureContact(call, answers);
    if (!contact) return { applied: false, verdict: verdict.kind, detail: "Call has no phone number or contact" };
    const now = new Date().toISOString();
    const org = call.organization_id;
    const displayName = nameOf(contact) || contact.phone || "Lead";

    // ---- Lead
    const { data: leadRows } = await supabaseAdmin.from("leads").select("id, status, score, value, name")
      .eq("organization_id", org).eq("contact_id", contact.id).order("created_at", { ascending: false }).limit(1);
    let lead = leadRows?.[0] as LeadRow | undefined;
    if (!lead && contact.phone) {
      const key = phoneKey(contact.phone);
      const { data: byPhone } = await supabaseAdmin.from("leads").select("id, status, score, value, name, phone")
        .eq("organization_id", org).ilike("phone", `%${key}`).limit(10);
      lead = (byPhone ?? []).find((row) => phoneKey(row.phone) === key) as LeadRow | undefined;
    }
    let leadDetail: string;
    if (lead) {
      const status = nextLeadStatus(lead.status, verdict);
      await supabaseAdmin.from("leads").update({
        status, score: verdict.kind === "negative" ? verdict.score : Math.max(lead.score ?? 0, verdict.score),
        contact_id: contact.id, last_call_id: call.id, updated_at: now,
        ...(isPlaceholderName(lead.name) && !isPlaceholderName(contact.first_name) ? { name: displayName.slice(0, 120) } : {}),
      } as never).eq("id", lead.id);
      leadDetail = lead.status === status ? `Lead stays ${status}` : `Lead ${lead.status} → ${status}`;
    } else if (verdict.kind === "negative" || verdict.kind === "neutral") {
      // Leads are people who want insurance. Not interested / no real conversation stays a contact only.
      leadDetail = "No lead (caller not interested)";
    } else {
      const { data: created, error } = await supabaseAdmin.from("leads").insert({
        organization_id: org, contact_id: contact.id, name: displayName.slice(0, 120), phone: contact.phone, email: contact.email,
        status: verdict.leadStatus, source: "AI call", score: verdict.score, value: 0, owner_id: null, last_call_id: call.id,
      } as never).select("id, status, score, value").single();
      if (error) throw new Error(`Could not create lead: ${error.message}`);
      lead = created as LeadRow;
      leadDetail = `Lead created (${verdict.leadStatus})`;
    }

    // ---- Deal / Sales Pipeline
    let dealDetail = "No deal change";
    let dealId: string | null = null;
    if (verdict.dealStage) {
      const { data: deals } = await supabaseAdmin.from("deals").select("id, stage, probability")
        .eq("organization_id", org).eq("contact_id", contact.id).order("updated_at", { ascending: false }).limit(10);
      const open = (deals ?? []).find((deal) => deal.stage !== "won" && deal.stage !== "lost");
      const reopenable = (deals ?? []).find((deal) => deal.stage === "lost");
      const alreadyWon = (deals ?? []).some((deal) => deal.stage === "won");
      const target = open ?? (verdict.kind !== "negative" ? reopenable : undefined);
      if (target) {
        const stage = nextDealStage(target.stage, verdict);
        dealId = target.id;
        if (stage) {
          await supabaseAdmin.from("deals").update({
            stage, probability: stage === "won" ? 100 : stage === "lost" ? 0 : Math.max(target.probability ?? 0, verdict.probability),
            last_call_id: call.id, updated_at: now,
          } as never).eq("id", target.id);
          dealDetail = `Deal ${target.stage} → ${stage}`;
        } else dealDetail = `Deal stays ${target.stage}`;
      } else if (verdict.kind !== "negative" && !(alreadyWon && verdict.kind !== "won")) {
        const product = answers.insurance_type || answers.product || answers.interest || "";
        const { data: created, error } = await supabaseAdmin.from("deals").insert({
          organization_id: org, contact_id: contact.id,
          title: `${displayName}${product ? ` — ${humanize(product)}` : " — AI call"}`.slice(0, 200),
          stage: verdict.dealStage, probability: verdict.probability, value: Number(lead?.value ?? 0), owner_id: null, last_call_id: call.id,
        } as never).select("id").single();
        if (error) throw new Error(`Could not create deal: ${error.message}`);
        dealId = created?.id ?? null;
        dealDetail = `Deal created in ${verdict.dealStage}`;
      }
      if (verdict.kind === "won" && lead) await supabaseAdmin.from("leads").update({ status: "converted", updated_at: now } as never).eq("id", lead.id);
    }

    // ---- Follow-up task from what the agent agreed with the customer
    const nextAction = (answers.next_action || "").trim();
    const followUp = (answers.follow_up_time || answers.callback_time || "").trim();
    if (verdict.kind === "positive" && (nextAction || followUp)) {
      const task = {
        title: `Follow up with ${displayName}${followUp ? ` — ${followUp}` : ""}`.slice(0, 200),
        description: [nextAction, call.summary].filter(Boolean).join("\n\n").slice(0, 2000) || null,
        due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), priority: "high", deal_id: dealId, updated_at: now,
      };
      // One open AI follow-up per contact: the latest call refreshes it instead of piling up duplicates.
      const { data: openTask } = await supabaseAdmin.from("tasks").select("id")
        .eq("organization_id", org).eq("contact_id", contact.id).eq("status", "open").is("created_by", null)
        .like("title", "Follow up with %").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (openTask) await supabaseAdmin.from("tasks").update(task as never).eq("id", openTask.id);
      else await supabaseAdmin.from("tasks").insert({ ...task, organization_id: org, status: "open", contact_id: contact.id, assignee_id: null, created_by: null } as never);
    }

    return { applied: true, verdict: verdict.kind, lead: leadDetail, deal: dealDetail, detail: `${leadDetail}; ${dealDetail}` };
  } catch (error) {
    // Release the claim so the next sweep retries.
    await supabaseAdmin.from("calls").update({ crm_synced_at: null } as never).eq("id", call.id);
    throw error;
  }
}

/** Background safety net: applies recent finished calls that haven't reached the CRM yet. */
export async function applyPendingCrmOutcomes(organizationId: string, limit = 10): Promise<{ applied: number }> {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin.from("calls").select("id")
    .eq("organization_id", organizationId).eq("status", "completed").is("crm_synced_at", null).gte("created_at", since)
    .order("created_at", { ascending: true }).limit(limit);
  let applied = 0;
  for (const row of data ?? []) {
    const result = await applyCallOutcomeToCrm(row.id).catch((error) => { console.error("[crm] apply failed", row.id, error); return null; });
    if (result?.applied) applied += 1;
  }
  return { applied };
}
