import { test, expect } from "@playwright/test";
import { loginAdmin } from "./helpers/login.js";
import { clickNav } from "./helpers/nav.js";

test.describe("S1-07 — Cadastros /master-data", () => {
  test("S1-07-B1 — abas prestador, tomador e serviço", async ({ page }) => {
    await loginAdmin(page);
    await clickNav(page, "nav-master-data");
    await expect(page.getByTestId("page-master-data")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^cadastros$/i })).toBeVisible();

    await expect(page.getByTestId("tab-providers")).toBeVisible();
    await expect(page.getByTestId("tab-customers")).toBeVisible();
    await expect(page.getByTestId("tab-services")).toBeVisible();
    await expect(page.getByRole("heading", { name: /novo prestador/i })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("S1-07-B2 — lista tomadores", async ({ page }) => {
    await loginAdmin(page);
    await clickNav(page, "nav-master-data");
    await page.getByTestId("tab-customers").click();
    await expect(page.getByRole("heading", { name: /novo tomador/i })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });
  });

  test("S1-07-B3 — lista serviços", async ({ page }) => {
    await loginAdmin(page);
    await clickNav(page, "nav-master-data");
    await page.getByTestId("tab-services").click();
    await expect(page.getByRole("heading", { name: /novo servico/i })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });
  });
});
