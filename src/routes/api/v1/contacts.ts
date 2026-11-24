import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiError, authenticateApiKey, json, ApiError } from "@/lib/api-auth.server";
import { createOrUpdateContact, listContacts } from "@/lib/api/contacts.server";

const ContactBody = z.object({
  first_name: z.string().trim().min(1, "first_name is required").max(100),
  last_name: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().min(8, "phone is required and must be valid").max(40),
  email: z.string().trim().email("invalid email format").optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  project_id: z.string().uuid("project_id must be a valid UUID").optional().nullable(),
  custom_fields: z.record(z.unknown()).optional().nullable(),
});

export const Route = createFileRoute("/api/v1/contacts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateApiKey(request, "contacts:read");
          const url = new URL(request.url);
          const q = url.searchParams.get("q");
          const projectId = url.searchParams.get("project_id");
          const limit = url.searchParams.get("limit");
          const cursor = url.searchParams.get("cursor");

          const result = await listContacts(auth.organizationId, {
            q,
            projectId,
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
          const auth = await authenticateApiKey(request, "contacts:write");
          const rawBody = await request.json().catch(() => null);
          const parsed = ContactBody.safeParse(rawBody);

          if (!parsed.success) {
            const firstError = parsed.error.errors[0];
            const field = firstError?.path.join(".") || "body";
            throw new ApiError(
              400,
              "invalid_request",
              `Validation error on field '${field}': ${firstError?.message}`
            );
          }

          const { contact, isNew } = await createOrUpdateContact(
            auth.organizationId,
            parsed.data
          );

          return json(
            { data: contact },
            {
              status: isNew ? 201 : 200,
              headers: {
                "X-RateLimit-Limit": String(auth.rateLimit.limit),
                "X-RateLimit-Remaining": String(auth.rateLimit.remaining),
              },
            }
          );
        } catch (err: any) {
          if (err instanceof ApiError) return apiError(err);
          if (err.message && err.message.includes("Invalid phone")) {
            return apiError(new ApiError(400, "invalid_request", err.message));
          }
          return apiError(err);
        }
      },
    },
  },
});
