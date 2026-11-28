import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppClient, Database } from "@/lib/supabase";
import {
  extractConsentFields,
  filterCampaignTargetsByDnc,
  formatComplianceDetails,
  maskDncPhone,
  parseDndCsvNumbers,
  toE164,
  validateReactivationReason,
} from "@/lib/dnc";
import {
  blockNumber,
  getBlockedPhoneSet,
  isBlocked,
  logBlockedAttempt,
  logConsentGiven,
  unblockNumber,
} from "@/lib/dnc.server";

const sarvamMocks = vi.hoisted(() => ({
  sarvamJson: vi.fn(),
  workspacePath: vi.fn(() => "/orgs/o/workspaces/w"),
  publicAppUrl: vi.fn(() => "https://crm.example.com"),
  getOrgSarvamConfig: vi.fn(async () => ({ sarvamOrg: "o", workspace: "w" })),
}));

vi.mock("@/lib/sarvam.server", () => sarvamMocks);

interface FakeDncRow {
  id: string;
  organization_id: string;
  phone_e164: string;
  reason: string | null;
  source: string;
  call_id: string | null;
  created_by: string | null;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
  removed_reason: string | null;
}

interface FakeComplianceRow {
  id: string;
  organization_id: string;
  phone_e164: string | null;
  contact_id: string | null;
  event: string;
  actor: string | null;
  call_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface FakeContactRow {
  id: string;
  organization_id: string;
  project_id?: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  city: string | null;
  job_title: string | null;
  phone: string | null;
  status: string;
  tags: string[];
  custom_fields?: Record<string, unknown>;
  created_at?: string;
}

function makeInMemoryDncDb(initialContacts: FakeContactRow[] = []) {
  let seq = 1;
  const dncRows: FakeDncRow[] = [];
  const logRows: FakeComplianceRow[] = [];
  const contacts: FakeContactRow[] = initialContacts.map((c) => ({ ...c, tags: [...c.tags] }));
  const campaignTargets: Array<Record<string, unknown>> = [];
  const campaigns: Record<string, Record<string, unknown>> = {
    "camp-1": {
      id: "camp-1",
      organization_id: "org-1",
      name: "November Renewal Push",
      status: "draft",
      consent_confirmed: true,
      project_id: "proj-1",
      agent_id: "agent-1",
      contact_ids: null,
      allowed_start_time: "09:00",
      allowed_end_time: "20:00",
      allowed_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      timezone: "Asia/Kolkata",
      attempts_per_second: 1,
      max_retries: 1,
      retry_interval_minutes: 30,
      agent_variables: {},
      starts_at: null,
      ends_at: null,
    },
  };

  function applyFilters<T extends Record<string, unknown>>(
    list: T[],
    preds: Array<(row: T) => boolean>,
  ): T[] {
    return list.filter((row) => preds.every((fn) => fn(row)));
  }

  function makeSelectBuilder<T extends Record<string, unknown>>(source: () => T[]) {
    const preds: Array<(row: T) => boolean> = [];
    let maxRows: number | null = null;
    const builder = {
      eq(col: string, val: unknown) {
        preds.push((r) => r[col] === val);
        return builder;
      },
      neq(col: string, val: unknown) {
        preds.push((r) => r[col] !== val);
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        if (op === "is") preds.push((r) => r[col] !== val);
        return builder;
      },
      is(col: string, val: unknown) {
        preds.push((r) => (r[col] ?? null) === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        const set = new Set(vals);
        preds.push((r) => set.has(r[col]));
        return builder;
      },
      ilike(col: string, pattern: string) {
        const needle = pattern.replace(/%/g, "").toLowerCase();
        preds.push((r) =>
          String(r[col] ?? "")
            .toLowerCase()
            .includes(needle),
        );
        return builder;
      },
      order() {
        return builder;
      },
      range(from: number, to: number) {
        const matched = applyFilters(source(), preds).slice(from, to + 1);
        return Promise.resolve({ data: matched, error: null });
      },
      limit(n: number) {
        maxRows = n;
        return builder;
      },
      maybeSingle() {
        const matched = applyFilters(source(), preds);
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?:
          ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        const matched = applyFilters(source(), preds);
        const sliced = maxRows !== null ? matched.slice(0, maxRows) : matched;
        return Promise.resolve({ data: sliced, error: null }).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      if (table === "dnc_numbers") {
        return {
          select: () =>
            makeSelectBuilder(() => dncRows as unknown as Array<Record<string, unknown>>),
          insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            const items = Array.isArray(payload) ? payload : [payload];
            const created: FakeDncRow[] = [];
            for (const item of items) {
              const duplicate = dncRows.find(
                (r) =>
                  r.organization_id === item.organization_id &&
                  r.phone_e164 === item.phone_e164 &&
                  r.removed_at === null,
              );
              if (duplicate) {
                const err = {
                  code: "23505",
                  message: "duplicate key value violates unique constraint",
                };
                return {
                  select: () => ({ single: async () => ({ data: null, error: err }) }),
                  then: (cb: (v: unknown) => unknown) =>
                    Promise.resolve({ data: null, error: err }).then(cb),
                };
              }
              const row: FakeDncRow = {
                id: `dnc-${seq++}`,
                organization_id: String(item.organization_id),
                phone_e164: String(item.phone_e164),
                reason: (item.reason as string | null) ?? null,
                source: String(item.source ?? "manual"),
                call_id: (item.call_id as string | null) ?? null,
                created_by: (item.created_by as string | null) ?? null,
                created_at: new Date().toISOString(),
                removed_at: null,
                removed_by: null,
                removed_reason: null,
              };
              dncRows.push(row);
              created.push(row);
            }
            return {
              select: () => ({
                single: async () => ({ data: created[0]!, error: null }),
              }),
              then: (cb: (v: unknown) => unknown) =>
                Promise.resolve({ data: created, error: null }).then(cb),
            };
          },
          update: (patch: Record<string, unknown>) => {
            const preds: Array<(r: FakeDncRow) => boolean> = [];
            const upd = {
              eq(col: keyof FakeDncRow, val: unknown) {
                preds.push((r) => r[col] === val);
                return upd;
              },
              is(col: keyof FakeDncRow, val: unknown) {
                preds.push((r) => r[col] === val);
                return upd;
              },
              then<T1 = unknown>(onfulfilled?: ((v: { error: null }) => T1) | null) {
                for (const row of dncRows) {
                  if (preds.every((fn) => fn(row))) Object.assign(row, patch);
                }
                return Promise.resolve({ error: null }).then(onfulfilled);
              },
            };
            return upd;
          },
        };
      }

      if (table === "compliance_log") {
        return {
          select: () =>
            makeSelectBuilder(() => logRows as unknown as Array<Record<string, unknown>>),
          insert: async (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            const items = Array.isArray(payload) ? payload : [payload];
            for (const item of items) {
              logRows.push({
                id: `log-${seq++}`,
                organization_id: String(item.organization_id),
                phone_e164: (item.phone_e164 as string | null) ?? null,
                contact_id: (item.contact_id as string | null) ?? null,
                event: String(item.event),
                actor: (item.actor as string | null) ?? null,
                call_id: (item.call_id as string | null) ?? null,
                details: (item.details as Record<string, unknown>) ?? {},
                created_at: new Date().toISOString(),
              });
            }
            return { error: null };
          },
        };
      }

      if (table === "contacts") {
        return {
          select: () =>
            makeSelectBuilder(() => contacts as unknown as Array<Record<string, unknown>>),
          update: (patch: Record<string, unknown>) => ({
            eq: async (col: keyof FakeContactRow, val: unknown) => {
              for (const c of contacts) {
                if (c[col] === val) Object.assign(c, patch);
              }
              return { error: null };
            },
          }),
        };
      }

      if (table === "call_campaigns") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => ({ data: campaigns[id] ?? null, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              if (campaigns[id]) Object.assign(campaigns[id]!, patch);
              return { error: null };
            },
          }),
        };
      }

      if (table === "voice_agents") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "agent-1",
                  status: "active",
                  greeting: "Hello {customer_name}",
                  greeting_no_name: "Hello",
                  agent_variables: {},
                  sarvam_agent_id: "sarvam-app-1",
                  sarvam_app_version: 1,
                  sarvam_connection_id: "conn-1",
                  sarvam_agent_phone_number: "+918064269483",
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "campaign_targets") {
        return {
          delete: () => ({
            eq: async (_col: string, campaignId: string) => {
              for (let i = campaignTargets.length - 1; i >= 0; i -= 1) {
                if (campaignTargets[i]!.campaign_id === campaignId) campaignTargets.splice(i, 1);
              }
              return { error: null };
            },
          }),
          insert: (payload: Array<Record<string, unknown>>) => {
            const inserted = payload.map((item) => {
              const row = { id: `target-${seq++}`, ...item };
              campaignTargets.push(row);
              return row;
            });
            return {
              select: async () => ({ data: inserted, error: null }),
              then: <T1 = unknown>(
                cb?: ((v: { data: typeof inserted; error: null }) => T1) | null,
              ) => Promise.resolve({ data: inserted, error: null }).then(cb),
            };
          },
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, campaignId: string) => ({
              in: async (_idCol: string, ids: string[]) => {
                const set = new Set(ids);
                for (const t of campaignTargets) {
                  if (t.campaign_id === campaignId && set.has(String(t.id)))
                    Object.assign(t, patch);
                }
                return { error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  } as unknown as AppClient & SupabaseClient<Database>;

  return { client, dncRows, logRows, contacts, campaignTargets, campaigns };
}

describe("Do-not-contact pure helpers (src/lib/dnc.ts)", () => {
  it("normalises every Indian and E.164 phone format with toE164", () => {
    expect(toE164("+91 98480 12345")).toBe("+919848012345");
    expect(toE164("09848012345")).toBe("+919848012345");
    expect(toE164("9848012345")).toBe("+919848012345");
    expect(toE164("+919848012345")).toBe("+919848012345");
    expect(toE164("91 98480-12345")).toBe("+919848012345");
    expect(toE164("+1 (415) 555-0100")).toBe("+14155550100");
    expect(toE164("12345")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
  });

  it("masks all digits except the last 4 for non-admins and shows full number for admins", () => {
    expect(maskDncPhone("+919848012345", true)).toBe("+919848012345");
    const masked = maskDncPhone("+919848012345", false);
    expect(masked.endsWith("2345")).toBe(true);
    expect(masked).not.toContain("98480");
    expect(maskDncPhone(null, false)).toBe("—");
  });

  it("enforces minimum 10-character reason for reactivation", () => {
    expect(validateReactivationReason("")).toMatch(/at least 10 characters/);
    expect(validateReactivationReason("too short")).toMatch(/at least 10 characters/);
    expect(validateReactivationReason("Customer requested a callback via email")).toBeNull();
  });

  it("excludes blocked numbers in filterCampaignTargetsByDnc regardless of phone spelling", () => {
    const blocked = new Set(["+919000000001"]);
    const candidates = [
      { id: "c1", phone: "09000000001", name: "Imported Blocked" },
      { id: "c2", phone: "+91 90000 00002", name: "Callable Contact" },
    ];
    const { callable, skipped } = filterCampaignTargetsByDnc(candidates, blocked);
    expect(callable.map((c) => c.id)).toEqual(["c2"]);
    expect(skipped.map((c) => c.id)).toEqual(["c1"]);
  });

  it("parses DND CSV files (single-column and headered), normalising and deduplicating", () => {
    const csv = [
      "phone,reason",
      "+91 90000 00001,National DND",
      "09000000001,Duplicate spelling",
      "9000000002,Second valid",
      "not-a-phone,Bad row",
    ].join("\n");

    const parsed = parseDndCsvNumbers(csv);
    expect(parsed.valid).toEqual(["+919000000001", "+919000000002"]);
    expect(parsed.duplicateCount).toBe(1);
    expect(parsed.invalidCount).toBe(1);
  });

  it("extracts affirmative consent fields from call answers", () => {
    expect(
      extractConsentFields({
        consent_to_share: "yes",
        kyc_consent: "no",
        disposition: "interested",
      }),
    ).toEqual(["consent_to_share"]);
    expect(extractConsentFields({ consent_to_share: "no" })).toEqual([]);
  });

  it("formats compliance details into readable audit summaries", () => {
    expect(
      formatComplianceDetails("blocked_attempt", { where: "one_off_call", reason: "Refused" }),
    ).toContain("One-off / test call");
  });
});

describe("Do-not-contact server registry & compliance log (src/lib/dnc.server.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sarvamMocks.sarvamJson.mockImplementation(async (path: string) => {
      if (path.endsWith("/campaigns")) return { campaign_id: "sarvam-camp-1", status: "scheduled" };
      if (path.includes("/cohorts/stream")) return { cohort_id: "cohort-1" };
      return {};
    });
  });

  it("blocks a number, checks isBlocked across formats, enforces reason on unblock, and reactivates cleanly", async () => {
    const db = makeInMemoryDncDb([
      {
        id: "contact-1",
        organization_id: "org-1",
        first_name: "Asha",
        last_name: "Rao",
        email: null,
        city: null,
        job_title: null,
        phone: "09848012345",
        status: "active",
        tags: ["vip"],
      },
    ]);

    expect(await isBlocked("org-1", "9848012345", db.client)).toBe(false);

    // Block manually
    const blocked = await blockNumber({
      orgId: "org-1",
      phone: "+91 98480 12345",
      reason: "Customer asked via email not to call",
      source: "manual",
      actor: "user-admin",
      client: db.client,
    });
    expect(blocked.phoneE164).toBe("+919848012345");
    expect(blocked.alreadyBlocked).toBe(false);

    // Every spelling of the number is now blocked in org-1, but NOT in org-2
    expect(await isBlocked("org-1", "+919848012345", db.client)).toBe(true);
    expect(await isBlocked("org-1", "09848012345", db.client)).toBe(true);
    expect(await isBlocked("org-1", "98480 12345", db.client)).toBe(true);
    expect(await isBlocked("org-2", "+919848012345", db.client)).toBe(false);

    // Contact was synced to inactive + do-not-call, and compliance_log recorded 'blocked'
    expect(db.contacts[0]!.status).toBe("inactive");
    expect(db.contacts[0]!.tags).toContain("do-not-call");
    expect(db.logRows).toHaveLength(1);
    expect(db.logRows[0]).toMatchObject({
      organization_id: "org-1",
      phone_e164: "+919848012345",
      contact_id: "contact-1",
      event: "blocked",
      actor: "user-admin",
    });

    // Unblock without a valid reason throws and keeps the number blocked
    await expect(
      unblockNumber({
        orgId: "org-1",
        phone: "9848012345",
        reason: "short",
        actor: "user-admin",
        client: db.client,
      }),
    ).rejects.toThrow(/at least 10 characters/);
    expect(await isBlocked("org-1", "9848012345", db.client)).toBe(true);

    // Unblock with a valid reason removes block, restores contact, and logs 'reactivated'
    const unblocked = await unblockNumber({
      orgId: "org-1",
      phone: "09848012345",
      reason: "Customer submitted website callback request on 28 Nov",
      actor: "user-admin",
      client: db.client,
    });
    expect(unblocked.reactivatedContacts).toBe(1);
    expect(await isBlocked("org-1", "+919848012345", db.client)).toBe(false);
    expect(db.contacts[0]!.status).toBe("active");
    expect(db.contacts[0]!.tags).not.toContain("do-not-call");
    expect(db.logRows.at(-1)).toMatchObject({
      event: "reactivated",
      actor: "user-admin",
      phone_e164: "+919848012345",
    });
  });

  it("records call opt-out with call_id, consent_given (idempotent), and blocked_attempt", async () => {
    const db = makeInMemoryDncDb();

    await blockNumber({
      orgId: "org-1",
      phone: "9000000001",
      reason: "Caller said do not call me",
      source: "call",
      callId: "call-optout-1",
      client: db.client,
    });
    // Replay with the same callId does not create a second opt_out log row
    await blockNumber({
      orgId: "org-1",
      phone: "+919000000001",
      reason: "Caller said do not call me",
      source: "call",
      callId: "call-optout-1",
      client: db.client,
    });

    expect(db.logRows.filter((r) => r.event === "opt_out")).toHaveLength(1);
    expect(db.logRows[0]!.call_id).toBe("call-optout-1");

    await logBlockedAttempt({
      orgId: "org-1",
      phone: "09000000001",
      where: "one_off_call",
      actor: "user-rep",
      client: db.client,
    });
    expect(db.logRows.at(-1)).toMatchObject({
      event: "blocked_attempt",
      phone_e164: "+919000000001",
      actor: "user-rep",
    });

    await logConsentGiven({
      orgId: "org-1",
      phone: "9000000009",
      callId: "call-consent-1",
      details: { fields: ["consent_to_share"] },
      client: db.client,
    });
    await logConsentGiven({
      orgId: "org-1",
      phone: "9000000009",
      callId: "call-consent-1",
      details: { fields: ["consent_to_share"] },
      client: db.client,
    });
    expect(db.logRows.filter((r) => r.event === "consent_given")).toHaveLength(1);
  });

  it("skips a newly imported active contact in runCampaignLaunch when its phone is in dnc_numbers", async () => {
    const db = makeInMemoryDncDb([
      {
        // Newly imported contact: status is 'active', phone written with leading 0
        id: "imported-blocked",
        organization_id: "org-1",
        project_id: "proj-1",
        first_name: "Blocked",
        last_name: "Import",
        email: null,
        city: null,
        job_title: null,
        phone: "09000000001",
        status: "active",
        tags: [],
      },
      {
        id: "imported-ok",
        organization_id: "org-1",
        project_id: "proj-1",
        first_name: "Priya",
        last_name: "Verma",
        email: null,
        city: null,
        job_title: null,
        phone: "9000000002",
        status: "active",
        tags: [],
      },
    ]);

    // Phone +919000000001 was previously added to DNC before the CSV import happened
    db.dncRows.push({
      id: "dnc-preexisting",
      organization_id: "org-1",
      phone_e164: "+919000000001",
      reason: "Prior opt-out",
      source: "manual",
      call_id: null,
      created_by: "user-admin",
      created_at: new Date().toISOString(),
      removed_at: null,
      removed_by: null,
      removed_reason: null,
    });

    const blockedSet = await getBlockedPhoneSet("org-1", ["09000000001", "9000000002"], db.client);
    expect([...blockedSet]).toEqual(["+919000000001"]);

    const { runCampaignLaunch } = await import("@/lib/campaigns.server");
    const launchResult = await runCampaignLaunch(db.client, "camp-1", "https://crm.example.com");

    expect(launchResult.contacts).toBe(1);
    expect(launchResult.skipped).toBe(1);

    // Blocked contact is marked skipped with last_outcome = 'do_not_contact'
    const skippedTarget = db.campaignTargets.find((t) => t.contact_id === "imported-blocked");
    const queuedTarget = db.campaignTargets.find((t) => t.contact_id === "imported-ok");
    expect(skippedTarget).toMatchObject({
      phone: "+919000000001",
      status: "skipped",
      last_outcome: "do_not_contact",
    });
    expect(queuedTarget).toMatchObject({
      phone: "+919000000002",
      status: "queued",
    });

    // Sarvam cohort stream only received the non-blocked contact
    const streamCall = sarvamMocks.sarvamJson.mock.calls.find(([url]) =>
      String(url).includes("/cohorts/stream"),
    );
    expect(streamCall).toBeDefined();
    const streamedUsers = (
      streamCall![1] as { body: { users: Array<{ user_phone_number: string }> } }
    ).body.users;
    expect(streamedUsers.map((u) => u.user_phone_number)).toEqual(["+919000000002"]);

    // Compliance log recorded the blocked campaign attempt
    expect(
      db.logRows.some((r) => r.event === "blocked_attempt" && r.phone_e164 === "+919000000001"),
    ).toBe(true);
  });

  it("registers the /do-not-contact route in the TanStack router tree", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { createRouter } = await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/do-not-contact");
    expect(matches.some((m) => m.routeId.includes("do-not-contact"))).toBe(true);
  });
});
