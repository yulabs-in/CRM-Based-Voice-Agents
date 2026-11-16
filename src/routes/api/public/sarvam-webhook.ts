import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  organization_id: z.string().uuid(),
  external_id: z.string().max(200),
  phone: z.string().max(40).optional(),
  status: z.enum(["queued", "in_progress", "completed", "failed", "no_answer"]).optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  duration_seconds: z.number().int().min(0).max(86400).optional(),
  recording_url: z.string().url().max(2000).optional(),
  transcript: z.string().max(100000).optional(),
  agent_id: z.string().uuid().optional(),
});

export const Route = createFileRoute("/api/public/sarvam-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SARVAM_WEBHOOK_SECRET"];
        const got = request.headers.get("x-webhook-secret") ?? "";
        if (!secret || got.length !== secret.length) return new Response("Unauthorized", { status: 401 });
        let diff = 0; for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ got.charCodeAt(i);
        if (diff !== 0) return new Response("Unauthorized", { status: 401 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const d = parsed.data;
        const { data: existing } = await supabaseAdmin.from("calls").select("id").eq("organization_id", d.organization_id).eq("external_id", d.external_id).maybeSingle();
        const res = existing
          ? await supabaseAdmin.from("calls").update({ ...d, updated_at: new Date().toISOString() }).eq("id", existing.id)
          : await supabaseAdmin.from("calls").insert(d);
        if (res.error) return Response.json({ error: "Could not save call" }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
