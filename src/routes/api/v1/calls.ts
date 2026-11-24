import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiError, authenticateApiKey, json, ApiError } from "@/lib/api-auth.server";
import { listCalls, placeOutboundCall } from "@/lib/api/calls.server";

const CallBody = z.object({
  phone: z.string().trim().min(8, "phone is required").max(40),
  agent_id: z.string().uuid("agent_id must be a valid UUID"),
  contact_id: z.string().uuid("contact_id must be a valid UUID").optional().nullable(),
  variables: z.record(z.unknown()).optional(),
  consent_confirmed: z.literal(true, {
    errorMap: () => ({ message: "consent_confirmed must be explicitly set to true" }),
  }),
});

export const Route = createFileRoute("/api/v1/calls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateApiKey(request, "calls:read");
          const url = new URL(request.url);
          const status = url.searchParams.get("status");
          const agentId = url.searchParams.get("agent_id");
          const campaignId = url.searchParams.get("campaign_id");
          const since = url.searchParams.get("since");
          const limit = url.searchParams.get("limit");
          const cursor = url.searchParams.get("cursor");

          const result = await listCalls(auth.organizationId, {
            status,
            agentId,
            campaignId,
            since,
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

      POST: async ({ request }) => {
        try {
          const auth = await authenticateApiKey(request, "calls:write");
          const rawBody = await request.json().catch(() => null);
          const parsed = CallBody.safeParse(rawBody);

          if (!parsed.success) {
            const firstError = parsed.error.errors[0];
            const field = firstError?.path.join(".") || "body";
            throw new ApiError(
              400,
              "invalid_request",
              `Validation error on field '${field}': ${firstError?.message}`
            );
          }

          const origin = new URL(request.url).origin;
          const result = await placeOutboundCall(
            auth.organizationId,
            parsed.data,
            origin
          );

          return json(
            { data: result },
            {
              status: 201,
              headers: {
                "X-RateLimit-Limit": String(auth.rateLimit.limit),
                "X-RateLimit-Remaining": String(auth.rateLimit.remaining),
              },
            }
          );
        } catch (err: any) {
          if (err instanceof ApiError) return apiError(err);
          if (err.status === 409 || err.code === "do_not_contact") {
            return apiError(new ApiError(409, "do_not_contact", err.message));
          }
          if (err.message && (err.message.includes("consent") || err.message.includes("Invalid phone"))) {
            return apiError(new ApiError(400, "invalid_request", err.message));
          }
          return apiError(err);
        }
      },
    },
  },
});
