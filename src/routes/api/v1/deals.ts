import { createFileRoute } from "@tanstack/react-router";
import { apiError, authenticateApiKey, json } from "@/lib/api-auth.server";
import { listDeals } from "@/lib/api/deals.server";

export const Route = createFileRoute("/api/v1/deals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateApiKey(request, "deals:read");
          const url = new URL(request.url);
          const stage = url.searchParams.get("stage");
          const limit = url.searchParams.get("limit");
          const cursor = url.searchParams.get("cursor");

          const result = await listDeals(auth.organizationId, {
            stage,
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
