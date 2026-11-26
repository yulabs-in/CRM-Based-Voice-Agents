import { describe, expect, it } from "vitest";
import {
  aadhaarLast4, clientDocumentPath, isValidAadhaar, isValidPan, maskedPan, ownerDocumentPath, safeFileName, validateDocumentFile,
} from "@/lib/kyc-documents";

// A made-up number with a valid Verhoeff check digit (not a real Aadhaar).
const TEST_AADHAAR = "499712345672";

describe("validateDocumentFile", () => {
  it("accepts JPG, PNG, WebP and PDF up to 5 MB", () => {
    expect(validateDocumentFile({ type: "image/jpeg", size: 200_000, name: "a.jpg" })).toBeNull();
    expect(validateDocumentFile({ type: "application/pdf", size: 5 * 1024 * 1024, name: "a.pdf" })).toBeNull();
  });
  it("rejects other types, empty and oversized files", () => {
    expect(validateDocumentFile({ type: "image/gif", size: 10, name: "a.gif" })).toMatch(/JPG, PNG, WebP or PDF/);
    expect(validateDocumentFile({ type: "image/png", size: 0, name: "a.png" })).toMatch(/empty/);
    expect(validateDocumentFile({ type: "image/png", size: 5 * 1024 * 1024 + 1, name: "a.png" })).toMatch(/5 MB/);
  });
});

describe("storage paths", () => {
  it("keeps files in the folders the policies expect, with safe names", () => {
    expect(safeFileName("My Aadhaar (front).JPG")).toBe("my-aadhaar-front.jpg");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\pan.PDF")).toBe("pan.pdf");
    expect(clientDocumentPath("org", "contact", "id1", "PAN Card.pdf")).toBe("org/clients/contact/id1-pan-card.pdf");
    expect(ownerDocumentPath("org", "id2", "aadhaar back.png")).toBe("org/owner/id2-aadhaar-back.png");
  });
});

describe("PAN", () => {
  it("validates the format and stores only the masked form", () => {
    expect(isValidPan("abcde1234f")).toBe(true);
    expect(isValidPan("ABCDE12345")).toBe(false);
    expect(maskedPan("ABCDE1234F")).toBe("ABCxxxxx4F");
    expect(maskedPan("bad")).toBeNull();
  });
});

describe("Aadhaar", () => {
  it("checks the Verhoeff digit and the 12-digit format", () => {
    expect(isValidAadhaar(TEST_AADHAAR)).toBe(true);
    expect(isValidAadhaar("4997 1234 5672")).toBe(true);
    expect(isValidAadhaar("499712345673")).toBe(false); // wrong check digit
    expect(isValidAadhaar("123412341234")).toBe(false); // can't start with 1
    expect(isValidAadhaar("49971234567")).toBe(false); // 11 digits
  });
  it("keeps only the last four digits", () => {
    expect(aadhaarLast4(TEST_AADHAAR)).toBe("5672");
    expect(aadhaarLast4("499712345673")).toBeNull();
  });
});
