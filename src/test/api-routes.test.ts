import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiKey } from "@/lib/api-auth.server";
import { Route as ContactsRoute } from "@/routes/api/v1/contacts";
import { Route as ContactByIdRoute } from "@/routes/api/v1/contacts.$id";
import { Route as CallsRoute } from "@/routes/api/v1/calls";
import { Route as CallByIdRoute } from "@/routes/api/v1/calls.$id";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const RAW_KEY = "yk_live_RouteTestKey1234567890ABCDEF";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase-admin.server", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: null } }),
      })),
    },
  },
}));

type HandlerFn = (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>;

function getHandlers(route: unknown): Record<string, HandlerFn> {
  return (route as { options: { server: { handlers: Record<string, HandlerFn> } } }).options.server.handlers;
}

describe("REST /api/v1 route handlers", () => {
  let keyHash: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    keyHash = await hashApiKey(RAW_KEY);
  });

  function mockApiKeyAuth(scopes: string[], orgId = ORG_A) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "key-1",
                organization_id: orgId,
                key_hash: keyHash,
                scopes,
                revoked_at: null,
              },
              error: null,
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  }

  it("returns 401 when Authorization header is missing", async () => {
    const { GET } = getHandlers(ContactsRoute);
    const res = await GET({ request: new Request("http://localhost/api/v1/contacts") });
    expect(res.status).toBe(401);
  });

  it("returns 403 when key lacks required scope", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return mockApiKeyAuth(["leads:read"]);
      return {};
    });

    const { GET } = getHandlers(ContactsRoute);
    const res = await GET({
      request: new Request("http://localhost/api/v1/contacts", {
        headers: { Authorization: `Bearer ${RAW_KEY}` },
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-UUID contact id and call id", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return mockApiKeyAuth(["contacts:read", "calls:read"]);
      return {};
    });

    const contactRes = await getHandlers(ContactByIdRoute).GET({
      request: new Request("http://localhost/api/v1/contacts/not-a-uuid", {
        headers: { Authorization: `Bearer ${RAW_KEY}` },
      }),
      params: { id: "not-a-uuid" },
    });
    expect(contactRes.status).toBe(404);

    const callRes = await getHandlers(CallByIdRoute).GET({
      request: new Request("http://localhost/api/v1/calls/not-a-uuid", {
        headers: { Authorization: `Bearer ${RAW_KEY}` },
      }),
      params: { id: "not-a-uuid" },
    });
    expect(callRes.status).toBe(404);
  });

  it("enforces org isolation on GET /api/v1/contacts/:id (404 for other org's contact)", async () => {
    const orgBContactId = "33333333-3333-3333-3333-333333333333";

    mockFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return mockApiKeyAuth(["contacts:read"], ORG_A);
      if (table === "contacts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              expect(col).toBe("organization_id");
              expect(val).toBe(ORG_A);
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              };
            }),
          }),
        };
      }
      return {};
    });

    const res = await getHandlers(ContactByIdRoute).GET({
      request: new Request(`http://localhost/api/v1/contacts/${orgBContactId}`, {
        headers: { Authorization: `Bearer ${RAW_KEY}` },
      }),
      params: { id: orgBContactId },
    });
    expect(res.status).toBe(404);
  });

  it("rejects cross-org contact_id on POST /api/v1/calls with 404", async () => {
    const orgBContactId = "33333333-3333-3333-3333-333333333333";
    const agentId = "44444444-4444-4444-4444-444444444444";

    mockFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return mockApiKeyAuth(["calls:write"], ORG_A);
      if (table === "contacts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getHandlers(CallsRoute).POST({
      request: new Request("http://localhost/api/v1/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RAW_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: "9876543210",
          agent_id: agentId,
          contact_id: orgBContactId,
          consent_confirmed: true,
        }),
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid pagination cursor and handles commas in q search safely", async () => {
    const orMock = vi.fn().mockReturnThis();
    const orderMock = vi.fn().mockReturnThis();
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return mockApiKeyAuth(["contacts:read"], ORG_A);
      if (table === "contacts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: orMock,
              order: orderMock,
              limit: limitMock,
            }),
          }),
        };
      }
      return {};
    });

    const badCursorRes = await getHandlers(ContactsRoute).GET({
      request: new Request("http://localhost/api/v1/contacts?cursor=invalid_cursor", {
        headers: { Authorization: `Bearer ${RAW_KEY}` },
      }),
    });
    expect(badCursorRes.status).toBe(400);

    const commaSearchRes = await getHandlers(ContactsRoute).GET({
      request: new Request("http://localhost/api/v1/contacts?q=john,doe", {
        headers: { Authorization: `Bearer ${RAW_KEY}` },
      }),
    });
    expect(commaSearchRes.status).toBe(200);
    expect(orMock).toHaveBeenCalledWith(
      expect.not.stringContaining("john,doe")
    );
  });
});
