import { beforeEach, describe, expect, it, vi } from "vitest";
import { maybeBookConsultation, pickOwner } from "@/lib/booking.server";
import type { CallVerdict } from "@/lib/crm-outcome";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase-admin.server", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const CONTACT = {
  id: "22222222-2222-2222-2222-222222222222",
  first_name: "Priya",
  last_name: "Patel",
  phone: "+919876543210",
};
const VERDICT: CallVerdict = {
  kind: "positive",
  label: "consultation booked",
  leadStatus: "qualified",
  dealStage: "proposal",
  probability: 40,
  score: 80,
};

describe("booking.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("pickOwner", () => {
    it("prefers dealOwnerId when they are an active member", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { user_id: "u-deal-owner", role: "sales_manager" },
                  { user_id: "u-rep-1", role: "sales_rep" },
                ],
              }),
            }),
          };
        }
        return {};
      });

      const owner = await pickOwner(ORG_ID, "u-deal-owner");
      expect(owner).toBe("u-deal-owner");
    });

    it("round-robins by fewest upcoming meetings in next 7 days, breaking ties by name", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { user_id: "u-rep-b", role: "sales_rep" },
                  { user_id: "u-rep-a", role: "sales_rep" },
                  { user_id: "u-rep-c", role: "sales_rep" },
                ],
              }),
            }),
          };
        }
        if (table === "organizations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { meeting_assignment: { mode: "deal_owner_then_round_robin", role: "sales_rep" } },
                }),
              }),
            }),
          };
        }
        if (table === "meetings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  neq: vi.fn().mockReturnValue({
                    gte: vi.fn().mockReturnValue({
                      lte: vi.fn().mockResolvedValue({
                        data: [
                          { owner_id: "u-rep-a" },
                          { owner_id: "u-rep-a" },
                          { owner_id: "u-rep-b" },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "u-rep-a", full_name: "Ananya" },
                  { id: "u-rep-b", full_name: "Bharat" },
                  { id: "u-rep-c", full_name: "Chetan" },
                ],
              }),
            }),
          };
        }
        return {};
      });

      // u-rep-c has 0 meetings, u-rep-b has 1, u-rep-a has 2 -> u-rep-c wins
      expect(await pickOwner(ORG_ID, null)).toBe("u-rep-c");
    });

    it("returns null when no members match the configured role", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ user_id: "u-owner", role: "owner" }],
              }),
            }),
          };
        }
        if (table === "organizations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          };
        }
        return {};
      });

      expect(await pickOwner(ORG_ID, null)).toBeNull();
    });
  });

  describe("maybeBookConsultation", () => {
    it("creates a meeting with IST->UTC time and ignores duplicate call_id on retry", async () => {
      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockResolvedValueOnce({ data: { id: "m-1" }, error: null })
            .mockResolvedValueOnce({ data: null, error: null }), // duplicate replay ignored
        }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u-1", role: "sales_rep" }] }),
            }),
          };
        }
        if (table === "meetings") {
          return { upsert: upsertMock };
        }
        return {};
      });

      const call = {
        id: "33333333-3333-3333-3333-333333333333",
        organization_id: ORG_ID,
        ended_at: "2026-11-23T08:30:00.000Z", // 14:00 IST Monday
        summary: "Caller wants term insurance advice",
        answers: {
          disposition: "consultation_booked",
          follow_up_time: "tomorrow 11 AM",
          consultation_mode: "video",
        },
      };

      // Run "just after the call ended" so the agreed time is still in the future.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-23T08:31:00.000Z"));
      const first = await maybeBookConsultation(call, CONTACT, "deal-1", VERDICT, "u-1");
      expect(first).toEqual({ booked: true, taskCreated: false });
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          call_id: call.id,
          deal_id: "deal-1",
          owner_id: "u-1",
          source: "call",
          location: "video",
          starts_at: "2026-11-24T05:30:00.000Z", // 11:00 IST -> 05:30 UTC
        }),
        { onConflict: "call_id", ignoreDuplicates: true }
      );

      const replay = await maybeBookConsultation(call, CONTACT, "deal-1", VERDICT, "u-1");
      expect(replay).toEqual({ booked: false, taskCreated: false });
      vi.useRealTimers();
    });

    it("doesn't book a time that has already passed (old call re-synced)", async () => {
      const upsertMock = vi.fn();
      mockFrom.mockImplementation((table: string) => {
        if (table === "memberships") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u-1", role: "sales_rep" }] }) }) };
        }
        if (table === "meetings") return { upsert: upsertMock };
        return {};
      });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-26T08:00:00.000Z")); // three days after the agreed time
      const call = {
        id: "44444444-4444-4444-4444-444444444444",
        organization_id: ORG_ID,
        ended_at: "2026-11-23T08:30:00.000Z",
        summary: null,
        answers: { disposition: "consultation_booked", follow_up_time: "tomorrow 11 AM" },
      };
      const result = await maybeBookConsultation(call, CONTACT, null, VERDICT, "u-1");
      vi.useRealTimers();
      expect(result).toEqual({ booked: false, taskCreated: false });
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it("books a site visit from the real estate agent's site_visit_time", async () => {
      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "m-2" }, error: null }) }),
      });
      mockFrom.mockImplementation((table: string) => {
        if (table === "memberships") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u-1", role: "sales_rep" }] }) }) };
        }
        if (table === "meetings") return { upsert: upsertMock };
        return {};
      });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-23T08:31:00.000Z"));
      const call = {
        id: "55555555-5555-5555-5555-555555555555",
        organization_id: ORG_ID,
        ended_at: "2026-11-23T08:30:00.000Z",
        summary: "Wants a 3BHK in Kondapur",
        answers: { disposition: "site_visit_booked", site_visit_time: "tomorrow 11 AM" },
      };
      const result = await maybeBookConsultation(call, CONTACT, null, { ...VERDICT, label: "site visit booked" }, "u-1");
      vi.useRealTimers();
      expect(result).toEqual({ booked: true, taskCreated: false });
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Site visit: Priya Patel", location: "in person", starts_at: "2026-11-24T05:30:00.000Z" }),
        { onConflict: "call_id", ignoreDuplicates: true }
      );
    });

    it("creates a confirm-time task (and no meeting) when follow_up_time cannot be parsed", async () => {
      const taskInsertMock = vi.fn().mockResolvedValue({ error: null });
      const meetingUpsertMock = vi.fn();

      mockFrom.mockImplementation((table: string) => {
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u-1", role: "sales_rep" }] }),
            }),
          };
        }
        if (table === "tasks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      like: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: taskInsertMock,
          };
        }
        if (table === "meetings") {
          return { upsert: meetingUpsertMock };
        }
        return {};
      });

      const call = {
        id: "44444444-4444-4444-4444-444444444444",
        organization_id: ORG_ID,
        ended_at: "2026-11-23T08:30:00.000Z",
        summary: "Caller wants a consultation",
        answers: {
          disposition: "consultation_booked",
          follow_up_time: "sometime next month maybe",
        },
      };

      const res = await maybeBookConsultation(call, CONTACT, null, VERDICT, "u-1");
      expect(res).toEqual({ booked: false, taskCreated: true });
      expect(meetingUpsertMock).not.toHaveBeenCalled();
      expect(taskInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Confirm consultation time with Priya Patel (said: 'sometime next month maybe')",
          assignee_id: "u-1",
        })
      );
    });
  });
});
