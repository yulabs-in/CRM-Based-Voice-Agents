// Pure helpers shared by the browser, server functions and webhooks (no secrets here).
import { redactAnswers } from "@/lib/call-capture";

export type SarvamAttemptStatus = "connected" | "no_answer" | "busy" | "failed";
export type CallStatus = "queued" | "in_progress" | "completed" | "no_answer" | "failed";
export type TargetStatus = "pending" | "queued" | "calling" | "retrying" | "completed" | "no_answer" | "busy" | "failed" | "excluded" | "skipped";
export type TranscriptTurn = { role: "agent" | "customer"; text: string };
export type Answers = Record<string, string>;

export function normalizePhoneNumber(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  const digits = compact.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export function mapSarvamStatus(status: SarvamAttemptStatus): "completed" | "no_answer" | "failed" {
  if (status === "connected") return "completed";
  if (status === "no_answer") return "no_answer";
  return "failed";
}

/** Maps one Sarvam campaign webhook attempt to the CRM call status and the per-contact target status. */
export function mapCampaignAttempt(input: {
  connectivity_status?: string | null;
  next_action_status?: string | null;
}): { call: CallStatus; target: TargetStatus } {
  const connectivity = input.connectivity_status ?? null;
  const call: CallStatus = connectivity === "connected" ? "completed" : connectivity === "no_answer" ? "no_answer" : "failed";
  if (input.next_action_status) return { call, target: "retrying" };
  if (connectivity === "connected") return { call, target: "completed" };
  if (connectivity === "no_answer") return { call, target: "no_answer" };
  if (connectivity === "busy") return { call, target: "busy" };
  return { call, target: "failed" };
}

export function isValidCallbackToken(providedHash: string, storedHash: string | null): boolean {
  if (storedHash === null || providedHash.length !== storedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < providedHash.length; index += 1) difference |= providedHash.charCodeAt(index) ^ storedHash.charCodeAt(index);
  return difference === 0;
}

const speaker = (role: string): TranscriptTurn["role"] => (role === "agent" || role === "assistant" ? "agent" : "customer");

export function toTranscriptTurns(turns: Array<{ role: string; en_text?: string; content?: string }> | null | undefined): TranscriptTurn[] {
  return (turns ?? [])
    .map((turn) => ({ role: speaker(turn.role), text: String(turn.en_text ?? turn.content ?? "").trim() }))
    .filter((turn) => turn.text.length > 0);
}

export function formatTranscript(turns: TranscriptTurn[]): string {
  return turns.map((turn) => `${turn.role === "agent" ? "Agent" : "Customer"}: ${turn.text}`).join("\n");
}

export function formatSarvamTranscript(turns: Array<{ role: string; en_text: string }>): string {
  return formatTranscript(toTranscriptTurns(turns));
}

const INTERNAL_KEYS = new Set(["call_step", "current_state", "agent_name", "company_name", "call_purpose"]);

/**
 * The customer's answers: variables the agent collected (output) win over end-of-call variables (final).
 * Values become strings; empty values, agent bookkeeping keys, and values we passed in unchanged are dropped.
 */
export function extractAnswers(
  final?: Record<string, unknown> | null,
  output?: Record<string, unknown> | null,
  initial?: Record<string, unknown> | null,
): Answers {
  const answers: Answers = {};
  const given = new Map(Object.entries(initial ?? {}).map(([key, value]) => [key, String(value ?? "")]));
  for (const source of [final, output]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (INTERNAL_KEYS.has(key) || value === null || value === undefined) continue;
      const text = typeof value === "object" ? JSON.stringify(value) : String(value).trim();
      if (!text) continue;
      if (source === final && given.get(key) === text) continue;
      answers[key] = text;
    }
  }
  // A PAN read out on the call is stored masked (ABCxxxxx4F), never in full.
  return redactAnswers(answers);
}

const OUTCOME_KEYS = ["disposition", "outcome", "call_outcome", "result", "interest", "interested", "status"];
const NEGATIVE = /\b(no|not interested|already renewed|renewed elsewhere|already bought|bought elsewhere|declined|refused|dnd|do not call|wrong number|wrong person|negative|cold|unqualified|false)\b/i;
const POSITIVE = /\b(yes|interested|agreed|confirmed|paid|will pay|callback|call back|booked|positive|hot|qualified|true)\b/i;
const SUMMARY_KEYS = ["call_summary", "summary", "conversation_summary"];

/** Best-effort outcome, sentiment and one-line summary from the agent's answers (no external AI). */
export function summarizeAnswers(answers: Answers): {
  outcome: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  summary: string | null;
} {
  const key = OUTCOME_KEYS.find((candidate) => answers[candidate]);
  const outcome = key ? answers[key]! : null;
  // Agents often return snake_case dispositions ("wrong_number", "not_interested").
  const words = (outcome ?? "").replace(/[_-]+/g, " ");
  const sentiment = !outcome ? null : NEGATIVE.test(words) ? "negative" : POSITIVE.test(words) ? "positive" : "neutral";
  const agentSummary = SUMMARY_KEYS.map((candidate) => answers[candidate]).find(Boolean);
  // Personal KYC details never go into the one-line summary shown around the app.
  const entries = Object.entries(answers).filter(([name]) => !name.startsWith("kyc_"));
  const summary = agentSummary ?? (entries.length ? entries.map(([name, value]) => `${humanize(name)}: ${value}`).join(" · ") : null);
  return { outcome, sentiment, summary };
}

export const humanize = (key: string) => key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function asAnswers(value: unknown): Answers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry ?? "")]));
}

export function asTurns(value: unknown): TranscriptTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((turn): turn is TranscriptTurn => !!turn && typeof turn === "object" && typeof (turn as TranscriptTurn).text === "string")
    .map((turn) => ({ role: turn.role === "agent" ? "agent" : "customer", text: turn.text }));
}
