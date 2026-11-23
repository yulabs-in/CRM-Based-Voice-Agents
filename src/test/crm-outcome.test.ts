import { describe, expect, it } from "vitest";
import { classifyCallOutcome, nextDealStage, nextLeadStatus, spokenName } from "@/lib/crm-outcome";

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

describe("transcript-based fallbacks", () => {
  it("uses the call summary when the agent gave no disposition", () => {
    const base = { status: "completed" as const };
    expect(classifyCallOutcome({ ...base, summary: "Manish is interested in health insurance and agreed to a callback." })?.kind).toBe("positive");
    expect(classifyCallOutcome({ ...base, summary: "The customer said they are not looking for any insurance." })?.kind).toBe("negative");
    expect(classifyCallOutcome({ ...base, answers: { summary: "Customer already has insurance with LIC." } })?.kind).toBe("negative");
  });

  it("a disposition still wins over the summary", () => {
    expect(classifyCallOutcome({ status: "completed", answers: { disposition: "not_interested", summary: "was interested at first" } })?.kind).toBe("negative");
  });
});

describe("spokenName", () => {
  it("title-cases the name the customer gave and ignores junk", () => {
    expect(spokenName({ customer_name: "manish" })).toBe("Manish");
    expect(spokenName({ customer_name: "", user_name: "ravi kumar" })).toBe("Ravi Kumar");
    expect(spokenName({ customer_name: "{customer_name}" })).toBeNull();
    expect(spokenName({ customer_name: "9876543210" })).toBeNull();
    expect(spokenName({})).toBeNull();
  });
});

describe("stock market agent dispositions", () => {
  it("maps the advisory agent's outcomes", () => {
    expect(call("consultation_booked")).toMatchObject({ kind: "positive", dealStage: "proposal" });
    expect(call("follow_up_required")).toMatchObject({ kind: "positive", dealStage: "qualification" });
    expect(call("do_not_contact")).toMatchObject({ kind: "negative", dealStage: "lost" });
    expect(call("escalated")).toMatchObject({ kind: "neutral", dealStage: null });
  });
});

describe("isDoNotContact", () => {
  it("blocks only explicit opt-outs, not a plain no", async () => {
    const { isDoNotContact } = await import("@/lib/crm-outcome");
    for (const d of ["do_not_contact", "do not call", "dnd", "opted out", "never requested"]) expect(isDoNotContact(d), d).toBe(true);
    for (const d of ["not_interested", "wrong_person", "interested", ""]) expect(isDoNotContact(d), d).toBe(false);
  });
});
