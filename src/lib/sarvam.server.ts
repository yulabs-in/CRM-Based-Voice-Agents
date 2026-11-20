// Server-only Sarvam Voice Agents helpers. Import from server handlers only
// (top-level from other *.server.ts files, or `await import(...)` inside handlers).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { formatTranscript, toTranscriptTurns, type TranscriptTurn } from "@/lib/sarvam-call";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";

const SARVAM_BASE = "https://apps.sarvam.ai/api";

export class SarvamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export function sarvamApiKey(): string {
  const key = process.env["SARVAM_API_KEY"]?.trim();
  if (!key) throw new SarvamError("Sarvam API key is not configured. Add SARVAM_API_KEY (your Voice Agents workspace key) to the server environment.");
  return key;
}

/** Public https origin Sarvam can reach for webhooks (a deployed URL or a tunnel when developing locally). */
export function publicAppUrl(requestOrigin?: string): string {
  const configured = process.env["PUBLIC_APP_URL"]?.trim().replace(/\/+$/, "");
  const origin = configured || requestOrigin?.replace(/\/+$/, "") || "";
  if (!origin) throw new SarvamError("PUBLIC_APP_URL is not set, so Sarvam has nowhere to send call results.");
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
    // Platform keys (sk_…, for api.sarvam.ai speech/text APIs) are not accepted by the Voice Agents API.
    return /format/i.test(details) || sarvamApiKey().startsWith("sk_")
      ? "This is a Sarvam platform API key (sk_…). Calls need a Voice Agents workspace API key — create one in Sarvam Voice Agents (Samvaad) → Settings → API keys and set it as SARVAM_API_KEY."
      : "Sarvam rejected the API key";
  }
  if (status === 403) return "This Sarvam API key has no access to that organization or workspace";
  if (status === 404) return "Sarvam could not find that organization, workspace, agent, or campaign";
  if (status === 429) return "Sarvam rate limit reached, try again shortly";
  return `Sarvam returned HTTP ${status}${message ? `: ${message}` : ""}`;
}

/** Authenticated JSON call to the Sarvam Voice Agents API with one retry on 429/503. */
export async function sarvamJson<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
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
