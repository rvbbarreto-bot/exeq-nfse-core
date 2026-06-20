import { test, expect } from "@playwright/test";
import { loginAdmin } from "./helpers/login.js";
import { homologEnv } from "./helpers/homolog-env.js";

const CHANNEL_TOKEN = process.env.EXEQ_CHANNEL_TOKEN ?? "sandbox-channel-token-piloto";

async function seedChannelInbound(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post(`${homologEnv.apiBase}/v1/channel/inbound`, {
    headers: {
      "x-tenant-slug": homologEnv.tenantSlug,
      "x-channel-token": CHANNEL_TOKEN,
      "content-type": "application/json",
    },
    data: {
      phone_e164: "+5511999887766",
      message_id: `e2e-s1-07-${Date.now()}`,
      text: "Tomador: Cliente E2E\nValor: R$ 10,00\nServico: consultoria",
      contact_name: "Cliente E2E",
    },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("S1-07 — Canal WhatsApp admin", () => {
  test("S1-07-A1 — navegação /channel e listagens", async ({ page }) => {
    await loginAdmin(page);
    await page.getByTestId("nav-channel").click();
    await expect(page.getByTestId("page-channel")).toBeVisible();
    await expect(page.getByRole("heading", { name: /canal whatsapp/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /sessões recentes/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /notificações/i })).toBeVisible();
    await expect(page.getByRole("table").first()).toBeVisible();
  });

  test("S1-07-A2 — sessão recente visível após inbound", async ({ page, request }) => {
    await seedChannelInbound(request);
    await loginAdmin(page);
    await page.getByTestId("nav-channel").click();
    await expect(page.getByTestId("page-channel")).toBeVisible();
    const rows = page.locator("section.card").first().locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await expect(rows.first()).toContainText(/collecting|ready_to_confirm|emitted/);
  });
});
