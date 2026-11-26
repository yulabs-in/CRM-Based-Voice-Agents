import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_STATE_PATH = path.resolve(process.cwd(), "e2e/.auth/user.json");

export async function signInAndSelectOrg(page: Page, orgId: string, orgName: string): Promise<void> {
  const email = process.env.E2E_USER_EMAIL?.trim() || "";
  const password = process.env.E2E_USER_PASSWORD?.trim() || "";

  if (!fs.existsSync(AUTH_STATE_PATH)) {
    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    await page.goto("/auth");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });
    await page.context().storageState({ path: AUTH_STATE_PATH });
  } else {
    await page.goto("/dashboard");
    if (page.url().includes("/auth")) {
      await page.getByLabel("Work email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });
      await page.context().storageState({ path: AUTH_STATE_PATH });
    }
  }

  await selectWorkspaceInUi(page, orgId, orgName);
}

export async function selectWorkspaceInUi(page: Page, orgId: string, orgName: string): Promise<void> {
  await page.evaluate((id) => {
    localStorage.setItem("yulabs.org", id);
  }, orgId);
  await page.reload();
  await expect(page.getByText(orgName).first()).toBeVisible({ timeout: 15_000 });
}
