import { describe, expect, it } from "vitest";
import { kycFromAnswers, maskPan, mergeKyc, orderFromAnswers, parseDob, parseRupees, redactAnswers, toFrequency, toProductType } from "@/lib/call-capture";
import { extractAnswers, summarizeAnswers } from "@/lib/sarvam-call";

const today = new Date("2026-11-25T00:00:00Z");

describe("maskPan / redactAnswers", () => {
  it("masks a valid PAN and rejects anything else", () => {
    expect(maskPan("abcde1234f")).toBe("ABCxxxxx4F");
    expect(maskPan("ABCDE 1234 F")).toBe("ABCxxxxx4F");
    expect(maskPan("1234")).toBeNull();
    expect(maskPan("")).toBeNull();
  });

  it("never lets a full PAN through extractAnswers", () => {
    const answers = extractAnswers({ kyc_pan: "ABCDE1234F", disposition: "interested" });
    expect(answers.kyc_pan).toBe("ABCxxxxx4F");
    expect(JSON.stringify(answers)).not.toContain("ABCDE1234F");
    expect(redactAnswers({ kyc_pan: "not a pan", a: "1" })).toEqual({ a: "1" });
  });

  it("keeps KYC details out of the fallback summary", () => {
    const { summary } = summarizeAnswers({ disposition: "interested", kyc_dob: "1990-05-14", kyc_email: "a@b.com" });
    expect(summary).not.toMatch(/1990|a@b\.com/);
  });
});

describe("parseDob", () => {
  it("reads common spoken and written formats", () => {
    expect(parseDob("1990-05-14", today)).toBe("1990-05-14");
    expect(parseDob("14/05/1990", today)).toBe("1990-05-14");
    expect(parseDob("14th May 1990", today)).toBe("1990-05-14");
    expect(parseDob("May 14, 1990", today)).toBe("1990-05-14");
    expect(parseDob("2 September 1985", today)).toBe("1985-09-02");
  });

  it("rejects impossible or future dates", () => {
    expect(parseDob("31/02/1990", today)).toBeNull();
    expect(parseDob("2030-01-01", today)).toBeNull();
    expect(parseDob("1800-01-01", today)).toBeNull();
    expect(parseDob("sometime in may", today)).toBeNull();
  });
});

describe("parseRupees / mapping", () => {
  it("understands lakh, crore and k", () => {
    expect(parseRupees("5 lakh")).toBe(500000);
    expect(parseRupees("1.5 crore")).toBe(15000000);
    expect(parseRupees("₹25,000")).toBe(25000);
    expect(parseRupees("50k")).toBe(50000);
    expect(parseRupees("not sure")).toBeNull();
  });

  it("maps product and payment frequency words", () => {
    expect(toProductType("family_floater")).toBe("family_floater");
    expect(toProductType("Health")).toBe("health");
    expect(toProductType("car insurance")).toBe("motor");
    expect(toProductType("renewal")).toBe("other");
    expect(toFrequency("half yearly")).toBe("half_yearly");
    expect(toFrequency("monthly")).toBe("monthly");
    expect(toFrequency("")).toBe("yearly");
  });
});

describe("kycFromAnswers", () => {
  const base = {
    kyc_consent: "yes", kyc_full_name: "Ramesh Kumar", kyc_dob: "14/05/1990", kyc_email: "ramesh at gmail dot com",
    kyc_address: "Flat 4, Madhapur", kyc_city: "Hyderabad", kyc_pincode: "500 081", kyc_nominee_name: "Sita", kyc_nominee_relation: "spouse",
  };

  it("needs consent", () => {
    expect(kycFromAnswers({ ...base, kyc_consent: "no" })).toBeNull();
    expect(kycFromAnswers({ ...base, kyc_consent: "" })).toBeNull();
  });

  it("cleans each field and drops invalid ones", () => {
    expect(kycFromAnswers(base)).toEqual({
      full_name: "Ramesh Kumar", date_of_birth: "1990-05-14", email: "ramesh@gmail.com", address_line: "Flat 4, Madhapur",
      city: "Hyderabad", pincode: "500081", nominee_name: "Sita", nominee_relation: "spouse", pan_masked: null,
    });
    expect(kycFromAnswers({ kyc_consent: "yes", kyc_pincode: "12", kyc_email: "nope" })).toBeNull();
    expect(kycFromAnswers({ kyc_consent: "yes", kyc_pan: "ABCxxxxx4F" })?.pan_masked).toBe("ABCxxxxx4F");
  });

  it("never blanks a saved detail when the new call didn't collect it", () => {
    const incoming = kycFromAnswers({ kyc_consent: "yes", kyc_email: "new@mail.com" })!;
    expect(mergeKyc({ email: "old@mail.com", city: "Hyderabad" }, incoming)).toMatchObject({ email: "new@mail.com", city: "Hyderabad" });
  });
});

describe("orderFromAnswers", () => {
  it("only creates an order when the customer asked to go ahead", () => {
    expect(orderFromAnswers({ order_confirmed: "no", insurance_type: "health" })).toBeNull();
    expect(orderFromAnswers({ insurance_type: "health" })).toBeNull();
  });

  it("captures the request", () => {
    expect(orderFromAnswers({
      order_confirmed: "Yes", insurance_type: "family_floater", order_plan: "Optima Secure", order_insurer: "HDFC Ergo",
      order_sum_insured: "10 lakh", order_budget: "25000", order_payment_frequency: "monthly",
    })).toEqual({
      product_type: "family_floater", plan_name: "Optima Secure", insurer: "HDFC Ergo", sum_insured: 1000000, budget: 25000, payment_frequency: "monthly",
    });
  });
});
