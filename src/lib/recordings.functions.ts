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

/** Safety net: saves recordings for this workspace's recent finished calls that are still missing one. */
export const fetchMissingCallRecordings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await asApp(context.supabase).rpc("can_write_org", { _org: data.organizationId });
    if (!allowed) return { checked: 0, saved: 0 };
    if (!process.env["SARVAM_API_KEY"]) return { checked: 0, saved: 0 };
    const { fetchMissingRecordings } = await import("@/lib/sarvam.server");
    return fetchMissingRecordings(data.organizationId);
  });
