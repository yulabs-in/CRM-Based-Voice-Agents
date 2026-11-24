import { beforeEach, describe, expect, it, vi } from "vitest";
import { notify, recipientsFor } from "@/lib/notify.server";

// Mock supabaseAdmin
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/lib/supabase-admin.server", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "memberships") {
        return {
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        };
      }
      if (table === "notifications") {
        return {
          upsert: mockUpsert,
        };
      }
      return {};
    }),
  },
}));

describe("notify.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recipientsFor", () => {
    const mockMembers = [
      { user_id: "user-owner", role: "owner" },
      { user_id: "user-admin", role: "admin" },
      { user_id: "user-manager", role: "sales_manager" },
      { user_id: "user-rep1", role: "sales_rep" },
      { user_id: "user-rep2", role: "sales_rep" },
    ];

    it("routes lead.interested to deal owner if set and present in members", async () => {
      mockEq.mockResolvedValueOnce({ data: mockMembers, error: null });

      const recipients = await recipientsFor("org-1", "lead.interested", {
        dealOwnerId: "user-rep1",
      });

      expect(recipients).toEqual(["user-rep1"]);
    });

    it("routes lead.interested to owner, admin, sales_manager when dealOwnerId is not provided", async () => {
      mockEq.mockResolvedValueOnce({ data: mockMembers, error: null });

      const recipients = await recipientsFor("org-1", "lead.interested");

      expect(recipients).toEqual(["user-owner", "user-admin", "user-manager"]);
    });

    it("routes consultation.booked to deal owner if set", async () => {
      mockEq.mockResolvedValueOnce({ data: mockMembers, error: null });

      const recipients = await recipientsFor("org-1", "consultation.booked", {
        dealOwnerId: "user-rep2",
      });

      expect(recipients).toEqual(["user-rep2"]);
    });

    it("routes consultation.booked to owner, admin, sales_manager when no deal owner is set", async () => {
      mockEq.mockResolvedValueOnce({ data: mockMembers, error: null });

      const recipients = await recipientsFor("org-1", "consultation.booked");

      expect(recipients).toEqual(["user-owner", "user-admin", "user-manager"]);
    });

    it("routes call.escalated to all managers/admins/owners PLUS deal owner", async () => {
      mockEq.mockResolvedValueOnce({ data: mockMembers, error: null });

      const recipients = await recipientsFor("org-1", "call.escalated", {
        dealOwnerId: "user-rep1",
      });

      expect(recipients).toEqual([
        "user-owner",
        "user-admin",
        "user-manager",
        "user-rep1",
      ]);
    });

    it("routes contact.do_not_contact only to owner and admin", async () => {
      mockEq.mockResolvedValueOnce({ data: mockMembers, error: null });

      const recipients = await recipientsFor("org-1", "contact.do_not_contact");

      expect(recipients).toEqual(["user-owner", "user-admin"]);
    });

    it("returns empty array gracefully if database query errors", async () => {
      mockEq.mockResolvedValueOnce({ data: null, error: { message: "DB Error" } });

      const recipients = await recipientsFor("org-1", "lead.interested");

      expect(recipients).toEqual([]);
    });
  });

  describe("notify", () => {
    it("inserts rows for all recipients with dedupe_key and onConflict", async () => {
      mockUpsert.mockResolvedValueOnce({ error: null });

      await notify({
        orgId: "org-1",
        type: "lead.interested",
        title: "New interested lead: Alice",
        body: "Interested in motor insurance",
        link: "/leads?contact=123",
        priority: "normal",
        recipients: ["user-1", "user-2"],
        dedupeKey: "call-999",
      });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        [
          {
            organization_id: "org-1",
            user_id: "user-1",
            type: "lead.interested",
            title: "New interested lead: Alice",
            body: "Interested in motor insurance",
            link: "/leads?contact=123",
            priority: "normal",
            dedupe_key: "lead.interested:call-999",
          },
          {
            organization_id: "org-1",
            user_id: "user-2",
            type: "lead.interested",
            title: "New interested lead: Alice",
            body: "Interested in motor insurance",
            link: "/leads?contact=123",
            priority: "normal",
            dedupe_key: "lead.interested:call-999",
          },
        ],
        {
          onConflict: "user_id, dedupe_key",
          ignoreDuplicates: true,
        }
      );
    });

    it("does not insert if recipients list is empty", async () => {
      await notify({
        orgId: "org-1",
        type: "lead.interested",
        title: "Test",
        recipients: [],
      });

      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("never throws an error even if database upsert throws or rejects", async () => {
      mockUpsert.mockRejectedValueOnce(new Error("Supabase network crash"));

      // Must resolve cleanly without throwing
      await expect(
        notify({
          orgId: "org-1",
          type: "call.escalated",
          title: "Escalation",
          recipients: ["user-1"],
        })
      ).resolves.toBeUndefined();
    });
  });
});
