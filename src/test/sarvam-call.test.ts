import { describe, expect, it } from "vitest";
import { formatSarvamTranscript, isApprovedSupportTestPhone, isValidCallbackToken, mapSarvamStatus, normalizePhoneNumber } from "@/lib/sarvam-call";

describe("Sarvam support call handling", () => {
  it("normalizes the supplied Indian mobile number for Sarvam", () => {
    expect(normalizePhoneNumber("8019628820")).toBe("+918019628820");
  });

  it("allows only the specifically approved test number", () => {
    expect(isApprovedSupportTestPhone("8019628820")).toBe(true);
    expect(isApprovedSupportTestPhone("+918019628820")).toBe(true);
    expect(isApprovedSupportTestPhone("8019628821")).toBe(false);
  });

  it("maps every Sarvam attempt result to a CRM call status", () => {
    expect(mapSarvamStatus("connected")).toBe("completed");
    expect(mapSarvamStatus("no_answer")).toBe("no_answer");
    expect(mapSarvamStatus("busy")).toBe("failed");
    expect(mapSarvamStatus("failed")).toBe("failed");
  });

  it("keeps who-said-what in the stored transcript", () => {
    expect(formatSarvamTranscript([
      { role: "agent", en_text: "How can I help?" },
      { role: "user", en_text: "I need support." },
    ])).toBe("Agent: How can I help?\nCustomer: I need support.");
  });

  it("accepts only the exact callback token hash for the matching call", () => {
    expect(isValidCallbackToken("abc123", "abc123")).toBe(true);
    expect(isValidCallbackToken("abc123", "different")).toBe(false);
    expect(isValidCallbackToken("abc123", null)).toBe(false);
  });
});