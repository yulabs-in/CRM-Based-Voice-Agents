import { createFileRoute } from "@tanstack/react-router";
import { apiError, authenticateApiKey, json, ApiError } from "@/lib/api-auth.server";
import { getCallById } from "@/lib/api/calls.server";

export const Route = createFileRoute("/api/v1/calls/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticateApiKey(request, "calls:read");
          const call = await getCallById(auth.organizationId, params.id);

          if (!call) {
            throw new ApiError(404, "not_found", "Call not found");
          }

          return json(
            { data: call },
            {
              headers: {
                "X-RateLimit-Limit": String(auth.rateLimit.limit),
                "X-RateLimit-Remaining": String(auth.rateLimit.remaining),
              },
            }
          );
        } catch (err) {
          return apiError(err);
        }
      },
    },
  },
});
