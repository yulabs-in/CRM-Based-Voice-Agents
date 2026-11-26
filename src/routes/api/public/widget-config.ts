import { createFileRoute } from "@tanstack/react-router";
import { isOriginAllowed } from "@/lib/widget";
import { corsHeaders, loadWidgetByKey } from "@/lib/widget.server";

export const Route = createFileRoute("/api/public/widget-config")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        const key = new URL(request.url).searchParams.get("key")?.trim() ?? "";
        const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
        const found = key ? await loadWidgetByKey(supabaseAdmin, key) : null;
        if (!found || !isOriginAllowed(origin, found.widget.allowed_domains)) {
          return new Response(null, { status: 403 });
        }
        return new Response(null, { status: 204, headers: corsHeaders(origin, "GET, OPTIONS") });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("key")?.trim() ?? "";
        if (!key) {
          return Response.json({ error: "Missing widget key" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
        const found = await loadWidgetByKey(supabaseAdmin, key);
        if (!found) {
          return Response.json({ error: "Widget not found" }, { status: 404 });
        }

        const origin = request.headers.get("origin");
        if (origin && !isOriginAllowed(origin, found.widget.allowed_domains)) {
          return Response.json({ error: "Origin not allowed" }, { status: 403 });
        }

        const headers = origin ? corsHeaders(origin, "GET, OPTIONS") : { "Cache-Control": "no-store" };
        return Response.json(
          {
            title: found.widget.appearance.title,
            colour: found.widget.appearance.colour,
            button: found.widget.appearance.button,
            privacy_url: found.widget.privacy_url,
            instant_callback: found.widget.instant_callback,
            org_name: found.orgName,
          },
          { status: 200, headers }
        );
      },
    },
  },
});
