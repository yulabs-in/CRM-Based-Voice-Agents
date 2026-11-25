import { createFileRoute } from "@tanstack/react-router";
import { apiError, authenticateApiKey, json } from "@/lib/api-auth.server";
import { listLeads } from "@/lib/api/leads.server";

export const Route = createFileRoute("/api/v1/leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateApiKey(request, "leads:read");
          const url = new URL(request.url);
          const status = url.searchParams.get("status");
          const limit = url.searchParams.get("limit");
          const cursor = url.searchParams.get("cursor");

          const result = await listLeads(auth.organizationId, {
            status,
            limit,
            cursor,
          });

          return json(result, {
            headers: {
              "X-RateLimit-Limit": String(auth.rateLimit.limit),
              "X-RateLimit-Remaining": String(auth.rateLimit.remaining),
            },
          });
        } catch (err) {
          return apiError(err);
        }
      },
    },
  },
});
