import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { isOriginAllowed, isWithinCallingHours, maskPhone, nextCallingWindowStart } from "@/lib/widget";
import { handleWidgetSubmit, resetWidgetRateLimits } from "@/lib/widget.server";

const sarvamMocks = vi.hoisted(() => ({
  sarvamJson: vi.fn(),
  workspacePath: vi.fn(() => "/orgs/o/workspaces/w"),
  publicAppUrl: vi.fn(() => "https://crm.example.com"),
  getOrgSarvamConfig: vi.fn(async () => ({ sarvamOrg: "o", workspace: "w" })),
}));

vi.mock("@/lib/sarvam.server", () => sarvamMocks);

function makeFakeClient({
  existingContacts = [] as Array<{ id: string; phone: string; status: string; tags: string[]; custom_fields: Record<string, unknown>; project_id: string | null }>,
  agentActive = true,
} = {}) {
  const insertedContacts: Array<Record<string, unknown>> = [];
  const insertedTasks: Array<Record<string, unknown>> = [];
  const insertedCalls: Array<Record<string, unknown>> = [];

  const widgetRow = {
    id: "w-1",
    organization_id: "org-1",
    widget_key: "wk_test123456",
    allowed_domains: ["example.com", "localhost:5500"],
    project_id: "proj-1",
    agent_id: "agent-1",
    instant_callback: true,
    calling_hours: { start: "09:00", end: "20:00", tz: "Asia/Kolkata" },
    appearance: { colour: "#6d28d9", title: "Get a call back", button: "Call me" },
    privacy_url: "https://example.com/privacy",
  };

  const client = {
    from: (table: string) => {
      if (table === "widget_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: widgetRow, error: null }),
            }),
          }),
        };
      }
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { name: "Acme Corp" }, error: null }),
            }),
          }),
        };
      }
      if (table === "contacts") {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                limit: async () => ({ data: existingContacts, error: null }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            insertedContacts.push(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: "contact-new" }, error: null }),
              }),
            };
          },
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "voice_agents") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: agentActive
                    ? {
                        id: "agent-1",
                        status: "active",
                        greeting: "Hi {{customer_name}}",
                        greeting_no_name: "Hi there",
                        agent_variables: {},
                        sarvam_agent_id: "app-1",
                        sarvam_app_version: 1,
                        sarvam_connection_id: "conn-1",
                        sarvam_agent_phone_number: "+919999999999",
                      }
                    : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "calls") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  gte: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            insertedCalls.push(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: "call-1" }, error: null }),
              }),
            };
          },
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "tasks") {
        return {
          insert: async (row: Record<string, unknown>) => {
            insertedTasks.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;

  return { client, insertedContacts, insertedTasks, insertedCalls };
}

describe("widget helpers and submit handler", () => {
  beforeEach(() => {
    resetWidgetRateLimits();
    vi.clearAllMocks();
    sarvamMocks.sarvamJson.mockResolvedValue({ attempt_id: "att-123" });
  });

  describe("isOriginAllowed", () => {
    it("matches exact domains, ports, http/https, and localhost:*", () => {
      expect(isOriginAllowed("https://example.com", ["example.com"])).toBe(true);
      expect(isOriginAllowed("http://example.com", ["example.com"])).toBe(true);
      expect(isOriginAllowed("https://www.example.com", ["example.com"])).toBe(false);
      expect(isOriginAllowed("https://www.example.com", ["www.example.com"])).toBe(true);
      expect(isOriginAllowed("http://localhost:5500", ["localhost:5500"])).toBe(true);
      expect(isOriginAllowed("http://localhost:3000", ["localhost:5500"])).toBe(false);
      expect(isOriginAllowed("http://localhost:3000", ["localhost:*"])).toBe(true);
      expect(isOriginAllowed(null, ["example.com"])).toBe(false);
      expect(isOriginAllowed("not-a-url", ["example.com"])).toBe(false);
    });
  });

  describe("calling hours and masking", () => {
    it("detects inside vs outside calling hours in IST", () => {
      const hours = { start: "09:00", end: "20:00", tz: "Asia/Kolkata" };
      // 11:00 IST == 05:30 UTC
      expect(isWithinCallingHours(hours, new Date("2026-11-23T05:30:00.000Z"))).toBe(true);
      // 22:00 IST == 16:30 UTC
      expect(isWithinCallingHours(hours, new Date("2026-11-23T16:30:00.000Z"))).toBe(false);
      const next = nextCallingWindowStart(hours, new Date("2026-11-23T16:30:00.000Z"));
      expect(next.toISOString()).toBe("2026-11-24T03:30:00.000Z"); // 09:00 IST next day
    });

    it("masks phone numbers", () => {
      expect(maskPhone("+919876543210")).toBe("+91****10");
    });
  });

  describe("handleWidgetSubmit", () => {
    const insideHours = new Date("2026-11-23T05:30:00.000Z"); // 11:00 IST
    const outsideHours = new Date("2026-11-23T16:30:00.000Z"); // 22:00 IST
    const renderedAt = insideHours.getTime() - 10_000;

    it("drops honeypot submissions silently with 200", async () => {
      const { client, insertedContacts } = makeFakeClient();
      const res = await handleWidgetSubmit({
        client,
        input: { key: "wk_test123456", name: "Bot", phone: "9876543210", company_website: "http://spam.test", renderedAt },
        origin: "https://example.com",
        referer: "https://example.com/pricing",
        ip: "1.2.3.4",
        now: insideHours,
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, callback: "none" });
      expect(insertedContacts).toHaveLength(0);
    });

    it("drops too-fast submissions (< 3s) silently with 200", async () => {
      const { client, insertedContacts } = makeFakeClient();
      const res = await handleWidgetSubmit({
        client,
        input: { key: "wk_test123456", name: "Fast Bot", phone: "9876543210", renderedAt: insideHours.getTime() - 1000 },
        origin: "https://example.com",
        referer: null,
        ip: "1.2.3.4",
        now: insideHours,
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, callback: "none" });
      expect(insertedContacts).toHaveLength(0);
    });

    it("rejects disallowed origin with 403 and invalid phone with 400", async () => {
      const { client } = makeFakeClient();
      const badOrigin = await handleWidgetSubmit({
        client,
        input: { key: "wk_test123456", name: "Alice", phone: "9876543210", renderedAt },
        origin: "https://evil.com",
        referer: null,
        ip: "1.2.3.4",
        now: insideHours,
      });
      expect(badOrigin.status).toBe(403);

      const badPhone = await handleWidgetSubmit({
        client,
        input: { key: "wk_test123456", name: "Alice", phone: "123456", renderedAt },
        origin: "https://example.com",
        referer: null,
        ip: "1.2.3.4",
        now: insideHours,
      });
      expect(badPhone.status).toBe(400);
    });

    it("rate limits on the 6th request from the same IP with 429", async () => {
      const { client } = makeFakeClient();
      for (let i = 0; i < 5; i++) {
        const ok = await handleWidgetSubmit({
          client,
          input: { key: "wk_test123456", name: "User", phone: "9876543210", consent: false, renderedAt },
          origin: "https://example.com",
          referer: null,
          ip: "9.9.9.9",
          now: insideHours,
        });
        expect(ok.status).toBe(200);
      }
      const sixth = await handleWidgetSubmit({
        client,
        input: { key: "wk_test123456", name: "User", phone: "9876543210", consent: false, renderedAt },
        origin: "https://example.com",
        referer: null,
        ip: "9.9.9.9",
        now: insideHours,
      });
      expect(sixth.status).toBe(429);
    });

    it("places instant callback within calling hours when consent is ticked", async () => {
      const { client, insertedContacts, insertedCalls } = makeFakeClient();
      const res = await handleWidgetSubmit({
        client,
        input: { key: "wk_test123456", name: "Priya Sharma", phone: "9876543210", interest: "Term Life", consent: true, renderedAt },
        origin: "https://example.com",
        referer: "https://example.com/quote",
        ip: "1.1.1.1",
        now: insideHours,
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, callback: "now" });
      expect(insertedContacts).toHaveLength(1);
      expect(insertedCalls).toHaveLength(1);
      expect(sarvamMocks.sarvamJson).toHaveBeenCalledTimes(1);
    });

    it("schedules a follow-up task outside calling hours instead of calling", async () => {
      const { client, insertedTasks } = makeFakeClient();
      const res = await handleWidgetSubmit({
        client,
        input: { key: "wk_test123456", name: "Rahul", phone: "9876543210", consent: true, renderedAt: outsideHours.getTime() - 5000 },
        origin: "https://example.com",
        referer: null,
        ip: "1.1.1.2",
        now: outsideHours,
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, callback: "scheduled" });
      expect(insertedTasks).toHaveLength(1);
      expect(sarvamMocks.sarvamJson).not.toHaveBeenCalled();
    });

    it("does not call when consent is false or when contact is blocked (DNC)", async () => {
      const { client } = makeFakeClient();
      const noConsent = await handleWidgetSubmit({
        client,
        input: { key: "wk_test123456", name: "No Consent", phone: "9876543210", consent: false, renderedAt },
        origin: "https://example.com",
        referer: null,
        ip: "1.1.1.3",
        now: insideHours,
      });
      expect(noConsent.body).toEqual({ ok: true, callback: "none" });
      expect(sarvamMocks.sarvamJson).not.toHaveBeenCalled();

      const blockedSetup = makeFakeClient({
        existingContacts: [
          { id: "c-dnc", phone: "+919876543210", status: "inactive", tags: ["do-not-call"], custom_fields: {}, project_id: "proj-1" },
        ],
      });
      const blocked = await handleWidgetSubmit({
        client: blockedSetup.client,
        input: { key: "wk_test123456", name: "Blocked", phone: "9876543210", consent: true, renderedAt },
        origin: "https://example.com",
        referer: null,
        ip: "1.1.1.4",
        now: insideHours,
      });
      expect(blocked.body).toEqual({ ok: true, callback: "none" });
      expect(sarvamMocks.sarvamJson).not.toHaveBeenCalled();
    });
  });
});
