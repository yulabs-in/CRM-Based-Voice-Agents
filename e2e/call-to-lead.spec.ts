import { test, expect, type Page } from "@playwright/test";
import { seedTestWorkspace, type SeededWorkspace } from "./fixtures/seed";
import { signInAndSelectOrg } from "./fixtures/auth";
import { postSimulatedWebhook, triggerCronSync } from "./fixtures/webhook";

async function placeTestCall(
  page: Page,
  opts: { phone: string; name: string; agentName: string }
): Promise<void> {
  await page.goto("/voice-agents");
  await expect(page.getByRole("heading", { name: /Voice Agents/i })).toBeVisible();

  await page.getByLabel("Recipient number").fill(opts.phone);
  await page.getByLabel("Customer name (optional)").fill(opts.name);

  await page.getByLabel("Voice agent").click();
  await page.getByRole("option", { name: new RegExp(opts.agentName, "i") }).click();

  await page.getByLabel(/I confirm the recipient agreed to receive this call/i).check();
  await page.getByRole("button", { name: "Call now" }).click();
}

test.describe("Call-to-Lead E2E Flow", () => {
  let ws: SeededWorkspace;

  test.beforeEach(async ({ page }, testInfo) => {
    const suffix = `${testInfo.parallelIndex}-${Date.now().toString().slice(-4)}`;
    ws = await seedTestWorkspace(suffix);
    await signInAndSelectOrg(page, ws.orgId, ws.orgName);
  });

  test.afterEach(async () => {
    if (ws) {
      await ws.cleanup();
    }
  });

  test("1. Interested (insurance agent): call completed, lead under Interested, deal in qualification, follow-up task created", async ({
    page,
    request,
  }) => {
    await placeTestCall(page, {
      phone: ws.contactPhone,
      name: ws.contactName,
      agentName: ws.insuranceAgentName,
    });
    await expect(page.getByText(/Call placed/i)).toBeVisible({ timeout: 15_000 });

    await postSimulatedWebhook({
      request,
      admin: ws.admin,
      orgId: ws.orgId,
      phone: ws.contactPhone,
      payloadFile: "interested.json",
    });

    await page.goto("/call-history");
    await expect(page.getByText(ws.contactPhone)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Completed").first()).toBeVisible();

    await page.goto("/leads");
    await expect(page.getByRole("tab", { name: "Interested" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(ws.contactName)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Term Life|Motor|Health/i).first()).toBeVisible();

    await page.goto("/pipeline");
    await expect(page.getByText(/qualification/i).first()).toBeVisible();
    await expect(page.getByText(new RegExp(ws.contactName, "i")).first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/tasks");
    await expect(page.getByText(new RegExp(ws.contactName, "i")).first()).toBeVisible({ timeout: 15_000 });
  });

  test("2. Consultation booked (stock agent): deal moves to proposal stage and follow-up task exists", async ({
    page,
    request,
  }) => {
    await placeTestCall(page, {
      phone: ws.contactPhone,
      name: ws.contactName,
      agentName: ws.stockAgentName,
    });
    await expect(page.getByText(/Call placed/i)).toBeVisible({ timeout: 15_000 });

    await postSimulatedWebhook({
      request,
      admin: ws.admin,
      orgId: ws.orgId,
      phone: ws.contactPhone,
      payloadFile: "consultation-booked.json",
    });

    await page.goto("/call-history");
    await expect(page.getByText("Completed").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/leads");
    await expect(page.getByText(ws.contactName)).toBeVisible({ timeout: 15_000 });

    await page.goto("/pipeline");
    await expect(page.getByText(/proposal/i).first()).toBeVisible();
    await expect(page.getByText(new RegExp(ws.contactName, "i")).first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/tasks");
    await expect(page.getByText(new RegExp(ws.contactName, "i")).first()).toBeVisible({ timeout: 15_000 });
  });

  test("3. Not interested: call completed, no new lead under Interested, no open deal", async ({
    page,
    request,
  }) => {
    await placeTestCall(page, {
      phone: ws.contactPhone,
      name: ws.contactName,
      agentName: ws.insuranceAgentName,
    });
    await expect(page.getByText(/Call placed/i)).toBeVisible({ timeout: 15_000 });

    await postSimulatedWebhook({
      request,
      admin: ws.admin,
      orgId: ws.orgId,
      phone: ws.contactPhone,
      payloadFile: "not-interested.json",
    });

    await page.goto("/call-history");
    await expect(page.getByText("Completed").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/leads");
    await expect(page.getByText(ws.contactName)).toHaveCount(0);

    await page.goto("/pipeline");
    await expect(page.getByText(new RegExp(ws.contactName, "i"))).toHaveCount(0);
  });

  test("4. Do-not-contact: contact marked inactive with do-not-call and next call refused", async ({
    page,
    request,
  }) => {
    await placeTestCall(page, {
      phone: ws.contactPhone,
      name: ws.contactName,
      agentName: ws.insuranceAgentName,
    });
    await expect(page.getByText(/Call placed/i)).toBeVisible({ timeout: 15_000 });

    await postSimulatedWebhook({
      request,
      admin: ws.admin,
      orgId: ws.orgId,
      phone: ws.contactPhone,
      payloadFile: "do-not-contact.json",
    });

    await page.goto("/contacts");
    await expect(page.getByText(ws.contactName)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/inactive/i).first()).toBeVisible();

    await placeTestCall(page, {
      phone: ws.contactPhone,
      name: ws.contactName,
      agentName: ws.insuranceAgentName,
    });
    await expect(page.getByText(/marked do-not-call/i)).toBeVisible({ timeout: 15_000 });
  });

  test("5. Webhook missing (sync path): cron-sync pulls Sarvam mock completion and creates lead", async ({
    page,
    request,
  }) => {
    await placeTestCall(page, {
      phone: ws.contactPhone,
      name: ws.contactName,
      agentName: ws.insuranceAgentName,
    });
    await expect(page.getByText(/Call placed/i)).toBeVisible({ timeout: 15_000 });

    await triggerCronSync({ request, admin: ws.admin });

    await page.goto("/call-history");
    await expect(page.getByText(ws.contactPhone)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Completed").first()).toBeVisible();

    await page.goto("/leads");
    await expect(page.getByRole("tab", { name: "Interested" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(ws.contactName)).toBeVisible({ timeout: 15_000 });
  });
});
