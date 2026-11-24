import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  authenticateApiKey,
  checkRateLimit,
  constantTimeStringEqual,
  generateRawApiKey,
  hashApiKey,
  resetRateLimits,
} from "@/lib/api-auth.server";

// Mock supabaseAdmin
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/supabase-admin.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          is: mockIs.mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      }),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

describe("api-auth.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  describe("hashApiKey", () => {
    it("is deterministic (same input produces identical SHA-256 hash)", async () => {
      const key = "yk_live_testkey1234567890abcdef";
      const hash1 = await hashApiKey(key);
      const hash2 = await hashApiKey(key);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // 32 bytes hex = 64 characters
    });

    it("different inputs produce completely different hashes", async () => {
      const hashA = await hashApiKey("yk_live_keyA");
      const hashB = await hashApiKey("yk_live_keyB");
      expect(hashA).not.toBe(hashB);
    });
  });

  describe("generateRawApiKey", () => {
    it("generates a valid key format starting with yk_live_ and adequate length", () => {
      const key = generateRawApiKey();
      expect(key.startsWith("yk_live_")).toBe(true);
      expect(key.length).toBeGreaterThanOrEqual(40);
    });

    it("generates unique keys each time", () => {
      const key1 = generateRawApiKey();
      const key2 = generateRawApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe("constantTimeStringEqual", () => {
    it("returns true for identical strings", () => {
      expect(constantTimeStringEqual("hash12345", "hash12345")).toBe(true);
    });

    it("returns false for different lengths", () => {
      expect(constantTimeStringEqual("hash123", "hash12345")).toBe(false);
    });

    it("returns false for same length but different characters", () => {
      expect(constantTimeStringEqual("hash1234a", "hash1234b")).toBe(false);
    });
  });

  describe("checkRateLimit", () => {
    it("allows up to 60 requests and blocks the 61st", () => {
      const keyId = "key-test-123";
      for (let i = 1; i <= 60; i++) {
        const res = checkRateLimit(keyId, 60, 60_000);
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(60 - i);
      }

      // 61st request should be rejected
      const blocked = checkRateLimit(keyId, 60, 60_000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  describe("authenticateApiKey", () => {
    const validRawKey = "yk_live_secret1234567890abcdefghij";
    const validOrgId = "org-1111-2222";
    const validKeyId = "key-uuid-1234";

    it("throws 401 when Authorization header is missing", async () => {
      const req = new Request("http://localhost/api/v1/contacts");
      await expect(authenticateApiKey(req, "contacts:read")).rejects.toThrow(ApiError);
      try {
        await authenticateApiKey(req, "contacts:read");
      } catch (err: any) {
        expect(err.status).toBe(401);
        expect(err.code).toBe("unauthorized");
      }
    });

    it("throws 401 when header format is not Bearer yk_live_...", async () => {
      const req = new Request("http://localhost/api/v1/contacts", {
        headers: { Authorization: "Basic invalid_credentials" },
      });
      await expect(authenticateApiKey(req, "contacts:read")).rejects.toMatchObject({
        status: 401,
        code: "unauthorized",
      });
    });

    it("throws 401 when API key is unknown or revoked in DB", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const req = new Request("http://localhost/api/v1/contacts", {
        headers: { Authorization: `Bearer ${validRawKey}` },
      });

      await expect(authenticateApiKey(req, "contacts:read")).rejects.toMatchObject({
        status: 401,
        code: "unauthorized",
      });
    });

    it("throws 403 when key lacks the required scope", async () => {
      const hash = await hashApiKey(validRawKey);
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: validKeyId,
          organization_id: validOrgId,
          key_hash: hash,
          scopes: ["contacts:read"], // Only read
          revoked_at: null,
        },
        error: null,
      });

      const req = new Request("http://localhost/api/v1/contacts", {
        headers: { Authorization: `Bearer ${validRawKey}` },
      });

      // Requesting contacts:write
      await expect(authenticateApiKey(req, "contacts:write")).rejects.toMatchObject({
        status: 403,
        code: "forbidden",
      });
    });

    it("successfully authenticates and returns context when valid", async () => {
      const hash = await hashApiKey(validRawKey);
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: validKeyId,
          organization_id: validOrgId,
          key_hash: hash,
          scopes: ["contacts:read", "contacts:write"],
          revoked_at: null,
        },
        error: null,
      });

      const req = new Request("http://localhost/api/v1/contacts", {
        headers: { Authorization: `Bearer ${validRawKey}` },
      });

      const ctx = await authenticateApiKey(req, "contacts:read");
      expect(ctx.organizationId).toBe(validOrgId);
      expect(ctx.keyId).toBe(validKeyId);
      expect(ctx.scopes).toContain("contacts:read");
      expect(ctx.rateLimit.allowed).toBe(true);
    });
  });
});
