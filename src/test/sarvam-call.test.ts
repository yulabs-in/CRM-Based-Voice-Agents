import { describe, expect, it } from "vitest";
import {
  asTurns, extractAnswers, formatSarvamTranscript, isValidCallbackToken, mapCampaignAttempt, mapSarvamStatus,
  normalizePhoneNumber, summarizeAnswers, toTranscriptTurns,
} from "@/lib/sarvam-call";

describe("Sarvam call handling", () => {
  it("normalizes Indian and international numbers to E.164", () => {
    expect(normalizePhoneNumber("8019628820")).toBe("+918019628820");
    expect(normalizePhoneNumber("08019628820")).toBe("+918019628820");
    expect(normalizePhoneNumber("91 98765-43210")).toBe("+919876543210");
    expect(normalizePhoneNumber("+1 (415) 555-0100")).toBe("+14155550100");
    expect(normalizePhoneNumber("12345")).toBe(null);
  });

  it("maps every instant-call result to a CRM call status", () => {
    expect(mapSarvamStatus("connected")).toBe("completed");
    expect(mapSarvamStatus("no_answer")).toBe("no_answer");
    expect(mapSarvamStatus("busy")).toBe("failed");
    expect(mapSarvamStatus("failed")).toBe("failed");
  });

  it("maps campaign attempts, keeping contacts in 'retrying' while Sarvam will call again", () => {
    expect(mapCampaignAttempt({ connectivity_status: "connected" })).toEqual({ call: "completed", target: "completed" });
    expect(mapCampaignAttempt({ connectivity_status: "busy", next_action_status: "retry" })).toEqual({ call: "failed", target: "retrying" });
    expect(mapCampaignAttempt({ connectivity_status: "busy" })).toEqual({ call: "failed", target: "busy" });
    expect(mapCampaignAttempt({ connectivity_status: "no_answer" })).toEqual({ call: "no_answer", target: "no_answer" });
    expect(mapCampaignAttempt({ connectivity_status: null })).toEqual({ call: "failed", target: "failed" });
  });

  it("keeps who-said-what in the stored transcript", () => {
    expect(formatSarvamTranscript([
      { role: "agent", en_text: "How can I help?" },
      { role: "user", en_text: "I need support." },
      { role: "user", en_text: "  " },
    ])).toBe("Agent: How can I help?\nCustomer: I need support.");
    expect(toTranscriptTurns([{ role: "assistant", content: "Namaste" }])).toEqual([{ role: "agent", text: "Namaste" }]);
    expect(asTurns([{ role: "agent", text: "Hi" }, { bad: true }])).toEqual([{ role: "agent", text: "Hi" }]);
  });

  it("extracts the customer's answers and drops bookkeeping and unchanged inputs", () => {
    const answers = extractAnswers(
      { customer_name: "Asha", call_step: "end", interested: "yes", budget: 50000, empty: "" },
      { callback_time: "Tomorrow 5pm" },
      { customer_name: "Asha" },
    );
    expect(answers).toEqual({ interested: "yes", budget: "50000", callback_time: "Tomorrow 5pm" });
  });

  it("derives outcome and sentiment from answers", () => {
    expect(summarizeAnswers({ disposition: "Interested", budget: "50000" })).toEqual({
      outcome: "Interested", sentiment: "positive", summary: "Disposition: Interested · Budget: 50000",
    });
    expect(summarizeAnswers({ interested: "Not interested" }).sentiment).toBe("negative");
    expect(summarizeAnswers({ budget: "10" })).toMatchObject({ outcome: null, sentiment: null });
  });

  it("accepts only the exact callback token hash", () => {
    expect(isValidCallbackToken("abc123", "abc123")).toBe(true);
    expect(isValidCallbackToken("abc123", "abc124")).toBe(false);
    expect(isValidCallbackToken("abc123", "different")).toBe(false);
    expect(isValidCallbackToken("abc123", null)).toBe(false);
  });
});

describe("default Sarvam setup", async () => {
  const { SARVAM_DEFAULTS, DEFAULT_AGENT } = await import("@/lib/sarvam-defaults");
  it("has a callable caller number and complete agent details", () => {
    expect(normalizePhoneNumber(SARVAM_DEFAULTS.callerNumber)).toBe("+918064269483");
    expect(normalizePhoneNumber("+91 80642 69483")).toBe("+918064269483");
    expect(DEFAULT_AGENT).toMatchObject({ sarvam_agent_id: "YULabs-Insu-13e07aa4-48c0", sarvam_app_version: 6, sarvam_connection_id: "614a33c8-31-e56314c0-c598", status: "active" });
  });
});

describe("Sarvam error details", async () => {
  const { sarvamErrorDetails } = await import("@/lib/sarvam.server");
  it("surfaces the field-level reason instead of a generic message", () => {
    expect(sarvamErrorDetails({ error: { message: "(422) Invalid Parameter", data: { details: "agent_variables.customer_name is not defined" } } }))
      .toBe("agent_variables.customer_name is not defined");
    expect(sarvamErrorDetails({ detail: [{ loc: ["body", "user_config", "user_phone_number"], msg: "invalid phone", type: "value_error" }] }))
      .toBe("user_config.user_phone_number: invalid phone");
    expect(sarvamErrorDetails({ error: { message: "(422) Invalid Parameter" } })).toBe("(422) Invalid Parameter");
    expect(sarvamErrorDetails(null)).toBe(null);
  });
});

describe("real agent dispositions", () => {
  it("understands snake_case outcomes and prefers the agent's own summary", () => {
    expect(summarizeAnswers({ disposition: "wrong_number", call_summary: "Caller said it was the wrong number." }))
      .toEqual({ outcome: "wrong_number", sentiment: "negative", summary: "Caller said it was the wrong number." });
    expect(summarizeAnswers({ disposition: "not_interested" }).sentiment).toBe("negative");
    expect(summarizeAnswers({ disposition: "callback_requested" }).sentiment).toBe("positive");
  });
});
