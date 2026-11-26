// Server-only Sarvam Voice Agents helpers. Import from server handlers only
// (top-level from other *.server.ts files, or `await import(...)` inside handlers).
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { formatTranscript, toTranscriptTurns, type TranscriptTurn } from "@/lib/sarvam-call";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";

const SARVAM_BASE = "https://apps.sarvam.ai/api";
const mockAttempts = new Set<string>();

function isSarvamMock(): boolean {
  return process.env["SARVAM_MOCK"] === "1" && process.env["NODE_ENV"] !== "production";
}

export class SarvamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export function sarvamApiKey(): string {
  if (isSarvamMock()) return "mock-sarvam-key";
  const key = process.env["SARVAM_API_KEY"]?.trim();
  if (!key) throw new SarvamError("Sarvam API key is not configured. Add SARVAM_API_KEY (your Voice Agents workspace key) to the server environment.");
  return key;
}

/** Public https origin Sarvam can reach for webhooks (a deployed URL or a tunnel when developing locally). */
export function publicAppUrl(requestOrigin?: string): string {
  const configured = process.env["PUBLIC_APP_URL"]?.trim().replace(/\/+$/, "");
  const origin = configured || requestOrigin?.replace(/\/+$/, "") || "";
  if (!origin) throw new SarvamError("PUBLIC_APP_URL is not set, so Sarvam has nowhere to send call results.");
  if (isSarvamMock()) return origin;
  const host = new URL(origin).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    throw new SarvamError("Sarvam cannot reach a localhost callback. Set PUBLIC_APP_URL to your deployed https URL or a tunnel (e.g. cloudflared).");
  }
  return origin;
}

/** Every human-readable reason Sarvam put in an error body (shapes vary between its APIs). */
export function sarvamErrorDetails(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && ("msg" in item || "message" in item)) {
          const loc = Array.isArray((item as { loc?: unknown[] }).loc) ? (item as { loc: unknown[] }).loc.filter((part) => part !== "body").join(".") : "";
          const text = String((item as { msg?: unknown; message?: unknown }).msg ?? (item as { message?: unknown }).message);
          parts.push(loc ? `${loc}: ${text}` : text);
        } else add(item);
      }
    } else if (typeof value === "object") parts.push(JSON.stringify(value).slice(0, 300));
    else parts.push(String(value));
  };
  const record = body as { error?: { message?: unknown; code?: unknown; data?: { details?: unknown; errors?: unknown } | unknown }; detail?: unknown; message?: unknown };
  const data = record.error?.data as { details?: unknown; errors?: unknown } | undefined;
  add(data?.details);
  add(data?.errors);
  if (data && typeof data === "object" && !("details" in data) && !("errors" in data)) add(data);
  add(record.detail);
  const generic = String(record.error?.message ?? record.message ?? "");
  if (!parts.length && generic) parts.push(generic);
  return parts.length ? [...new Set(parts)].join("; ").slice(0, 600) : null;
}

function describeError(status: number, body: unknown): string {
  const message = sarvamErrorDetails(body);
  if (status === 401) {
    const details = String((body as { error?: { data?: { details?: string } } } | null)?.error?.data?.details ?? "");
    // Both platform keys and Voice Agents keys start with "sk_", so the prefix proves nothing — only Sarvam's own reason does.
    if (/format/i.test(details)) {
      return "Sarvam says this isn't a Voice Agents key. Use the workspace key from Sarvam Voice Agents (Samvaad) → Settings → API keys as SARVAM_API_KEY.";
    }
    return `Sarvam rejected SARVAM_API_KEY (HTTP 401). Check the value on this server is the full Voice Agents workspace key${details ? ` — Sarvam says: ${details.slice(0, 200)}` : ""}.`;
  }
  if (status === 403) return "This Sarvam API key has no access to that organization or workspace";
  if (status === 404) return "Sarvam could not find that organization, workspace, agent, or campaign";
  if (status === 429) return "Sarvam rate limit reached, try again shortly";
  return `Sarvam returned HTTP ${status}${message ? `: ${message}` : ""}`;
}

/** Authenticated JSON call to the Sarvam Voice Agents API with one retry on 429/503. */
export async function sarvamJson<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (isSarvamMock()) {
    if (path.includes("/outbounds") && init.method === "POST") {
      const attemptId = `mock_attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      mockAttempts.add(attemptId);
      return { attempt_id: attemptId } as T;
    }
    if (path.includes("/attempts")) {
      const items = [...mockAttempts].map((attempt_id) => ({
        attempt_id,
        connectivity: "connected",
        interaction_id: `mock_int_${attempt_id}`,
        duration_seconds: 95,
        started_at: new Date(Date.now() - 120_000).toISOString(),
        ended_at: new Date(Date.now() - 25_000).toISOString(),
      }));
      return { items, total: items.length } as T;
    }
    if (path.includes("/interactions")) {
      const items = [...mockAttempts].map((attempt_id) => ({
        interaction_id: `mock_int_${attempt_id}`,
        extracted_variables: {
          disposition: "interested",
          insurance_type: "Motor Insurance",
          summary: "Caller is interested in comprehensive motor insurance",
          next_action: "Send quote",
        },
        transcript: [
          { role: "agent", en_text: "Hello, calling from Yulabs Insurance." },
          { role: "user", en_text: "Yes, I am interested in motor insurance." },
        ],
      }));
      return { items, total: items.length } as T;
    }
    return {} as T;
  }

  const key = sarvamApiKey();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${SARVAM_BASE}${path}`, {
        method: init.method ?? "GET",
        headers: { "X-API-Key": key, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch {
      throw new SarvamError("Could not reach Sarvam");
    }
    if ((response.status === 429 || response.status === 503) && attempt === 0) {
      const wait = Math.min(10, Number(response.headers.get("Retry-After")) || 2);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      console.error(`[sarvam] ${init.method ?? "GET"} ${path} → HTTP ${response.status}`, JSON.stringify(body)?.slice(0, 2000));
      throw new SarvamError(describeError(response.status, body), response.status);
    }
    return body as T;
  }
  throw new SarvamError("Sarvam is busy, try again shortly");
}

export const enc = encodeURIComponent;
export const workspacePath = (sarvamOrg: string, workspace: string) => `/orgs/${enc(sarvamOrg)}/workspaces/${enc(workspace)}`;

export type OrgSarvamConfig = { sarvamOrg: string; workspace: string };

export async function getOrgSarvamConfig(organizationId: string): Promise<OrgSarvamConfig> {
  const { data } = await supabaseAdmin.from("organizations")
    .select("sarvam_organization_id, sarvam_workspace_id").eq("id", organizationId).maybeSingle();
  return {
    sarvamOrg: data?.sarvam_organization_id?.trim() || SARVAM_DEFAULTS.organizationId,
    workspace: data?.sarvam_workspace_id?.trim() || SARVAM_DEFAULTS.workspaceId,
  };
}

const interactionPath = (interactionId: string) => interactionId.split("/").map(enc).join("%2F");
const analyticsBase = (config: OrgSarvamConfig, appId: string) => `${SARVAM_BASE}/analytics/v1/${enc(config.sarvamOrg)}/${enc(config.workspace)}/${enc(appId)}`;

export async function fetchTranscriptTurns(config: OrgSarvamConfig, appId: string, interactionId: string): Promise<TranscriptTurn[]> {
  const response = await fetch(`${analyticsBase(config, appId)}/transcripts/${interactionPath(interactionId)}`, {
    headers: { "X-API-Key": sarvamApiKey() },
  }).catch(() => null);
  if (!response?.ok) return [];
  const data = await response.json().catch(() => null) as { messages?: Array<{ role: string; content: string }> } | null;
  return toTranscriptTurns(data?.messages ?? []);
}

export const recordingPathFor = (organizationId: string, callId: string) => `${organizationId}/${callId}.wav`;

/** Downloads the WAV from Sarvam and stores it privately. Returns the storage path, or a reason it is not available yet. */
export async function storeRecording(config: OrgSarvamConfig, appId: string, interactionId: string, organizationId: string, callId: string): Promise<{ path: string | null; reason: string | null }> {
  const response = await fetch(`${analyticsBase(config, appId)}/recordings/${interactionPath(interactionId)}`, {
    headers: { "X-API-Key": sarvamApiKey() },
  }).catch(() => null);
  if (!response) return { path: null, reason: "Could not reach Sarvam for the recording" };
  if (response.status === 404) return { path: null, reason: "Recording is not ready on Sarvam yet" };
  if (!response.ok) return { path: null, reason: `Sarvam recording could not be retrieved (HTTP ${response.status})` };
  const path = recordingPathFor(organizationId, callId);
  const { error } = await supabaseAdmin.storage.from("call-recordings").upload(path, await response.blob(), { contentType: "audio/wav", upsert: true });
  if (error) return { path: null, reason: "Recording was received but could not be saved" };
  return { path, reason: null };
}

/**
 * Pulls the full transcript and recording for a finished call and saves them.
 * Safe to run again (e.g. "Fetch recording" button) — it only overwrites with better data.
 */
export async function enrichCallFromSarvam(callId: string): Promise<{ recording: boolean; transcript: boolean; reason: string | null }> {
  const { data: call } = await supabaseAdmin.from("calls")
    .select("id, organization_id, agent_id, sarvam_interaction_id, transcript_turns, recording_path").eq("id", callId).maybeSingle();
  if (!call?.sarvam_interaction_id) return { recording: false, transcript: false, reason: "This call has no Sarvam conversation to fetch" };
  const { data: agent } = call.agent_id
    ? await supabaseAdmin.from("voice_agents").select("sarvam_agent_id").eq("id", call.agent_id).maybeSingle()
    : { data: null };
  const appId = agent?.sarvam_agent_id?.trim() || SARVAM_DEFAULTS.agentId;
  const config = await getOrgSarvamConfig(call.organization_id);

  const update: { transcript_turns?: TranscriptTurn[]; transcript?: string; recording_path?: string; updated_at: string } = { updated_at: new Date().toISOString() };
  const existingTurns = Array.isArray(call.transcript_turns) ? call.transcript_turns.length : 0;
  const turns = existingTurns ? [] : await fetchTranscriptTurns(config, appId, call.sarvam_interaction_id);
  // Webhook turns are English (en_text); only fall back to the original-language analytics transcript when none arrived.
  if (turns.length && existingTurns === 0) {
    update.transcript_turns = turns;
    update.transcript = formatTranscript(turns);
  }
  let reason: string | null = null;
  if (!call.recording_path) {
    const stored = await storeRecording(config, appId, call.sarvam_interaction_id, call.organization_id, call.id);
    if (stored.path) update.recording_path = stored.path;
    reason = stored.reason;
  }
  await supabaseAdmin.from("calls").update(update as never).eq("id", call.id);
  return { recording: Boolean(call.recording_path || update.recording_path), transcript: Boolean(update.transcript_turns || existingTurns), reason };
}

// Sarvam usually makes the WAV available 30–120 s after the call ends, so the webhook's first try often misses it.
export const RECORDING_RETRY_DELAYS_MS = [30_000, 90_000, 240_000, 600_000];
const pendingRecordingRetries = new Set<string>();

/**
 * Retries the recording download in the background after a call ends (fire-and-forget; never blocks the webhook).
 * On serverless hosts the timers may not survive the request — `fetchMissingRecordings` is the safety net.
 */
export function scheduleRecordingRetries(callId: string, delays: number[] = RECORDING_RETRY_DELAYS_MS): void {
  if (pendingRecordingRetries.has(callId) || !delays.length) return;
  pendingRecordingRetries.add(callId);
  const attempt = (index: number) => {
    const timer = setTimeout(async () => {
      try {
        const result = await enrichCallFromSarvam(callId);
        if (result.recording || index + 1 >= delays.length) {
          pendingRecordingRetries.delete(callId);
          if (!result.recording) console.warn(`[sarvam] recording still unavailable for call ${callId}: ${result.reason ?? "unknown"}`);
          return;
        }
      } catch (error) {
        console.error("[sarvam] recording retry failed", error);
        if (index + 1 >= delays.length) { pendingRecordingRetries.delete(callId); return; }
      }
      attempt(index + 1);
    }, delays[index]);
    (timer as { unref?: () => void }).unref?.();
  };
  attempt(0);
}

/** Fetches recordings for this workspace's recent finished calls that don't have one yet (a few per run). */
export async function fetchMissingRecordings(organizationId: string, limit = 5): Promise<{ checked: number; saved: number }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const settled = new Date(Date.now() - 30 * 1000).toISOString();
  const { data: calls } = await supabaseAdmin.from("calls").select("id")
    .eq("organization_id", organizationId).eq("status", "completed")
    .not("sarvam_interaction_id", "is", null).is("recording_path", null)
    .gte("updated_at", since).lte("updated_at", settled)
    .order("updated_at", { ascending: false }).limit(limit);
  let saved = 0;
  for (const call of calls ?? []) {
    if (pendingRecordingRetries.has(call.id)) continue;
    const result = await enrichCallFromSarvam(call.id).catch(() => null);
    if (result?.recording) saved += 1;
  }
  return { checked: calls?.length ?? 0, saved };
}

// ---------------------------------------------------------------------------------------------
// Pull-based sync. The webhook is the fast path, but it only arrives when PUBLIC_APP_URL is reachable
// (a stopped tunnel loses every result). Sarvam's Analytics API has the same facts, so the app asks for them.
// https://docs.sarvam.ai/voice-agents/api/analytics/attempts · .../analytics/interactions

type SarvamAttempt = {
  attempt_id: string | null;
  interaction_id: string | null;
  connectivity_status: string | null;
  failure_reason: string | null;
  duration_in_seconds: number | null;
  start_datetime: string | null;
  end_datetime: string | null;
  attempted_at: string | null;
  agent_variables: Record<string, unknown> | null;
};
type SarvamTranscriptEntry = { role: string; text: string };
type SarvamInteraction = {
  job_id: string | null;
  interaction_id: string | null;
  original_transcript?: SarvamTranscriptEntry[] | null;
  translate_transcript?: SarvamTranscriptEntry[] | null;
};
type Page<T> = { items?: T[]; total?: number };
type SyncCall = {
  id: string; agent_id: string | null; contact_id: string | null; campaign_id: string | null; external_id: string | null;
  status: string; transcript_turns: unknown; created_at: string;
};

const OPEN_CALL = ["queued", "in_progress"];
/** Sarvam datetimes are UTC without an offset. */
const utc = (value: string | null | undefined) => (value ? new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`).toISOString() : null);

/** Terminal CRM status for a Sarvam attempt, or null while Sarvam has no final result yet. */
export function attemptCallStatus(connectivity: string | null | undefined): "completed" | "no_answer" | "failed" | null {
  if (connectivity === "connected") return "completed";
  if (connectivity === "no_answer") return "no_answer";
  if (connectivity === "busy" || connectivity === "failed") return "failed";
  return null;
}

async function listAnalytics<T>(config: OrgSarvamConfig, appId: string, kind: "attempts" | "interactions", since: string, extra: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = [];
  const limit = 200;
  for (let offset = 0; offset < 1000; offset += limit) {
    const query = new URLSearchParams({
      start_datetime: since, end_datetime: new Date().toISOString(),
      sort_by: "attempted_at", sort_order: "desc", limit: String(limit), offset: String(offset), ...extra,
    });
    const page = await sarvamJson<Page<T>>(`/analytics/v1/${enc(config.sarvamOrg)}/${enc(config.workspace)}/${enc(appId)}/${kind}?${query}`);
    items.push(...(page.items ?? []));
    if (!page.items?.length || items.length >= (page.total ?? 0)) break;
  }
  return items;
}

/**
 * Brings this workspace's unfinished calls up to date from Sarvam: real status, duration, answers, insights,
 * English transcript, then the recording. Also corrects calls closed with "Stop" that Sarvam actually completed.
 */
export async function syncCallsFromSarvam(organizationId: string): Promise<{ checked: number; updated: number }> {
  const now = Date.now();
  const openSince = new Date(now - 3 * 24 * 3600 * 1000).toISOString();
  const stoppedSince = new Date(now - 2 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin.from("calls")
    .select("id, agent_id, contact_id, campaign_id, external_id, status, transcript_turns, created_at")
    .eq("organization_id", organizationId).not("external_id", "is", null).gte("created_at", openSince)
    .or(`status.in.(${OPEN_CALL.join(",")}),and(sarvam_status.eq.stopped,created_at.gte.${stoppedSince}),and(status.eq.completed,sarvam_interaction_id.is.null)`)
    .order("created_at", { ascending: true }).limit(100);
  const calls = (data ?? []) as SyncCall[];
  if (!calls.length) return { checked: 0, updated: 0 };

  const agentIds = [...new Set(calls.map((call) => call.agent_id).filter((id): id is string => Boolean(id)))];
  const { data: agents } = agentIds.length
    ? await supabaseAdmin.from("voice_agents").select("id, sarvam_agent_id, agent_variables").in("id", agentIds)
    : { data: [] };
  const agentById = new Map((agents ?? []).map((agent) => [agent.id, agent]));
  const config = await getOrgSarvamConfig(organizationId);

  // One analytics query per Sarvam agent, covering every call we are waiting on.
  const groups = new Map<string, SyncCall[]>();
  for (const call of calls) {
    const appId = (call.agent_id && agentById.get(call.agent_id)?.sarvam_agent_id?.trim()) || SARVAM_DEFAULTS.agentId;
    groups.set(appId, [...(groups.get(appId) ?? []), call]);
  }

  const { extractAnswers, summarizeAnswers } = await import("@/lib/sarvam-call");
  let updated = 0;
  for (const [appId, group] of groups) {
    const since = new Date(new Date(group[0]!.created_at).getTime() - 5 * 60 * 1000).toISOString();
    const attempts = await listAnalytics<SarvamAttempt>(config, appId, "attempts", since);
    const byAttempt = new Map(attempts.filter((a) => a.attempt_id).map((a) => [a.attempt_id!, a]));

    // A call Sarvam never heard of is not "dialing" forever.
    const staleBefore = now - 2 * 3600 * 1000;
    for (const call of group) {
      if (OPEN_CALL.includes(call.status) && !byAttempt.has(call.external_id!) && new Date(call.created_at).getTime() < staleBefore) {
        await supabaseAdmin.from("calls").update({ status: "failed", sarvam_status: "failed", sarvam_failure_reason: "Sarvam has no record of this call", updated_at: new Date().toISOString() } as never)
          .eq("id", call.id).in("status", OPEN_CALL);
        updated += 1;
      }
    }

    const finished: Array<{ call: SyncCall; attempt: SarvamAttempt }> = [];
    for (const call of group) {
      const attempt = byAttempt.get(call.external_id!);
      if (attempt && attemptCallStatus(attempt.connectivity_status)) finished.push({ call, attempt });
    }
    if (!finished.length) continue;

    const transcripts = new Map<string, SarvamInteraction>();
    if (finished.some(({ attempt }) => attempt.interaction_id)) {
      const interactions = await listAnalytics<SarvamInteraction>(config, appId, "interactions", since, { include_transcript: "true" })
        .catch((error) => { console.error("[sarvam] interactions fetch failed", error); return [] as SarvamInteraction[]; });
      for (const item of interactions) {
        if (item.job_id) transcripts.set(item.job_id, item);
        if (item.interaction_id) transcripts.set(item.interaction_id, item);
      }
    }

    for (const { call, attempt } of finished) {
      const status = attemptCallStatus(attempt.connectivity_status)!;
      // Drop the inputs we passed to the agent; what's left is what it collected.
      const agentVariables = call.agent_id ? agentById.get(call.agent_id)?.agent_variables : null;
      const inputs = new Set(Object.keys(agentVariables && typeof agentVariables === "object" ? agentVariables : {}));
      // The name is an input too, but the agent fills it from what the customer says — keep it.
      for (const key of ["customer_name", "user_name"]) inputs.delete(key);
      const collected = Object.fromEntries(Object.entries(attempt.agent_variables ?? {}).filter(([key]) => !inputs.has(key)));
      const answers = extractAnswers(collected);
      const insight = summarizeAnswers(answers);
      const interaction = transcripts.get(attempt.attempt_id!) ?? (attempt.interaction_id ? transcripts.get(attempt.interaction_id) : undefined);
      const source = interaction?.translate_transcript?.length ? interaction.translate_transcript : interaction?.original_transcript ?? [];
      const turns = toTranscriptTurns(source.map((entry) => ({ role: entry.role, content: entry.text })));
      const hasTurns = Array.isArray(call.transcript_turns) && call.transcript_turns.length > 0;
      const failure = attempt.failure_reason && attempt.failure_reason !== "NO_FAILURE_REASON" ? attempt.failure_reason : null;
      const durationSeconds = Math.min(86400, Math.max(0, Math.round(attempt.duration_in_seconds ?? 0)));

      const update: Record<string, unknown> = {
        status,
        sarvam_status: attempt.connectivity_status,
        sarvam_interaction_id: attempt.interaction_id ?? null,
        sarvam_failure_reason: failure,
        duration_seconds: durationSeconds,
        ended_at: utc(attempt.end_datetime) ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const startedAt = utc(attempt.start_datetime) ?? utc(attempt.attempted_at);
      if (startedAt) update.started_at = startedAt;
      if (Object.keys(answers).length) Object.assign(update, { answers, outcome: insight.outcome, sentiment: insight.sentiment, summary: insight.summary });
      if (!hasTurns && turns.length) Object.assign(update, { transcript_turns: turns, transcript: formatTranscript(turns) });

      const wasOpen = OPEN_CALL.includes(call.status);
      // Only one writer finalises an open call, so automations run once even if the webhook lands too.
      let query = supabaseAdmin.from("calls").update(update as never).eq("id", call.id);
      if (wasOpen) query = query.in("status", OPEN_CALL);
      const { data: changed } = await query.select("id");
      if (!changed?.length) continue;
      updated += 1;

      if (attempt.interaction_id) await enrichCallFromSarvam(call.id).catch((error) => console.error("[sarvam] enrich after sync failed", error));
      const { applyCallOutcomeToCrm } = await import("@/lib/crm-sync.server");
      await applyCallOutcomeToCrm(call.id).catch((error) => console.error("[crm] apply after sync failed", error));
      if (wasOpen && !call.campaign_id) {
        const { runAutomations } = await import("@/lib/automation.server");
        const { eventsForCall } = await import("@/lib/automation");
        for (const event of eventsForCall(status, true)) {
          await runAutomations({
            organizationId, event, callId: call.id, contactId: call.contact_id,
            facts: { status, sentiment: insight.sentiment, outcome: insight.outcome, duration_seconds: durationSeconds, answers },
          }).catch((error) => console.error("[sarvam] automations after sync failed", error));
        }
      }
    }
  }
  return { checked: calls.length, updated };
}
