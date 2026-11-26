import { createFileRoute } from "@tanstack/react-router";
import { isOriginAllowed } from "@/lib/widget";
import { corsHeaders, handleWidgetSubmit, loadWidgetByKey } from "@/lib/widget.server";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export const Route = createFileRoute("/api/public/widget-submit")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (!origin) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: corsHeaders(origin, "POST, OPTIONS") });
      },
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const referer = request.headers.get("referer");
        const body = await request.json().catch(() => null);

        const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
        const key = typeof (body as { key?: unknown } | null)?.key === "string"
          ? String((body as { key: string }).key).trim()
          : "";

        let allowedOrigin: string | null = null;
        if (key && origin) {
          const found = await loadWidgetByKey(supabaseAdmin, key);
          if (found && isOriginAllowed(origin, found.widget.allowed_domains)) {
            allowedOrigin = origin;
          }
        }

        const result = await handleWidgetSubmit({
          client: supabaseAdmin,
          input: body,
          origin,
          referer,
          ip: clientIp(request),
          requestOrigin: new URL(request.url).origin,
        });

        return Response.json(result.body, {
          status: result.status,
          headers: corsHeaders(allowedOrigin, "POST, OPTIONS"),
        });
      },
    },
  },
});
