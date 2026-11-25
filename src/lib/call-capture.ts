// Turns what the AI agent collected on a call (its output variables) into a client KYC record and a
// draft sales order. Pure functions, so they're easy to test; crm-sync.server.ts writes the results.
import type { Answers } from "@/lib/sarvam-call";

export type ProductType = "health" | "family_floater" | "term" | "motor" | "other";
export type PaymentFrequency = "single" | "monthly" | "quarterly" | "half_yearly" | "yearly";

export type KycCapture = {
  full_name: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  email: string | null;
  address_line: string | null;
  city: string | null;
  pincode: string | null;
  nominee_name: string | null;
  nominee_relation: string | null;
  pan_masked: string | null;
};

export type OrderCapture = {
  product_type: ProductType;
  plan_name: string | null;
  insurer: string | null;
  sum_insured: number | null;
  budget: number | null;
  payment_frequency: PaymentFrequency;
};

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** ABCDE1234F → ABCxxxxx4F. Anything that isn't a valid PAN → null (never stored). */
export function maskPan(value: string | null | undefined): string | null {
  const pan = (value ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (!PAN.test(pan)) return null;
  return `${pan.slice(0, 3)}xxxxx${pan.slice(8)}`;
}

/**
 * Answers as they should be stored on the call: a PAN the customer read out is replaced by its masked form
 * (or dropped if it isn't a valid PAN), so the full number never lands in the CRM database.
 */
export function redactAnswers(answers: Answers): Answers {
  if (!("kyc_pan" in answers)) return answers;
  const { kyc_pan, ...rest } = answers;
  const masked = maskPan(kyc_pan);
  return masked ? { ...rest, kyc_pan: masked } : rest;
}

const isYes = (value: string | undefined) => /^(yes|y|true|agreed|ok|okay|haan|ha|avunu)$/i.test((value ?? "").trim());
const clean = (value: string | undefined, max = 120) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Accepts 1990-05-14, 14/05/1990, 14-05-1990, 14 May 1990, May 14 1990. Returns YYYY-MM-DD or null. */
export function parseDob(value: string | undefined, today = new Date()): string | null {
  const text = (value ?? "").trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  if (!text) return null;
  let y: number | undefined, m: number | undefined, d: number | undefined;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = text.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/))) [d, m, y] = [Number(match[1]), MONTHS[match[2].slice(0, 4)] ?? MONTHS[match[2].slice(0, 3)], Number(match[3])];
  else if ((match = text.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/))) [m, d, y] = [MONTHS[match[1].slice(0, 4)] ?? MONTHS[match[1].slice(0, 3)], Number(match[2]), Number(match[3])];
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null; // 31 Feb etc.
  const age = today.getUTCFullYear() - y;
  if (date > today || age > 110) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "5 lakh" → 500000, "1.5 crore" → 15000000, "₹25,000" → 25000, "50k" → 50000. */
export function parseRupees(value: string | undefined): number | null {
  const text = (value ?? "").toLowerCase().replace(/[₹,\s]|rs\.?|inr|rupees?/g, "");
  const match = text.match(/^(\d+(?:\.\d+)?)(lakhs?|lacs?|l|crores?|cr|k|thousand)?$/);
  if (!match) return null;
  const unit = match[2] ?? "";
  const factor = /^(lakh|lac|l)/.test(unit) ? 1e5 : /^(crore|cr)/.test(unit) ? 1e7 : /^(k|thousand)/.test(unit) ? 1e3 : 1;
  const amount = Math.round(Number(match[1]) * factor);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function toProductType(value: string | undefined): ProductType {
  const text = (value ?? "").toLowerCase().replace(/[_-]+/g, " ");
  if (/family|floater/.test(text)) return "family_floater";
  if (/health|medical|mediclaim/.test(text)) return "health";
  if (/term|life/.test(text)) return "term";
  if (/motor|car|bike|vehicle|two wheeler/.test(text)) return "motor";
  return "other";
}

export function toFrequency(value: string | undefined): PaymentFrequency {
  const text = (value ?? "").toLowerCase().replace(/[_-]+/g, " ");
  if (/month/.test(text)) return "monthly";
  if (/quarter/.test(text)) return "quarterly";
  if (/half|six month|semi/.test(text)) return "half_yearly";
  if (/single|one time|once|lump/.test(text)) return "single";
  return "yearly";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** KYC from the call, only when the customer gave consent and at least one detail was collected. */
export function kycFromAnswers(answers: Answers): KycCapture | null {
  if (!isYes(answers.kyc_consent)) return null;
  const email = clean(answers.kyc_email, 160)?.toLowerCase().replace(/\s+at\s+/, "@").replace(/\s+dot\s+/g, ".") ?? null;
  const pincode = (answers.kyc_pincode ?? "").replace(/\D/g, "");
  const kyc: KycCapture = {
    full_name: clean(answers.kyc_full_name, 120),
    date_of_birth: parseDob(answers.kyc_dob),
    email: email && EMAIL.test(email) ? email : null,
    address_line: clean(answers.kyc_address, 300),
    city: clean(answers.kyc_city, 80),
    pincode: /^[1-9]\d{5}$/.test(pincode) ? pincode : null,
    nominee_name: clean(answers.kyc_nominee_name, 120),
    nominee_relation: clean(answers.kyc_nominee_relation, 40),
    // Already masked by redactAnswers when the answers were stored; maskPan also accepts a raw PAN.
    pan_masked: /^[A-Z]{3}x{5}[0-9A-Z]{2}$/.test(answers.kyc_pan ?? "") ? answers.kyc_pan! : maskPan(answers.kyc_pan),
  };
  return Object.values(kyc).some((value) => value !== null) ? kyc : null;
}

/** A draft order request, when the customer asked to go ahead. */
export function orderFromAnswers(answers: Answers): OrderCapture | null {
  if (!isYes(answers.order_confirmed)) return null;
  return {
    product_type: toProductType(answers.insurance_type || answers.interest),
    plan_name: clean(answers.order_plan, 120),
    insurer: clean(answers.order_insurer, 80),
    sum_insured: parseRupees(answers.order_sum_insured),
    budget: parseRupees(answers.order_budget),
    payment_frequency: toFrequency(answers.order_payment_frequency),
  };
}

/**
 * Merges a new capture into an existing KYC record: new non-empty values fill in or correct details,
 * but an empty value never wipes one that's already saved.
 */
export function mergeKyc<T extends Partial<KycCapture>>(existing: T | null, incoming: KycCapture): Partial<KycCapture> {
  const out: Partial<KycCapture> = {};
  for (const [key, value] of Object.entries(incoming) as [keyof KycCapture, string | null][]) {
    if (value !== null) out[key] = value;
    else if (existing && existing[key] != null) out[key] = existing[key] as string;
  }
  return out;
}
