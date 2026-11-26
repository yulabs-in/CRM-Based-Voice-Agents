import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

async function sha256Hex(text: string): Promise<string> {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function postSimulatedWebhook(params: {
  request: APIRequestContext;
  admin: SupabaseClient;
  orgId: string;
  phone: string;
  payloadFile: string;
}): Promise<{ callId: string; status: number }> {
  const payloadPath = path.resolve(process.cwd(), "e2e/payloads", params.payloadFile);
  const rawPayload = JSON.parse(fs.readFileSync(payloadPath, "utf8")) as Record<string, unknown>;

  // Find the latest queued/in_progress call for this org + phone
  const { data: call, error } = await params.admin
    .from("calls")
    .select("id")
    .eq("organization_id", params.orgId)
    .eq("phone", params.phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !call) {
    throw new Error(`Could not find seeded call for webhook: ${error?.message}`);
  }

  // Bind a fresh >=40-char callback token hash so the real webhook auth passes
  const callbackToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await sha256Hex(callbackToken);

  await params.admin
    .from("calls")
    .update({ webhook_token_hash: tokenHash })
    .eq("id", call.id);

  const response = await params.request.post("/api/public/sarvam-call-webhook", {
    data: {
      ...rawPayload,
      webhook_config: {
        metadata: {
          call_id: call.id,
          callback_token: callbackToken,
        },
      },
    },
  });

  return { callId: call.id, status: response.status() };
}

export async function triggerCronSync(params: {
  request: APIRequestContext;
  admin: SupabaseClient;
}): Promise<number> {
  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = await sha256Hex(token);

  // Ensure cron_state row 1 accepts our test token and isn't rate-limited by last_run_at
  await params.admin.from("cron_state").upsert({
    id: 1,
    token_hash: tokenHash,
    last_run_at: new Date(Date.now() - 120_000).toISOString(),
  });

  const res = await params.request.post("/api/public/cron-sync", {
    headers: { "x-cron-token": token },
  });
  return res.status();
}
