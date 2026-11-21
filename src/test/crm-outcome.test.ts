import { describe, expect, it } from "vitest";
import { classifyCallOutcome, nextDealStage, nextLeadStatus } from "@/lib/crm-outcome";

const call = (disposition: string, extra: Partial<{ status: string; sentiment: string }> = {}) =>
  classifyCallOutcome({ status: extra.status ?? "completed", sentiment: extra.sentiment ?? null, answers: { disposition } });

describe("classifyCallOutcome", () => {
  it("ignores calls that never connected", () => {
    expect(classifyCallOutcome({ status: "no_answer", answers: { disposition: "interested" } })).toBeNull();
    expect(classifyCallOutcome({ status: "failed" })).toBeNull();
  });

  it("never reads 'not interested' as interested", () => {
    expect(call("not_interested")).toMatchObject({ kind: "negative", leadStatus: "unqualified", dealStage: "lost" });
    expect(call("Not Interested")).toMatchObject({ kind: "negative" });
  });

  it("maps negative dispositions", () => {
    for (const d of ["wrong_number", "dnd", "do_not_call", "already has insurance", "renewed elsewhere", "declined"]) {
      expect(call(d)?.kind, d).toBe("negative");
    }
  });

  it("maps positive dispositions to the right pipeline stage", () => {
    expect(call("interested")).toMatchObject({ leadStatus: "qualified", dealStage: "qualification" });
    expect(call("callback")).toMatchObject({ dealStage: "qualification" });
    expect(call("quote_requested")).toMatchObject({ dealStage: "proposal" });
    expect(call("meeting_requested")).toMatchObject({ dealStage: "proposal" });
    expect(call("accepted")).toMatchObject({ dealStage: "negotiation" });
    expect(call("purchased")).toMatchObject({ kind: "won", leadStatus: "converted", dealStage: "won" });
  });

  it("treats a silent connected call as contacted, with no deal", () => {
    expect(call("no_answer")).toMatchObject({ kind: "neutral", leadStatus: "contacted", dealStage: null });
  });

  it("falls back to sentiment, then neutral", () => {
    expect(call("", { sentiment: "positive" })?.dealStage).toBe("qualification");
    expect(call("", { sentiment: "negative" })?.dealStage).toBe("lost");
    expect(call("")).toMatchObject({ kind: "neutral", dealStage: null });
  });
});

describe("nextLeadStatus", () => {
  it("never undoes a conversion and lets positive news revive a lead", () => {
    expect(nextLeadStatus("converted", call("not interested")!)).toBe("converted");
    expect(nextLeadStatus("unqualified", call("interested")!)).toBe("qualified");
    expect(nextLeadStatus("qualified", call("no_answer")!)).toBe("qualified");
    expect(nextLeadStatus("new", call("no_answer")!)).toBe("contacted");
  });
});

describe("nextDealStage", () => {
  it("only moves forward, closes on lost, never touches won", () => {
    expect(nextDealStage("proposal", call("interested")!)).toBeNull();
    expect(nextDealStage("qualification", call("quote requested")!)).toBe("proposal");
    expect(nextDealStage("negotiation", call("not interested")!)).toBe("lost");
    expect(nextDealStage("won", call("not interested")!)).toBeNull();
    expect(nextDealStage("lost", call("interested")!)).toBe("qualification");
  });
});
