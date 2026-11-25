import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiError, authenticateApiKey, json, ApiError } from "@/lib/api-auth.server";
import { getContactById, updateContact } from "@/lib/api/contacts.server";

const PatchContactBody = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().min(8).max(40).optional(),
  email: z.string().trim().email().optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  custom_fields: z.record(z.unknown()).optional().nullable(),
});

export const Route = createFileRoute("/api/v1/contacts/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticateApiKey(request, "contacts:read");
          const contact = await getContactById(auth.organizationId, params.id);

          if (!contact) {
            throw new ApiError(404, "not_found", "Contact not found");
          }

          return json(
            { data: contact },
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

      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticateApiKey(request, "contacts:write");
          const rawBody = await request.json().catch(() => null);
          const parsed = PatchContactBody.safeParse(rawBody);

          if (!parsed.success) {
            const firstError = parsed.error.errors[0];
            const field = firstError?.path.join(".") || "body";
            throw new ApiError(
              400,
              "invalid_request",
              `Validation error on field '${field}': ${firstError?.message}`
            );
          }

          // Check existence first for proper 404
          const existing = await getContactById(auth.organizationId, params.id);
          if (!existing) {
            throw new ApiError(404, "not_found", "Contact not found");
          }

          const updated = await updateContact(
            auth.organizationId,
            params.id,
            parsed.data
          );

          return json(
            { data: updated },
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
