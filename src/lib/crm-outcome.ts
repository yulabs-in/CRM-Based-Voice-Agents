// Pure rules: what a finished call means for the CRM (lead status, deal stage, follow-up).
// Shared by the server sync and tests. No I/O here.
import { asAnswers } from "@/lib/sarvam-call";

export type DealStage = "qualification" | "proposal" | "negotiation" | "won" | "lost";
export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "converted";

export type CallVerdict = {
  kind: "won" | "positive" | "negative" | "neutral";
  label: string;
  leadStatus: LeadStatus;
  /** null = don't create or move a deal. */
  dealStage: DealStage | null;
  probability: number;
  score: number;
};

/** Pipeline order; a call only ever moves a deal forward (lost is handled separately). */
export const STAGE_RANK: Record<DealStage, number> = { qualification: 1, proposal: 2, negotiation: 3, won: 4, lost: 0 };
const LEAD_RANK: Record<LeadStatus, number> = { new: 0, contacted: 1, unqualified: 1, qualified: 2, converted: 3 };

const WON = /\b(converted|purchased|bought|paid|payment (done|made|received)|policy (issued|purchased)|sale|sold|closed won|won)\b/;
const NEGATIVE = /\b(not interested|no interest|not looking|no need|wrong (number|person)|dnd|do not (call|disturb)|don ?t call|declined|refused|rejected|already (has|have|got|insured|renewed|bought|covered)|renewed elsewhere|bought elsewhere|unqualified|not eligible|cold|negative|lost|hostile|abusive)\b/;
const NEGOTIATION = /\b(accepted|accept|agreed|agree|confirmed|ready to (buy|pay|proceed)|will pay|send payment link|payment link|negotiat\w*|price (discussion|negotiation))\b/;
const PROPOSAL = /\b(quote|quotation|proposal|meeting|demo|appointment|site visit|send (details|options|plans?)|requested (a )?quote)\b/;
const POSITIVE = /\b(interested|callback|call back|follow ?up|hot|warm|qualified|positive|yes|keen|considering)\b/;

const norm = (text: string) => text.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Classifies a finished call. Returns null when the call should not touch the CRM (it never connected).
 * Looks at the agent's disposition first, then the outcome, then sentiment as a last resort.
 */
export function classifyCallOutcome(input: { status: string | null; outcome?: string | null; sentiment?: string | null; summary?: string | null; answers?: unknown }): CallVerdict | null {
  if (input.status !== "completed") return null;
  const answers = asAnswers(input.answers);
  const raw = answers.disposition || answers.outcome || answers.call_outcome || input.outcome || "";
  const text = norm(raw);
  const label = raw ? norm(raw) : "connected";

  // A "no_answer" disposition on a connected call (silent line, voicemail) is not a real conversation.
  if (/\b(no answer|no response|unresponsive|voicemail|busy|disconnected|call dropped)\b/.test(text)) {
    return { kind: "neutral", label, leadStatus: "contacted", dealStage: null, probability: 0, score: 20 };
  }
  // Negative is checked before positive so "not interested" never reads as "interested".
  if (NEGATIVE.test(text)) return { kind: "negative", label, leadStatus: "unqualified", dealStage: "lost", probability: 0, score: 10 };
  if (WON.test(text)) return { kind: "won", label, leadStatus: "converted", dealStage: "won", probability: 100, score: 100 };
  if (NEGOTIATION.test(text)) return { kind: "positive", label, leadStatus: "qualified", dealStage: "negotiation", probability: 60, score: 90 };
  if (PROPOSAL.test(text)) return { kind: "positive", label, leadStatus: "qualified", dealStage: "proposal", probability: 40, score: 80 };
  if (POSITIVE.test(text)) return { kind: "positive", label, leadStatus: "qualified", dealStage: "qualification", probability: 20, score: 70 };

  // No usable disposition: read the call summary the agent wrote from the transcript.
  const summary = norm(answers.summary || answers.call_summary || input.summary || "");
  if (summary) {
    if (NEGATIVE.test(summary)) return { kind: "negative", label, leadStatus: "unqualified", dealStage: "lost", probability: 0, score: 10 };
    if (/\b(interested|agreed|callback|call back|looking for)\b/.test(summary)) {
      return { kind: "positive", label, leadStatus: "qualified", dealStage: "qualification", probability: 20, score: 65 };
    }
  }
  if (input.sentiment === "positive") return { kind: "positive", label, leadStatus: "qualified", dealStage: "qualification", probability: 20, score: 65 };
  if (input.sentiment === "negative") return { kind: "negative", label, leadStatus: "unqualified", dealStage: "lost", probability: 0, score: 10 };
  return { kind: "neutral", label, leadStatus: "contacted", dealStage: null, probability: 0, score: 30 };
}

/** New lead status after this call: positive news can revive an unqualified lead; nothing undoes a conversion. */
export function nextLeadStatus(current: string | null | undefined, verdict: CallVerdict): LeadStatus {
  const now = (current ?? "new") as LeadStatus;
  if (now === "converted") return "converted";
  if (verdict.leadStatus === "unqualified") return "unqualified";
  if (verdict.leadStatus === "contacted") return LEAD_RANK[now] >= 1 ? now : "contacted";
  return LEAD_RANK[verdict.leadStatus] >= LEAD_RANK[now] || now === "unqualified" ? verdict.leadStatus : now;
}

/** New stage for an open deal, or null to leave it. Won is final; lost closes any open deal; otherwise only forward. */
export function nextDealStage(current: string, verdict: CallVerdict): DealStage | null {
  if (!verdict.dealStage || current === "won") return null;
  if (verdict.dealStage === "lost") return current === "lost" ? null : "lost";
  const now = (current in STAGE_RANK ? current : "qualification") as DealStage;
  if (now === "lost") return verdict.dealStage; // they came back
  return STAGE_RANK[verdict.dealStage] > STAGE_RANK[now] ? verdict.dealStage : null;
}

/** The name the customer gave on the call (agent variables), if any. */
export function spokenName(answers: unknown): string | null {
  const a = asAnswers(answers);
  const name = (a.customer_name || a.user_name || a.full_name || "").trim();
  if (!name || name.length > 60 || /[{}]|\d{3,}/.test(name)) return null;
  return name.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
