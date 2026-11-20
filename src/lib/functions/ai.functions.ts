import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asAnswers, summarizeAnswers } from "@/lib/sarvam-call";

/**
 * Rebuilds a call's summary, sentiment and outcome from the answers the Sarvam agent collected.
 * (No external AI: the agent's own extracted variables are the source of truth.)
 */
export const analyzeCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ callId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: call, error } = await context.supabase.from("calls").select("id, answers, transcript").eq("id", data.callId).single();
    if (error || !call) throw new Error("Call not found");
    const answers = asAnswers(call.answers);
    if (!Object.keys(answers).length) {
      throw new Error(call.transcript
        ? "This call has a transcript but the agent captured no answers. Add output variables (e.g. disposition, interested) to your Sarvam agent."
        : "This call has no answers or transcript yet");
    }
    const insight = summarizeAnswers(answers);
    const { error: updateError } = await context.supabase.from("calls")
      .update({ summary: insight.summary, sentiment: insight.sentiment, outcome: insight.outcome }).eq("id", call.id);
    if (updateError) throw new Error(updateError.message);
    return insight;
  });

export { checkSarvamConnection as sarvamStatus } from "@/lib/sarvam.functions";
