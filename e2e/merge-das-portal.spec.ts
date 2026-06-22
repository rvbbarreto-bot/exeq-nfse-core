import { test, expect } from "@playwright/test";
import { loginAdmin } from "./helpers/login.js";
import { clickNav, ensureNavVisible } from "./helpers/nav.js";
import { emitDasGuiaViaApi, listDasGuiasViaApi } from "./helpers/das-api.js";
import { homologEnv } from "./helpers/homolog-env.js";

test.describe("Merge DAS Fase 7 — portal E2E", () => {
  test("E2E-DAS-01 — login EXEQ e dashboard operacional", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.locator(".login-brand__logo")).toHaveText("EXEQ");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

    await page.getByTestId("login-email").fill(homologEnv.email);
    await page.getByTestId("login-password").fill(homologEnv.password);
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("page-dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: /dashboard operacional/i })).toBeVisible();
    await expect(page.getByTestId("gateway-integration-badge")).toBeVisible();
  });

  test("E2E-DAS-02 — sidebar accordion navega para guias DAS", async ({ page }) => {
    await loginAdmin(page);
    await clickNav(page, "nav-das-guias");
    await expect(page.getByTestId("page-das-guias")).toBeVisible();
    await expect(page.getByRole("heading", { name: /guias das \/ darf/i })).toBeVisible();
  });

  test("E2E-DAS-03 — skip link acessivel via teclado", async ({ page }) => {
    await loginAdmin(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Ir para conteudo principal" });
    await expect(skip).toBeFocused();
    await skip.click();
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("E2E-DAS-04 — API emite guia e portal exibe detalhe", async ({ page, request }) => {
    const { guia } = await emitDasGuiaViaApi(request);
    expect(guia.status).toBe("DISPONIVEL");
    expect(guia.valor_total).toBeGreaterThan(0);
    expect(guia.linha_digitavel).toBeTruthy();

    await loginAdmin(page);
    await page.goto(`/das/guias/${guia.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("page-das-guia-detail")).toBeVisible();
    await expect(page.getByRole("heading", { name: /DAS —/i })).toBeVisible();
    await expect(page.getByText("Disponivel", { exact: true })).toBeVisible();
    await expect(page.getByText(guia.linha_digitavel!)).toBeVisible();
  });

  test("E2E-DAS-05 — portal emite guia mock pelo formulario", async ({ page }) => {
    await loginAdmin(page);
    await clickNav(page, "nav-das-guias");
    await expect(page.getByTestId("page-das-guias")).toBeVisible();

    await page.getByRole("button", { name: "Emitir guia" }).click();
    await expect(page.getByTestId("das-emit-form")).toBeVisible();

    const providerSelect = page.locator('[data-testid="das-emit-form"] select').first();
    await expect(providerSelect).toBeVisible();
    const options = providerSelect.locator("option");
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
    await providerSelect.selectOption({ index: 1 });

    const competencia = page.locator('[data-testid="das-emit-form"] input[type="month"]');
    const tick = Date.now();
    const year = 2021 + (tick % 40);
    const month = String((Math.floor(tick / 1000) % 12) + 1).padStart(2, "0");
    await competencia.fill(`${year}-${month}`);

    await page.getByTestId("das-emit-form").getByRole("button", { name: "Emitir" }).click();
    await expect(page.getByTestId("page-das-guia-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /DAS —/i })).toBeVisible();
  });

  test("E2E-DAS-06 — listagem API e portal sincronizados", async ({ page, request }) => {
    const { guia, token } = await emitDasGuiaViaApi(request);
    const listed = await listDasGuiasViaApi(request, token);
    expect(listed.guias.some((g) => g.id === guia.id)).toBe(true);

    await loginAdmin(page);
    await clickNav(page, "nav-das-guias");
    await expect(page.getByTestId("page-das-guias")).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`a[href="/das/guias/${guia.id}"]`)).toBeVisible();
  });

  test("E2E-DAS-07 — rotas legadas issues/charges via sidebar", async ({ page }) => {
    await loginAdmin(page);

    await clickNav(page, "nav-issues");
    await expect(page.getByTestId("page-issues")).toBeVisible();
    await expect(page.getByRole("heading", { name: /emissoes nfs-e/i })).toBeVisible();

    await clickNav(page, "nav-charges");
    await expect(page.getByTestId("page-charges")).toBeVisible();
    await expect(page.getByRole("heading", { name: /cobrancas/i })).toBeVisible();
  });

  test("E2E-DAS-08 — menu mobile abre sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAdmin(page);

    const sidebarLink = page.getByTestId("nav-das-guias");
    await expect(sidebarLink).not.toBeVisible();

    await page.getByTestId("shell-nav-toggle").click();
    await ensureNavVisible(page, "nav-das-guias");
    await sidebarLink.click();

    await expect(page.getByTestId("page-das-guias")).toBeVisible();
  });
});
