import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { asAnswers } from "@/lib/sarvam-call";
import { type CallVerdict } from "@/lib/crm-outcome";
import { isOutsideBusinessHoursIst, parseFollowUpTime } from "@/lib/parse-followup-time";

export interface BookingCallInput {
  id: string;
  organization_id: string;
  ended_at: string | null;
  summary: string | null;
  answers: unknown;
}

export interface BookingContactInput {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

interface AssignmentConfig {
  mode?: string;
  role?: string;
}

/**
 * Picks the meeting owner:
 * 1. The deal's owner if set and still a member of the organization.
 * 2. Otherwise round-robin among members with the configured role (default `sales_rep`),
 *    picking whoever has the fewest scheduled meetings in the next 7 days (ties broken by name).
 */
export async function pickOwner(orgId: string, dealOwnerId?: string | null): Promise<string | null> {
  const { data: members } = await supabaseAdmin
    .from("memberships")
    .select("user_id, role")
    .eq("organization_id", orgId);

  const memberList = members ?? [];
  if (dealOwnerId && memberList.some((m) => m.user_id === dealOwnerId)) {
    return dealOwnerId;
  }

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("meeting_assignment")
    .eq("id", orgId)
    .maybeSingle();

  const config = ((org?.meeting_assignment ?? {}) as AssignmentConfig);
  const targetRole = config.role || "sales_rep";

  const eligible = memberList.filter((m) => m.role === targetRole);
  if (eligible.length === 0) return null;

  const eligibleIds = eligible.map((m) => m.user_id);
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [{ data: upcoming }, { data: profiles }] = await Promise.all([
    supabaseAdmin
      .from("meetings")
      .select("owner_id")
      .eq("organization_id", orgId)
      .in("owner_id", eligibleIds)
      .neq("status", "cancelled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", in7Days.toISOString()),
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", eligibleIds),
  ]);

  const counts = new Map<string, number>(eligibleIds.map((id) => [id, 0]));
  for (const m of upcoming ?? []) {
    if (m.owner_id && counts.has(m.owner_id)) {
      counts.set(m.owner_id, (counts.get(m.owner_id) ?? 0) + 1);
    }
  }

  const names = new Map<string, string>();
  for (const p of profiles ?? []) {
    names.set(p.id, (p.full_name || p.email || p.id).toLowerCase());
  }

  const sorted = [...eligibleIds].sort((a, b) => {
    const diff = (counts.get(a) ?? 0) - (counts.get(b) ?? 0);
    if (diff !== 0) return diff;
    const nameDiff = (names.get(a) ?? a).localeCompare(names.get(b) ?? b);
    return nameDiff !== 0 ? nameDiff : a.localeCompare(b);
  });

  return sorted[0] ?? null;
}

/** Where each agent puts the time it agreed with the caller, most specific first. */
export const BOOKING_TIME_KEYS = [
  "site_visit_time",
  "appointment_time",
  "counselling_time",
  "consultation_time",
  "preferred_slot",
  "reservation_date",
  "follow_up_time",
  "callback_time",
] as const;

export function bookingTime(answers: Record<string, string>): string {
  for (const key of BOOKING_TIME_KEYS) {
    const value = (answers[key] || "").trim();
    if (value) return value;
  }
  return "";
}

export type BookingKind = { label: string; inPerson: boolean };

/**
 * What kind of meeting (if any) a finished call asks for, across every agent:
 * a booked consultation, site visit, test drive, counselling session, vehicle service, hospital appointment
 * or reservation, a callback with a time, or any positive call where the caller agreed a time with the agent.
 */
export function bookingKind(disposition: string, verdictKind: CallVerdict["kind"], hasTime: boolean): BookingKind | null {
  const d = disposition.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\bcancell?ed\b/.test(d)) return null;
  if (/\bconsultation\b/.test(d)) return { label: "Consultation", inPerson: false };
  if (/\bsite visit\b/.test(d)) return { label: "Site visit", inPerson: true };
  if (/\btest drive\b/.test(d)) return { label: "Test drive", inPerson: true };
  if (/\bcounsell?ing\b/.test(d)) return { label: "Counselling session", inPerson: false };
  if (/\bservice booked\b/.test(d)) return { label: "Vehicle service", inPerson: true };
  if (/\bappointment (requested|rescheduled)\b/.test(d)) return { label: "Appointment", inPerson: true };
  if (/\breservation requested\b/.test(d)) return { label: "Reservation", inPerson: true };
  if (!hasTime) return null;
  if (/\b(callback|call back)\b/.test(d)) return { label: "Call back", inPerson: false };
  if (verdictKind === "positive" || verdictKind === "won") return { label: "Advisor call", inPerson: false };
  return null;
}

/**
 * Books a meeting in IST for any call where the caller agreed a time with the agent (see bookingKind).
 * Idempotent on `call_id`. A time more than an hour in the past (e.g. when an old call is re-synced)
 * isn't booked.
 */
export async function maybeBookConsultation(
  call: BookingCallInput,
  contact: BookingContactInput,
  dealId: string | null,
  verdict: CallVerdict,
  dealOwnerId?: string | null
): Promise<{ booked: boolean; taskCreated: boolean }> {
  const answers = asAnswers(call.answers);
  const disposition = answers.disposition || answers.outcome || verdict.label || "";
  const rawTime = bookingTime(answers);
  const kind = bookingKind(disposition, verdict.kind, rawTime.length > 0);
  if (!kind) {
    return { booked: false, taskCreated: false };
  }

  const orgId = call.organization_id;
  const displayName =
    `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() ||
    contact.phone ||
    "Caller";
  const reference = call.ended_at ? new Date(call.ended_at) : new Date();
  const parsed = rawTime ? parseFollowUpTime(rawTime, reference) : null;
  const ownerId = await pickOwner(orgId, dealOwnerId);

  if (parsed && parsed.start.getTime() < Date.now() - 3600 * 1000) {
    return { booked: false, taskCreated: false };
  }

  if (parsed) {
    const outsideHours = isOutsideBusinessHoursIst(parsed.start);
    const noteParts = [
      call.summary?.trim() || null,
      rawTime ? `Caller requested: "${rawTime}" (${parsed.confidence})` : null,
      outsideHours ? "Outside business hours" : null,
    ].filter(Boolean);

    const location = (answers.consultation_mode || (kind.inPerson ? "in person" : "phone")).trim() || "phone";

    const { data: inserted, error } = await supabaseAdmin
      .from("meetings")
      .upsert(
        {
          organization_id: orgId,
          contact_id: contact.id,
          deal_id: dealId,
          owner_id: ownerId,
          call_id: call.id,
          source: "call",
          title: `${kind.label}: ${displayName}`.slice(0, 200),
          starts_at: parsed.start.toISOString(),
          duration_minutes: 30,
          location,
          status: "scheduled",
          notes: noteParts.join("\n\n").slice(0, 2000) || null,
        } as never,
        { onConflict: "call_id", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Could not create consultation meeting: ${error.message}`);
    }

    if (inserted && !ownerId) {
      await supabaseAdmin.from("tasks").insert({
        organization_id: orgId,
        title: `Assign consultation: ${displayName}`.slice(0, 200),
        description: `No eligible advisor was available for automatic assignment. Meeting starts at ${parsed.start.toISOString()}.`,
        due_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
        priority: "high",
        status: "open",
        contact_id: contact.id,
        deal_id: dealId,
        assignee_id: null,
        created_by: null,
      } as never);
    }

    return { booked: Boolean(inserted), taskCreated: Boolean(inserted && !ownerId) };
  }

  // Unparseable or missing time -> create a task to confirm time instead of guessing wildly
  const title = rawTime
    ? `Confirm consultation time with ${displayName} (said: '${rawTime}')`.slice(0, 200)
    : `Confirm consultation time with ${displayName}`.slice(0, 200);

  const { data: existingTask } = await supabaseAdmin
    .from("tasks")
    .select("id")
    .eq("organization_id", orgId)
    .eq("contact_id", contact.id)
    .eq("status", "open")
    .is("created_by", null)
    .like("title", "Confirm consultation time with %")
    .limit(1)
    .maybeSingle();

  if (!existingTask) {
    await supabaseAdmin.from("tasks").insert({
      organization_id: orgId,
      title,
      description: [rawTime ? `Unparsed time: "${rawTime}"` : null, call.summary]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 2000) || null,
      due_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      priority: "high",
      status: "open",
      contact_id: contact.id,
      deal_id: dealId,
      assignee_id: ownerId,
      created_by: null,
    } as never);
    return { booked: false, taskCreated: true };
  }

  return { booked: false, taskCreated: false };
}
