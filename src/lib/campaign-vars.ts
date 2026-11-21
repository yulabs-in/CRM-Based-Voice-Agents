// Pure helpers for turning CRM contacts into Sarvam cohort users.
import { asAnswers } from "@/lib/sarvam-call";

export type VariableSource = "full_name" | "first_name" | "last_name" | "email" | "city" | "job_title" | `custom.${string}`;
export type VariableMap = Record<string, VariableSource>;

export type CohortContact = {
  first_name: string; last_name: string | null; email: string | null; city: string | null; job_title: string | null; custom_fields: unknown;
};

export const BUILTIN_SOURCES: Array<{ value: VariableSource; label: string }> = [
  { value: "full_name", label: "Full name" }, { value: "first_name", label: "First name" }, { value: "last_name", label: "Last name" },
  { value: "email", label: "Email" }, { value: "city", label: "City" }, { value: "job_title", label: "Job title" },
];

export function resolveVariables(contact: CohortContact, map: VariableMap): Record<string, string> {
  const custom = asAnswers(contact.custom_fields);
  const out: Record<string, string> = {};
  for (const [variable, source] of Object.entries(map)) {
    let value: string | null | undefined;
    if (source === "full_name") value = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
    else if (source.startsWith("custom.")) value = custom[source.slice(7)];
    else value = contact[source as keyof Omit<CohortContact, "custom_fields">] as string | null;
    // Sarvam app_variables are string → string; send an empty string rather than dropping a declared variable.
    out[variable] = String(value ?? "").slice(0, 500);
  }
  return out;
}

/** Agent variable names: letters, digits, underscore; must not start with a digit. */
export const isValidVariableName = (name: string) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name);

/** Sarvam cohort names: 1–50 chars of letters, numbers, spaces, underscores, hyphens. */
export function cohortName(campaignName: string, part: number): string {
  const base = campaignName.replace(/[^A-Za-z0-9 _-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 38) || "CRM campaign";
  return `${base} part ${part}`.slice(0, 50);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** CRM campaign status from a Sarvam campaign status. */
export function mapSarvamCampaignStatus(status: string): string {
  switch (status) {
    case "active": return "running";
    case "scheduled": return "scheduled";
    case "paused": return "paused";
    case "ended": return "completed";
    case "cancelled": return "cancelled";
    default: return status;
  }
}

/** Values a greeting template can use: built-in contact fields plus every imported file column. */
export function greetingValues(contact: CohortContact | null, extra: Record<string, string> = {}): Record<string, string> {
  const values: Record<string, string> = {};
  if (contact) {
    const full = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
    Object.assign(values, asAnswers(contact.custom_fields), {
      customer_name: full, full_name: full, first_name: contact.first_name ?? "", last_name: contact.last_name ?? "",
      email: contact.email ?? "", city: contact.city ?? "", job_title: contact.job_title ?? "",
    });
  }
  for (const [key, value] of Object.entries(extra)) if (value) values[key] = value;
  return values;
}

/**
 * Fills {placeholders} (also {{x}} and @x) in the agent's opening line for one person.
 * Returns null when there is no template, or a placeholder has no value — then Sarvam's own greeting is used,
 * so the agent never reads out "{customer_name}".
 */
export function fillGreeting(template: string | null | undefined, values: Record<string, string>): string | null {
  const text = template?.trim();
  if (!text) return null;
  let missing = false;
  const filled = text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}|@([A-Za-z_][A-Za-z0-9_]*)/g, (_match, a, b, c) => {
    const value = values[(a ?? b ?? c) as string]?.trim();
    if (!value) missing = true;
    return value ?? "";
  });
  return missing ? null : filled.slice(0, 500);
}

/** Said when the opening line needs a value we don't have (e.g. no trusted name): no placeholder, no guessed name. */
export const NEUTRAL_GREETING = "Hello sir, are you interested in a better insurance plan?";

/**
 * The opening line to send for one call — always a finished sentence. Sending it on every call means Sarvam never
 * falls back to its own template and reads "customer name" aloud when the variable is empty.
 */
export function openingLine(template: string | null | undefined, values: Record<string, string>, noNameGreeting?: string | null): string {
  return fillGreeting(template, values) ?? noNameLine(noNameGreeting);
}

/** The agent's own no-name opening line (Voice Agents page), with any leftover {placeholders} removed. */
export function noNameLine(noNameGreeting?: string | null): string {
  const text = noNameGreeting?.replace(/\{\{?\s*[A-Za-z_][A-Za-z0-9_]*\s*\}?\}/g, "").replace(/\s+([,.?!])/g, "$1").replace(/\s{2,}/g, " ").trim();
  return text ? text.slice(0, 500) : NEUTRAL_GREETING;
}

/** Last 10 digits — matches +91 98765 43210, 098765 43210 and 9876543210 as the same Indian number. */
export const phoneKey = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "").slice(-10);

/**
 * The contact to personalise a call with, from every contact saved with that number.
 * Several different people on one number → null, so the agent never greets the wrong name.
 */
export function pickContactForPhone<T extends { first_name: string; last_name: string | null }>(matches: T[]): T | null {
  if (matches.length === 0) return null;
  const names = new Set(matches.map((contact) => `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim().toLowerCase()));
  return names.size === 1 ? matches[0]! : null;
}

/** Variables that carry the person's name (cleared when we can't be sure who answers, overridden by a typed name). */
export const nameVariables = (map: VariableMap) =>
  Object.entries(map).filter(([, source]) => source === "full_name" || source === "first_name" || source === "last_name").map(([name]) => name);

/** Agent variables stored on a voice agent (jsonb) → a clean VariableMap. */
export function asVariableMap(value: unknown): VariableMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: VariableMap = {};
  for (const [name, source] of Object.entries(value as Record<string, unknown>)) {
    if (isValidVariableName(name) && typeof source === "string" && source) out[name] = source as VariableSource;
  }
  return out;
}
