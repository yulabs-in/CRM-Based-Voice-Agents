// Shared pure helpers for the phone-level Do-Not-Contact registry and compliance log (safe in browser & server).
import { normalizePhoneNumber } from "@/lib/sarvam-call";

export type DncSource = "call" | "manual" | "import";
export type ComplianceEvent =
  "consent_given" | "opt_out" | "blocked" | "reactivated" | "blocked_attempt";

export const DNC_SOURCES: readonly DncSource[] = ["call", "manual", "import"] as const;
export const COMPLIANCE_EVENTS: readonly ComplianceEvent[] = [
  "consent_given",
  "opt_out",
  "blocked",
  "reactivated",
  "blocked_attempt",
] as const;

export const DNC_SOURCE_LABELS: Record<DncSource, string> = {
  call: "Call opt-out",
  manual: "Manual",
  import: "DND import",
};

export const COMPLIANCE_EVENT_LABELS: Record<ComplianceEvent, string> = {
  consent_given: "Consent given",
  opt_out: "Opt-out (call)",
  blocked: "Blocked",
  reactivated: "Reactivated",
  blocked_attempt: "Blocked attempt",
};

export const MIN_REACTIVATION_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 500;
export const DND_IMPORT_BATCH_SIZE = 500;

export const DNC_REFUSAL_MESSAGE =
  "This number is marked do-not-call. Reactivate the contact first if they've asked to be called.";

/**
 * Normalises a phone string into canonical E.164 (e.g. "+91 98480 12345",
 * "09848012345", "9848012345", and "+919848012345" all become "+919848012345").
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== "string") return null;
  return normalizePhoneNumber(phone);
}

/**
 * Masks every digit except the last 4 for non-admins (e.g. "+••••••••2345").
 * Admins receive the full E.164 number.
 */
export function maskDncPhone(phone: string | null | undefined, showFull: boolean): string {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return "—";
  if (showFull) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  const prefix = trimmed.startsWith("+") ? "+" : "";
  const maskedCount = Math.max(4, digits.length - 4);
  return `${prefix}${"•".repeat(maskedCount)}${digits.slice(-4)}`;
}

/** Validates the required reactivation reason (min 10 characters). Returns an error message or null. */
export function validateReactivationReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < MIN_REACTIVATION_REASON_LENGTH) {
    return `Reactivation requires a reason of at least ${MIN_REACTIVATION_REASON_LENGTH} characters.`;
  }
  if (trimmed.length > MAX_REASON_LENGTH) {
    return `Keep the reactivation reason under ${MAX_REASON_LENGTH} characters.`;
  }
  return null;
}

/**
 * Splits campaign candidate targets into callable vs skipped using the normalised E.164 DNC set.
 * Different spellings of the same number ("09000000001", "+91 90000 00001") are always caught.
 */
export function filterCampaignTargetsByDnc<T extends { phone: string | null | undefined }>(
  candidates: readonly T[],
  blockedPhonesE164: ReadonlySet<string>,
): { callable: T[]; skipped: T[] } {
  const callable: T[] = [];
  const skipped: T[] = [];
  for (const candidate of candidates) {
    const e164 = toE164(candidate.phone);
    if (e164 && blockedPhonesE164.has(e164)) {
      skipped.push(candidate);
    } else {
      callable.push(candidate);
    }
  }
  return { callable, skipped };
}

const CONSENT_KEYS = ["consent_to_share", "consent_to_contact", "kyc_consent", "consent"] as const;
const AFFIRMATIVE_RE = /^(yes|true|1|y|agreed|given|granted|confirmed|ok|okay|haan|ha)$/i;

/** Extracts which consent fields were affirmatively granted during a call. */
export function extractConsentFields(answers: Record<string, string> | null | undefined): string[] {
  if (!answers) return [];
  const granted: string[] = [];
  for (const key of CONSENT_KEYS) {
    const val = (answers[key] ?? "").trim();
    if (val && AFFIRMATIVE_RE.test(val)) {
      granted.push(key);
    }
  }
  return granted;
}

const HEADER_TOKENS = new Set([
  "phone",
  "phone_number",
  "phonenumber",
  "phone_e164",
  "mobile",
  "mobile_number",
  "number",
  "msisdn",
  "telephone",
  "contact",
]);

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "," || ch === ";" || ch === "\t") && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parses a DND CSV (one number per line, or multi-column CSV with a phone column),
 * normalising valid numbers to E.164 and deduplicating them.
 */
export function parseDndCsvNumbers(csvText: string): {
  valid: string[];
  invalidCount: number;
  duplicateCount: number;
} {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { valid: [], invalidCount: 0, duplicateCount: 0 };
  }

  let startIndex = 0;
  let phoneColIndex = 0;

  const firstCells = splitCsvLine(lines[0]!);
  const detectedHeaderIdx = firstCells.findIndex((cell) =>
    HEADER_TOKENS.has(cell.toLowerCase().replace(/[\s-]+/g, "_")),
  );
  if (detectedHeaderIdx >= 0) {
    startIndex = 1;
    phoneColIndex = detectedHeaderIdx;
  } else if (!firstCells.some((cell) => toE164(cell) !== null) && /[a-zA-Z]/.test(lines[0]!)) {
    // Non-phone header row such as "DND Number"
    startIndex = 1;
  }

  const seen = new Set<string>();
  let invalidCount = 0;
  let duplicateCount = 0;

  for (let i = startIndex; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]!);
    const primary = cells[phoneColIndex] ?? cells[0] ?? "";
    let normalized = toE164(primary);
    if (!normalized && cells.length > 1) {
      for (const cell of cells) {
        normalized = toE164(cell);
        if (normalized) break;
      }
    }
    if (!normalized) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(normalized)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(normalized);
  }

  return {
    valid: [...seen],
    invalidCount,
    duplicateCount,
  };
}

const WHERE_LABELS: Record<string, string> = {
  one_off_call: "One-off / test call",
  campaign: "Campaign launch",
  api_v1_calls: "REST API (POST /api/v1/calls)",
  lead_widget: "Website lead widget",
  inbound_followup: "Inbound follow-up",
};

/** Builds a clean one-line description from compliance_log.details for the table & CSV export. */
export function formatComplianceDetails(_event: string, details: unknown): string {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  const record = details as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof record.where === "string" && record.where) {
    parts.push(`Blocked at: ${WHERE_LABELS[record.where] ?? record.where}`);
  }
  if (typeof record.source === "string" && record.source) {
    const srcLabel = DNC_SOURCE_LABELS[record.source as DncSource] ?? record.source;
    parts.push(`Source: ${srcLabel}`);
  }
  if (Array.isArray(record.fields) && record.fields.length > 0) {
    parts.push(`Consent: ${record.fields.map(String).join(", ")}`);
  }
  if (typeof record.reason === "string" && record.reason.trim()) {
    parts.push(record.reason.trim());
  }
  if (typeof record.campaign_name === "string" && record.campaign_name.trim()) {
    parts.push(`Campaign: ${record.campaign_name.trim()}`);
  }
  return parts.join(" · ");
}
