import { describe, expect, it } from "vitest";
import { classifyCallOutcome } from "@/lib/crm-outcome";
import { DEFAULT_DISPOSITIONS, defaultRuleFor, resolveVerdict, type OutcomeRule } from "@/lib/outcome-rules";

const call = (disposition: string, extra: Partial<{ status: string; sentiment: string; agent_id: string }> = {}) =>
  ({ status: extra.status ?? "completed", sentiment: extra.sentiment ?? null, answers: { disposition } });

describe("resolveVerdict", () => {
  it("with no rules, equals classifyCallOutcome for every default disposition", () => {
    for (const disposition of DEFAULT_DISPOSITIONS) {
      const input = call(disposition);
      const expected = classifyCallOutcome(input);
      const resolved = resolveVerdict(input, null);
      expect(resolved).not.toBeNull();
      expect(resolved!.kind).toBe(expected!.kind);
      expect(resolved!.label).toBe(expected!.label);
      expect(resolved!.leadStatus).toBe(expected!.leadStatus);
      expect(resolved!.dealStage).toBe(expected!.dealStage);
      expect(resolved!.probability).toBe(expected!.probability);
    }
  });

  it("a rule overrides stage and probability for its agent", () => {
    const rules: OutcomeRule[] = [{
      disposition: "interested",
      lead_status: "qualified",
      deal_stage: "proposal",
      probability: 40,
      create_lead: true,
      create_task: true,
      block_contact: false,
    }];
    const resolved = resolveVerdict(call("interested"), rules);
    expect(resolved).toMatchObject({
      kind: "positive",
      leadStatus: "qualified",
      dealStage: "proposal",
      probability: 40,
      createLead: true,
      createTask: true,
      blockContact: false,
    });
  });

  it("agent A's rule doesn't affect agent B (pass B's empty rules)", () => {
    const agentARules: OutcomeRule[] = [{
      disposition: "interested",
      lead_status: "qualified",
      deal_stage: "proposal",
      probability: 40,
      create_lead: true,
      create_task: true,
      block_contact: false,
    }];
    const a = resolveVerdict(call("interested"), agentARules);
    const b = resolveVerdict(call("interested"), []);
    expect(a?.dealStage).toBe("proposal");
    expect(a?.probability).toBe(40);
    expect(b?.dealStage).toBe("qualification");
    expect(b?.probability).toBe(20);
  });

  it("create_lead=false and block_contact=true flags come through", () => {
    const rules: OutcomeRule[] = [{
      disposition: "interested",
      lead_status: "contacted",
      deal_stage: null,
      probability: 0,
      create_lead: false,
      create_task: false,
      block_contact: true,
    }];
    const resolved = resolveVerdict(call("interested"), rules);
    expect(resolved).toMatchObject({
      createLead: false,
      createTask: false,
      blockContact: true,
      dealStage: null,
      leadStatus: "contacted",
    });
  });

  it("a non-connected call returns null, even with rules", () => {
    const rules: OutcomeRule[] = [{
      disposition: "interested",
      lead_status: "qualified",
      deal_stage: "proposal",
      probability: 40,
      create_lead: true,
      create_task: true,
      block_contact: false,
    }];
    expect(resolveVerdict({ status: "no_answer", answers: { disposition: "interested" } }, rules)).toBeNull();
    expect(resolveVerdict({ status: "failed", answers: { disposition: "interested" } }, rules)).toBeNull();
  });

  it("a disposition with no matching rule falls back to default", () => {
    const rules: OutcomeRule[] = [{
      disposition: "consultation_booked",
      lead_status: "qualified",
      deal_stage: "negotiation",
      probability: 70,
      create_lead: true,
      create_task: true,
      block_contact: false,
    }];
    const resolved = resolveVerdict(call("interested"), rules);
    expect(resolved).toMatchObject({ dealStage: "qualification", probability: 20 });
  });

  it("normalizes disposition keys (case, underscores, hyphens)", () => {
    const rules: OutcomeRule[] = [{
      disposition: "not interested",
      lead_status: "unqualified",
      deal_stage: null,
      probability: 0,
      create_lead: false,
      create_task: false,
      block_contact: false,
    }];
    expect(resolveVerdict(call("Not-Interested"), rules)?.dealStage).toBeNull();
    expect(resolveVerdict(call("not_interested"), rules)?.blockContact).toBe(false);
  });
});

describe("defaultRuleFor", () => {
  it("builds rules that match today's classifier behavior", () => {
    const interested = defaultRuleFor("interested");
    expect(interested).toMatchObject({ lead_status: "qualified", deal_stage: "qualification", probability: 20, create_lead: true, create_task: true, block_contact: false });

    const dnc = defaultRuleFor("do_not_contact");
    expect(dnc.block_contact).toBe(true);
    expect(dnc.create_lead).toBe(false);

    const noAnswer = defaultRuleFor("no_answer");
    expect(noAnswer).toMatchObject({ lead_status: "contacted", deal_stage: null, create_lead: false, create_task: false, block_contact: false });
  });
});
