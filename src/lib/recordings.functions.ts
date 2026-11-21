import { asApp } from "@/lib/supabase";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Short-lived signed URL for a stored call recording (RLS on `calls` decides who may ask). */
export const getCallRecordingPlaybackUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ callId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: call, error } = await asApp(context.supabase).from("calls")
      .select("id, organization_id, recording_path").eq("id", data.callId).maybeSingle();
    if (error || !call?.recording_path || !call.recording_path.startsWith(`${call.organization_id}/`)) {
      throw new Error("Recording not found");
    }
    const { data: signed, error: signingError } = await asApp(context.supabase).storage
      .from("call-recordings").createSignedUrl(call.recording_path, 60 * 60);
    if (signingError || !signed) throw new Error("Could not open this recording");
    return { url: signed.signedUrl };
  });

/** Re-pulls the recording/transcript from Sarvam for a finished call (recordings are often ready a little after the webhook). */
export const refreshCallRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ callId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: call, error } = await asApp(context.supabase).from("calls").select("id, organization_id").eq("id", data.callId).maybeSingle();
    if (error || !call) throw new Error("Call not found");
    const { data: allowed } = await asApp(context.supabase).rpc("can_write_org", { _org: call.organization_id });
    if (!allowed) throw new Error("You don't have permission to update this call");
    const { enrichCallFromSarvam } = await import("@/lib/sarvam.server");
    try {
      return await enrichCallFromSarvam(call.id);
    } catch (enrichError) {
      throw new Error(enrichError instanceof Error ? enrichError.message : "Could not reach Sarvam");
    }
  });

/**
 * Safety net run in the background while the app is open: syncs unfinished calls from Sarvam
 * (status, duration, transcript, answers — works even when the webhook never arrived), then saves
 * recordings for recent finished calls that are still missing one.
 */
export const fetchMissingCallRecordings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const none = { checked: 0, saved: 0, synced: 0, crm: 0, open: 0 };
    const { data: allowed } = await asApp(context.supabase).rpc("can_write_org", { _org: data.organizationId });
    if (!allowed) return none;
    const { applyPendingCrmOutcomes } = await import("@/lib/crm-sync.server");
    const openCalls = async () => {
      const { count } = await asApp(context.supabase).from("calls").select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId).in("status", ["queued", "in_progress"]);
      return count ?? 0;
    };
    if (!process.env["SARVAM_API_KEY"]) {
      const crm = await applyPendingCrmOutcomes(data.organizationId).catch(() => ({ applied: 0 }));
      return { ...none, crm: crm.applied, open: await openCalls() };
    }
    const { fetchMissingRecordings, syncCallsFromSarvam } = await import("@/lib/sarvam.server");
    const sync = await syncCallsFromSarvam(data.organizationId).catch((error) => {
      console.error("[sarvam] call sync failed", error);
      return { checked: 0, updated: 0 };
    });
    const crm = await applyPendingCrmOutcomes(data.organizationId).catch((error) => {
      console.error("[crm] sweep failed", error);
      return { applied: 0 };
    });
    const recordings = await fetchMissingRecordings(data.organizationId);
    return { ...recordings, synced: sync.updated, crm: crm.applied, open: await openCalls() };
  });
