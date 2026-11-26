// Pure per-agent outcome rules: resolve a finished call against an agent's custom disposition mapping.
// No I/O here so it's easy to test and safe to share between server sync and UI.
import { classifyCallOutcome, isDoNotContact, type CallVerdict } from "@/lib/crm-outcome";
import { asAnswers } from "@/lib/sarvam-call";

export type OutcomeRule = {
  disposition: string;
  lead_status: CallVerdict["leadStatus"] | null;
  deal_stage: CallVerdict["dealStage"];
  probability: number | null;
  create_lead: boolean;
  create_task: boolean;
  block_contact: boolean;
};

/** Verdict plus the per-rule flags that control CRM side effects. */
export type ResolvedVerdict = CallVerdict & {
  createLead: boolean;
  createTask: boolean;
  blockContact: boolean;
};

/** Dispositions shown in the settings UI (in display order). */
export const DEFAULT_DISPOSITIONS = [
  "interested",
  "consultation_booked",
  "callback",
  "quote_requested",
  "not_interested",
  "do_not_contact",
  "wrong_number",
  "escalated",
  "no_answer",
] as const;

export type DefaultDisposition = (typeof DEFAULT_DISPOSITIONS)[number];

export const normDisposition = (text: string) =>
  text.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

/** Build the rule today's classifier would produce, so "Reset to defaults" equals current behaviour. */
export function defaultRuleFor(disposition: string): OutcomeRule {
  const verdict = classifyCallOutcome({ status: "completed", answers: { disposition } });
  const label = normDisposition(disposition);
  // Non-connected-like dispositions (e.g. no_answer, escalated) classify as neutral with no deal.
  const base = verdict ?? { kind: "neutral" as const, label, leadStatus: "contacted" as const, dealStage: null, probability: 0, score: 30 };
  const block = isDoNotContact(label) || /do not contact/.test(label);
  return {
    disposition: label,
    lead_status: base.leadStatus,
    deal_stage: base.dealStage,
    probability: base.probability,
    create_lead: createsLead(base),
    create_task: base.kind === "positive" || base.kind === "won",
    block_contact: block,
  };
}

/** Outcomes where nobody really talked to the agent: no answer, busy, voicemail, dropped, or no disposition at all. */
const NOT_A_CONVERSATION = /\b(no answer|no response|unresponsive|voicemail|busy|disconnected|call dropped|connected)\b/;

/**
 * Every real conversation with any agent lands on the Leads page: positive ones as qualified, service and
 * support calls (hospital, e-commerce, hotel, loan…) and escalations as contacted. Not interested, do-not-call,
 * wrong person and calls where nobody really spoke create no new lead (an existing lead is still updated).
 */
export function createsLead(verdict: Pick<CallVerdict, "kind" | "label">): boolean {
  if (verdict.kind === "negative") return false;
  return !NOT_A_CONVERSATION.test(verdict.label);
}

const toResolved = (verdict: CallVerdict, rule?: OutcomeRule | null): ResolvedVerdict => {
  const base: ResolvedVerdict = {
    ...verdict,
    createLead: createsLead(verdict),
    createTask: verdict.kind === "positive" || verdict.kind === "won",
    blockContact: isDoNotContact(verdict.label),
  };
  if (!rule) return base;
  return {
    ...verdict,
    leadStatus: rule.lead_status ?? verdict.leadStatus,
    dealStage: rule.deal_stage,
    probability: rule.probability ?? verdict.probability,
    createLead: rule.create_lead,
    createTask: rule.create_task,
    blockContact: rule.block_contact,
  };
};

/**
 * Resolve a finished call against an agent's custom rules.
 * - null rules or no matching rule => identical to today's classifyCallOutcome + default flags.
 * - A non-connected call returns null, even when rules exist.
 */
export function resolveVerdict(
  input: { status: string | null; outcome?: string | null; sentiment?: string | null; summary?: string | null; answers?: unknown },
  rules: OutcomeRule[] | null | undefined,
): ResolvedVerdict | null {
  const verdict = classifyCallOutcome(input);
  if (!verdict) return null;
  if (!rules?.length) return toResolved(verdict);

  const answers = asAnswers(input.answers);
  const raw = answers.disposition || answers.outcome || answers.call_outcome || input.outcome || "";
  const key = normDisposition(raw);
  if (!key) return toResolved(verdict);

  const rule = rules.find((r) => normDisposition(r.disposition) === key);
  return toResolved(verdict, rule);
}

/** How long a completed call may wait for its extracted answers before the CRM applies it anyway. */
export const ANSWERS_GRACE_MS = 20 * 60 * 1000;

/** True while a completed call has no disposition or summary yet and ended recently. */
export function awaitingAnswers(call: { status: string; answers: unknown; summary: string | null; ended_at: string | null }, now = Date.now()): boolean {
  if (call.status !== "completed") return false;
  const answers = asAnswers(call.answers);
  const hasOutcome = Boolean((answers.disposition || answers.outcome || answers.call_outcome || answers.summary || call.summary || "").trim());
  if (hasOutcome) return false;
  const ended = call.ended_at ? Date.parse(call.ended_at) : NaN;
  return Number.isFinite(ended) ? now - ended < ANSWERS_GRACE_MS : true;
}
