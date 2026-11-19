import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCallRecordingPlaybackUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ callId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: call, error } = await context.supabase.from("calls")
      .select("id, organization_id, recording_url").eq("id", data.callId).maybeSingle();
    if (error || !call || call.recording_url !== `${call.organization_id}/${call.id}.wav`) {
      throw new Error("Recording not found");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signingError } = await supabaseAdmin.storage
      .from("call-recordings").createSignedUrl(call.recording_url, 60 * 60);
    if (signingError || !signed) throw new Error("Could not open this recording");
    return { url: signed.signedUrl };
  });