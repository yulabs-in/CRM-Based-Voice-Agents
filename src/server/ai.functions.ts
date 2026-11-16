import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const analyzeCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { callId: string }) => i)
  .handler(async ({ data, context }) => {
    const { data: call, error } = await context.supabase.from("calls").select("id, transcript").eq("id", data.callId).single();
    if (error || !call) throw new Error("Call not found");
    if (!call.transcript) throw new Error("This call has no transcript to analyze");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", stream: true, store: false, reasoning: { effort: "low" },
        instructions: "You analyze sales/support call transcripts (may be in Indian languages). Give a 2-3 sentence English summary, the customer's sentiment, and a short outcome like 'Interested', 'Callback requested' or 'Not interested'.",
        input: call.transcript.slice(0, 20000),
        text: { format: { type: "json_schema", name: "call_analysis", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["summary", "sentiment", "outcome"],
          properties: { summary: { type: "string" }, sentiment: { type: "string", enum: ["positive", "neutral", "negative"] }, outcome: { type: "string" } },
        } } },
      }),
    });
    if (res.status === 429) throw new Error("Too many requests, try again shortly");
    if (res.status === 402) throw new Error("AI credits exhausted");
    if (!res.ok || !res.body) throw new Error("AI analysis failed");
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; let text = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try { const ev = JSON.parse(l.slice(5).trim()); if (ev.type === "response.output_text.delta") text += ev.delta; } catch { /* keep-alive */ }
      }
    }
    const out = JSON.parse(text || "{}") as { summary?: string; sentiment?: string; outcome?: string };
    const { error: ue } = await context.supabase.from("calls").update({ summary: out.summary ?? null, sentiment: out.sentiment ?? null, outcome: out.outcome ?? null }).eq("id", call.id);
    if (ue) throw new Error(ue.message);
    return out;
  });

export const sarvamStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env["SARVAM_API_KEY"];
    if (!key) return { connected: false, message: "No Sarvam API key saved yet" };
    // Lightweight authenticated check: language identification on a short text.
    const r = await fetch("https://api.sarvam.ai/text-lid", { method: "POST", headers: { "api-subscription-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ input: "Namaste" }) });
    if (r.status === 401 || r.status === 403) return { connected: false, message: "Sarvam rejected the API key" };
    return { connected: r.ok, message: r.ok ? "Connected to Sarvam" : `Sarvam returned an error (${r.status})` };
  });
