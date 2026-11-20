import { describe, expect, it } from "vitest";
import { chunk, cohortName, isValidVariableName, mapSarvamCampaignStatus, resolveVariables } from "@/lib/campaign-vars";
import { answerBreakdown, callFunnel, callKpis, campaignComparison, type CallRow } from "@/lib/call-insights";

const contact = { first_name: "Asha", last_name: "Rao", email: null, city: "Pune", job_title: null, custom_fields: { loan_amount: "50000" } };

describe("campaign helpers", () => {
  it("maps contact fields and file columns to agent variables", () => {
    expect(resolveVariables(contact, { customer_name: "full_name", city: "city", amount: "custom.loan_amount", email: "email" }))
      .toEqual({ customer_name: "Asha Rao", city: "Pune", amount: "50000", email: "" });
  });

  it("validates names and builds Sarvam-safe cohort names", () => {
    expect(isValidVariableName("customer_name")).toBe(true);
    expect(isValidVariableName("1st")).toBe(false);
    expect(isValidVariableName("my-var")).toBe(false);
    expect(cohortName("EMI reminder – Nov (₹)", 3)).toBe("EMI reminder Nov part 3");
    expect(cohortName("!!!", 1)).toBe("CRM campaign part 1");
  });

  it("chunks lists and maps Sarvam campaign statuses", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(mapSarvamCampaignStatus("active")).toBe("running");
    expect(mapSarvamCampaignStatus("ended")).toBe("completed");
  });
});

const call = (over: Partial<CallRow>): CallRow => ({
  id: Math.random().toString(), status: "completed", duration_seconds: 60, sentiment: null, outcome: null, campaign_id: "c1", agent_id: null,
  contact_id: null, started_at: new Date().toISOString(), created_at: new Date().toISOString(), answers: {}, ...over,
});

describe("call insights", () => {
  const calls = [
    call({ answers: { interested: "yes" }, sentiment: "positive" }),
    call({ answers: { interested: "no" }, sentiment: "negative", duration_seconds: 120 }),
    call({ status: "no_answer", duration_seconds: 0 }),
    call({ status: "failed", duration_seconds: 0, campaign_id: "c2" }),
  ];

  it("computes KPIs and the funnel", () => {
    expect(callKpis(calls)).toMatchObject({ total: 4, connected: 2, connectRate: "50%", avgDuration: 90, positive: 1, answered: 2 });
    expect(callFunnel(calls).map((step) => step.value)).toEqual([4, 2, 2, 1]);
  });

  it("breaks answers down by key and value", () => {
    expect(answerBreakdown(calls)).toEqual([{ key: "interested", label: "Interested", total: 2, values: [{ name: "yes", value: 1 }, { name: "no", value: 1 }] }]);
  });

  it("compares campaigns by progress and connect rate", () => {
    const rows = campaignComparison(
      [{ id: "c1", name: "A", status: "running", project_id: "p", target_count: 3 }],
      [{ campaign_id: "c1", status: "completed" }, { campaign_id: "c1", status: "retrying" }, { campaign_id: "c1", status: "no_answer" }],
      calls,
    );
    expect(rows[0]).toMatchObject({ contacts: 3, progress: 67, calls: 3, connected: 2, rate: 67, positive: 1 });
  });
});

describe("personalised greeting", async () => {
  const { fillGreeting, greetingValues } = await import("@/lib/campaign-vars");
  const values = greetingValues({ ...contact, custom_fields: { renewal_date: "5 Dec" } });
  it("fills {x}, {{x}} and @x from the contact and file columns", () => {
    expect(fillGreeting("Hello, am I speaking with {customer_name}?", values)).toBe("Hello, am I speaking with Asha Rao?");
    expect(fillGreeting("Hi {{first_name}}, renewal on @renewal_date", values)).toBe("Hi Asha, renewal on 5 Dec");
  });
  it("falls back to Sarvam's own greeting instead of reading a blank or a placeholder", () => {
    expect(fillGreeting("Hello {customer_name}", greetingValues(null))).toBe(null);
    expect(fillGreeting("Hello {unknown_field}", values)).toBe(null);
    expect(fillGreeting("", values)).toBe(null);
    expect(fillGreeting("Hello {customer_name}", greetingValues(null, { customer_name: "Rohith" }))).toBe("Hello Rohith");
  });
});
