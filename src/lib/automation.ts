// Automation model + pure rule evaluation (shared by the builder UI, the server engine and tests).
import { asAnswers } from "@/lib/sarvam-call";

export type AutomationEvent = "call.completed" | "call.not_connected" | "call.finished" | "campaign.completed" | "contact.imported";

export const EVENTS: Array<{ value: AutomationEvent; label: string; help: string }> = [
  { value: "call.completed", label: "Call connected & finished", help: "A Sarvam call connected and the agent returned its answers." },
  { value: "call.not_connected", label: "Call not connected", help: "No answer, busy or failed — after Sarvam's own retries are used up." },
  { value: "call.finished", label: "Any call finished", help: "Every final call result, connected or not." },
  { value: "campaign.completed", label: "Campaign completed", help: "Every contact in a campaign has a final result." },
  { value: "contact.imported", label: "Contacts imported", help: "A CSV/Excel import into a project finished." },
];

export type ConditionField = "disposition" | "sentiment" | "status" | "duration_seconds" | "outcome" | `answer.${string}`;
export type Operator = "equals" | "not_equals" | "contains" | "not_contains" | "gt" | "lt" | "is_set" | "is_empty";
export type Condition = { field: ConditionField; operator: Operator; value?: string };

export const FIELDS: Array<{ value: ConditionField; label: string }> = [
  { value: "disposition", label: "Disposition (agent answer)" },
  { value: "sentiment", label: "Sentiment" },
  { value: "outcome", label: "Outcome" },
  { value: "status", label: "Call status" },
  { value: "duration_seconds", label: "Talk time (seconds)" },
];
export const OPERATORS: Array<{ value: Operator; label: string; needsValue: boolean }> = [
  { value: "equals", label: "is", needsValue: true },
  { value: "not_equals", label: "is not", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "not_contains", label: "doesn't contain", needsValue: true },
  { value: "gt", label: "greater than", needsValue: true },
  { value: "lt", label: "less than", needsValue: true },
  { value: "is_set", label: "has a value", needsValue: false },
  { value: "is_empty", label: "is empty", needsValue: false },
];

export type ActionType = "create_task" | "create_lead" | "create_deal" | "tag_contact" | "set_contact_status" | "move_to_project" | "schedule_callback";
export type Action =
  | { type: "create_task"; title: string; due_in_hours?: number; priority?: "low" | "medium" | "high" }
  | { type: "create_lead"; status?: string; score?: number }
  | { type: "create_deal"; title?: string; stage?: string; value?: number }
  | { type: "tag_contact"; tag: string }
  | { type: "set_contact_status"; status: "active" | "inactive" }
  | { type: "move_to_project"; project_id: string }
  | { type: "schedule_callback"; delay_hours?: number; at_time?: string; agent_id?: string };

export const ACTIONS: Array<{ value: ActionType; label: string; help: string }> = [
  { value: "create_task", label: "Create a follow-up task", help: "Adds a task linked to the contact." },
  { value: "create_lead", label: "Create a lead", help: "Adds the contact as a lead with the call's answers." },
  { value: "create_deal", label: "Create a deal", help: "Opens a deal in the sales pipeline." },
  { value: "tag_contact", label: "Tag the contact", help: "Adds a tag to the contact." },
  { value: "set_contact_status", label: "Set contact status", help: "Mark the contact active or inactive (e.g. do-not-call)." },
  { value: "move_to_project", label: "Move to another project", help: "Moves the contact, e.g. into a 'Hot leads' list." },
  { value: "schedule_callback", label: "Schedule a callback call", help: "Sarvam calls the contact again later (a 1-person campaign)." },
];

/** Everything a rule can look at for one event. */
export type EventFacts = {
  status?: string | null; sentiment?: string | null; outcome?: string | null; duration_seconds?: number | null; answers?: unknown;
};

function factValue(field: ConditionField, facts: EventFacts): string {
  if (field.startsWith("answer.")) return asAnswers(facts.answers)[field.slice(7)] ?? "";
  if (field === "disposition") return asAnswers(facts.answers).disposition ?? facts.outcome ?? "";
  const value = facts[field as keyof Omit<EventFacts, "answers">];
  return value === null || value === undefined ? "" : String(value);
}

const norm = (text: string) => text.trim().toLowerCase().replace(/[_-]+/g, " ");

export function conditionMatches(condition: Condition, facts: EventFacts): boolean {
  const actual = factValue(condition.field, facts);
  const expected = condition.value ?? "";
  switch (condition.operator) {
    case "equals": return norm(actual) === norm(expected);
    case "not_equals": return norm(actual) !== norm(expected);
    case "contains": return norm(actual).includes(norm(expected));
    case "not_contains": return !norm(actual).includes(norm(expected));
    case "gt": return Number(actual) > Number(expected);
    case "lt": return actual !== "" && Number(actual) < Number(expected);
    case "is_set": return actual.trim() !== "";
    case "is_empty": return actual.trim() === "";
    default: return false;
  }
}

export function rulesMatch(conditions: Condition[], match: "all" | "any", facts: EventFacts): boolean {
  if (!conditions.length) return true;
  return match === "any" ? conditions.some((c) => conditionMatches(c, facts)) : conditions.every((c) => conditionMatches(c, facts));
}

/** Which events a call result fires. `final` = no more Sarvam retries coming. */
export function eventsForCall(status: string, final: boolean): AutomationEvent[] {
  if (!final) return [];
  return status === "completed" ? ["call.completed", "call.finished"] : ["call.not_connected", "call.finished"];
}

/** Next time for a scheduled callback: explicit HH:MM tomorrow-or-today, else now + delay hours (default 24). */
export function callbackTime(action: { delay_hours?: number; at_time?: string }, now = new Date()): Date {
  if (action.at_time && /^\d{2}:\d{2}$/.test(action.at_time)) {
    const [h, m] = action.at_time.split(":").map(Number) as [number, number];
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (next.getTime() - now.getTime() < 5 * 60_000) next.setDate(next.getDate() + 1);
    return next;
  }
  return new Date(now.getTime() + Math.max(0.1, action.delay_hours ?? 24) * 3600_000);
}

export function describeCondition(c: Condition): string {
  const field = FIELDS.find((f) => f.value === c.field)?.label ?? c.field.replace(/^answer\./, "Answer: ");
  const op = OPERATORS.find((o) => o.value === c.operator);
  return `${field} ${op?.label ?? c.operator}${op?.needsValue ? ` "${c.value ?? ""}"` : ""}`;
}

export function describeAction(a: Action, projects?: Map<string, string>): string {
  switch (a.type) {
    case "create_task": return `Create task "${a.title}"${a.due_in_hours ? ` due in ${a.due_in_hours}h` : ""}`;
    case "create_lead": return `Create lead${a.status ? ` (${a.status})` : ""}`;
    case "create_deal": return `Create deal${a.stage ? ` in ${a.stage}` : ""}${a.value ? ` worth ₹${a.value}` : ""}`;
    case "tag_contact": return `Tag contact "${a.tag}"`;
    case "set_contact_status": return `Mark contact ${a.status}`;
    case "move_to_project": return `Move to project ${projects?.get(a.project_id) ?? ""}`.trim();
    case "schedule_callback": return a.at_time ? `Call again at ${a.at_time}` : `Call again in ${a.delay_hours ?? 24}h`;
  }
}
