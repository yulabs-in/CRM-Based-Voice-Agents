import { describe, expect, it, vi, beforeEach } from "vitest";
import { decodeCursor, encodeCursor, parseLimit } from "@/lib/api/pagination";
import {
  getContactById,
  createOrUpdateContact,
  updateContact,
} from "@/lib/api/contacts.server";

// Mock supabaseAdmin
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/supabase-admin.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    })),
  },
}));

describe("API Pagination & Cross-Org Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Pagination utilities", () => {
    it("encodes and decodes cursor properly", () => {
      const createdAt = "2026-11-24T10:00:00.000Z";
      const id = "33333333-3333-3333-3333-333333333333";

      const cursor = encodeCursor(createdAt, id);
      expect(typeof cursor).toBe("string");

      const decoded = decodeCursor(cursor);
      expect(decoded).not.toBeNull();
      expect(decoded?.createdAt).toBe(createdAt);
      expect(decoded?.id).toBe(id);
    });

    it("returns null for empty cursors and throws 400 ApiError for malformed cursors", () => {
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor("")).toBeNull();
      expect(() => decodeCursor("invalid_base64_string")).toThrow(/Invalid pagination cursor/);
      expect(() => decodeCursor(encodeCursor("not-a-date", "not-a-uuid"))).toThrow(/Invalid pagination cursor/);
    });

    it("clamps limit between 1 and 200, with default 50", () => {
      expect(parseLimit(null)).toBe(50);
      expect(parseLimit("")).toBe(50);
      expect(parseLimit("0")).toBe(50);
      expect(parseLimit("-10")).toBe(50);
      expect(parseLimit("invalid")).toBe(50);
      expect(parseLimit("25")).toBe(25);
      expect(parseLimit("500")).toBe(200); // Clamped to 200 max
    });
  });

  describe("Cross-Org Isolation (Critical Security)", () => {
    const orgA = "11111111-1111-1111-1111-111111111111";
    const orgB = "22222222-2222-2222-2222-222222222222";
    const contactId = "33333333-3333-3333-3333-333333333333";

    it("strictly isolates contact lookups: getContactById filters by organization_id", async () => {
      // Mocking Supabase query builder
      const eqOrgMock = vi.fn();
      const eqIdMock = vi.fn();

      mockSelect.mockReturnValue({ eq: eqOrgMock });
      eqOrgMock.mockImplementation((col: string, val: string) => {
        expect(col).toBe("organization_id");
        expect(val).toBe(orgA);
        return { eq: eqIdMock };
      });

      eqIdMock.mockImplementation((col: string, val: string) => {
        expect(col).toBe("id");
        expect(val).toBe(contactId);
        return {
          maybeSingle: mockMaybeSingle.mockResolvedValueOnce({
            data: null, // Not found in Org A
            error: null,
          }),
        };
      });

      const result = await getContactById(orgA, contactId);
      expect(result).toBeNull();
      expect(eqOrgMock).toHaveBeenCalledWith("organization_id", orgA);
      expect(eqIdMock).toHaveBeenCalledWith("id", contactId);
    });

    it("normalizes phone and enforces org scoping on contact creation", async () => {
      const eqOrgMock = vi.fn();
      const eqPhoneMock = vi.fn();

      mockSelect.mockReturnValue({ eq: eqOrgMock });
      eqOrgMock.mockReturnValue({ eq: eqPhoneMock });
      eqPhoneMock.mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
      });

      const singleMock = vi.fn().mockResolvedValueOnce({
        data: {
          id: "new-contact-id",
          organization_id: orgA,
          first_name: "John",
          phone: "+919876543210",
        },
        error: null,
      });

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({ single: singleMock }),
      });

      const result = await createOrUpdateContact(orgA, {
        first_name: "John",
        phone: "9876543210", // Raw 10 digits
      });

      expect(result.isNew).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: orgA,
          first_name: "John",
          phone: "+919876543210", // Normalized to E.164
        })
      );
    });

    it("rejects invalid phone numbers with a validation error", async () => {
      await expect(
        createOrUpdateContact(orgA, {
          first_name: "Bad Phone",
          phone: "123", // invalid mobile
        })
      ).rejects.toThrow(/Invalid phone number/);
    });

    it("returns null for non-UUID contact ids without querying DB", async () => {
      const result = await getContactById(orgA, "not-a-uuid");
      expect(result).toBeNull();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("rejects cross-org project_id on contact creation with 404", async () => {
      const foreignProjectId = "99999999-9999-9999-9999-999999999999";
      const eqId = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
        }),
      });
      mockSelect.mockReturnValue({ eq: eqId });

      await expect(
        createOrUpdateContact(orgA, {
          first_name: "Cross Tenant",
          phone: "9876543210",
          project_id: foreignProjectId,
        })
      ).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });
  });
});
