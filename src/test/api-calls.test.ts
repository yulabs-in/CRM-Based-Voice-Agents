import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALL_COLUMNS, getCallById, placeOutboundCall } from "@/lib/api/calls.server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase-admin.server", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.url/rec.mp3" } }),
      })),
    },
  },
}));

vi.mock("@/lib/sarvam.server", () => ({
  sarvamJson: vi.fn().mockRejectedValue(new Error("Sarvam 503 unavailable")),
  workspacePath: vi.fn(() => "/org/ws"),
  publicAppUrl: vi.fn((origin?: string) => origin || "https://example.com"),
  getOrgSarvamConfig: vi.fn().mockResolvedValue({ sarvamOrg: "o", workspace: "w" }),
}));

describe("API Calls security & reliability", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const agentId = "22222222-2222-2222-2222-222222222222";
  const foreignContactId = "99999999-9999-9999-9999-999999999999";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never exposes internal recording_path in CALL_COLUMNS", () => {
    expect(CALL_COLUMNS).not.toContain("recording_path");
  });

  it("returns null for non-UUID call ids without throwing 500", async () => {
    const res = await getCallById(orgA, "not-a-uuid");
    expect(res).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects cross-org contact_id on outbound call with 404", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "contacts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    await expect(
      placeOutboundCall(orgA, {
        phone: "9876543210",
        agent_id: agentId,
        contact_id: foreignContactId,
        consent_confirmed: true,
      })
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("rejects inactive voice agents with 400", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "contacts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValueOnce({ data: [] }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "voice_agents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValueOnce({
                  data: { id: agentId, status: "inactive" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    await expect(
      placeOutboundCall(orgA, {
        phone: "9876543210",
        agent_id: agentId,
        consent_confirmed: true,
      })
    ).rejects.toMatchObject({ status: 400, code: "agent_inactive" });
  });

  it("marks call as failed and throws 502 if Sarvam dispatch fails", async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    mockFrom.mockImplementation((table: string) => {
      if (table === "contacts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValueOnce({ data: [] }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "voice_agents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValueOnce({
                  data: { id: agentId, status: "active", greeting: "Hi" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "calls") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValueOnce({
                data: { id: "44444444-4444-4444-4444-444444444444", status: "queued" },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        };
      }
      return {};
    });

    await expect(
      placeOutboundCall(orgA, {
        phone: "9876543210",
        agent_id: agentId,
        consent_confirmed: true,
      })
    ).rejects.toMatchObject({ status: 502, code: "call_dispatch_failed" });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        sarvam_status: "failed",
      })
    );
  });
});
