import { describe, expect, it } from "vitest";
import { callbackTime, conditionMatches, describeAction, describeCondition, eventsForCall, rulesMatch } from "@/lib/automation";

const call = { status: "completed", sentiment: "positive", outcome: "interested", duration_seconds: 65, answers: { disposition: "callback_requested", follow_up_date: "Monday" } };

describe("automation rules", () => {
  it("matches dispositions loosely (case, underscores) and answer fields", () => {
    expect(conditionMatches({ field: "disposition", operator: "contains", value: "callback" }, call)).toBe(true);
    expect(conditionMatches({ field: "disposition", operator: "equals", value: "Callback Requested" }, call)).toBe(true);
    expect(conditionMatches({ field: "answer.follow_up_date", operator: "is_set" }, call)).toBe(true);
    expect(conditionMatches({ field: "answer.budget", operator: "is_empty" }, call)).toBe(true);
    expect(conditionMatches({ field: "duration_seconds", operator: "gt", value: "60" }, call)).toBe(true);
    expect(conditionMatches({ field: "duration_seconds", operator: "lt", value: "10" }, call)).toBe(false);
    expect(conditionMatches({ field: "sentiment", operator: "not_equals", value: "negative" }, call)).toBe(true);
  });

  it("combines rules with all / any, and no rules means every event", () => {
    const yes = { field: "sentiment" as const, operator: "equals" as const, value: "positive" };
    const no = { field: "status" as const, operator: "equals" as const, value: "no_answer" };
    expect(rulesMatch([yes, no], "all", call)).toBe(false);
    expect(rulesMatch([yes, no], "any", call)).toBe(true);
    expect(rulesMatch([], "all", call)).toBe(true);
  });

  it("fires events only on final call results", () => {
    expect(eventsForCall("completed", true)).toEqual(["call.completed", "call.finished"]);
    expect(eventsForCall("no_answer", true)).toEqual(["call.not_connected", "call.finished"]);
    expect(eventsForCall("failed", false)).toEqual([]);
  });

  it("computes callback times from a delay or the next HH:MM", () => {
    const now = new Date(2026, 10, 20, 22, 30);
    expect(callbackTime({ delay_hours: 4 }, now).getTime()).toBe(now.getTime() + 4 * 3600_000);
    const at = callbackTime({ at_time: "11:00" }, now);
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([21, 11, 0]);
    const later = callbackTime({ at_time: "23:00" }, now);
    expect([later.getDate(), later.getHours()]).toEqual([20, 23]);
  });

  it("describes rules and actions in plain words", () => {
    expect(describeCondition({ field: "disposition", operator: "contains", value: "interested" })).toBe('Disposition (agent answer) contains "interested"');
    expect(describeAction({ type: "schedule_callback", delay_hours: 4 })).toBe("Call again in 4h");
    expect(describeAction({ type: "create_task", title: "Call {name}", due_in_hours: 24 })).toBe('Create task "Call {name}" due in 24h');
  });
});

describe("templates", async () => {
  const { TEMPLATES } = await import("@/components/app/AutomationViews");
  it("the Interested template never fires on not_interested", () => {
    const interested = TEMPLATES.find((t) => t.title.startsWith("Interested"))!.draft;
    const notInterested = { status: "completed", sentiment: "negative", answers: { disposition: "not_interested" } };
    const quote = { status: "completed", sentiment: "neutral", answers: { disposition: "quote_requested" } };
    expect(rulesMatch(interested.conditions, interested.match, notInterested)).toBe(false);
    expect(rulesMatch(interested.conditions, interested.match, quote)).toBe(true);
  });
});
