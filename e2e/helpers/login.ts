import { expect, type Page } from "@playwright/test";
import { homologEnv } from "./homolog-env.js";

export async function loginAdmin(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.getByTestId("login-email")).toBeVisible();
  await page.getByTestId("login-email").fill(homologEnv.email);
  await page.getByTestId("login-password").fill(homologEnv.password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("page-dashboard")).toBeVisible();
}
