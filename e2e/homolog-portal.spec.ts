import { test, expect } from "@playwright/test";
import {
  apiLogin,
  createAuthorizedPilotIssue,
  createRegisteredCharge,
  homologEnv,
  webhookPaymentPaid,
} from "./helpers/homolog-env.js";
import { clickNav, ensureNavVisible } from "./helpers/nav.js";

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.getByTestId("login-email")).toBeVisible();
  await page.getByTestId("login-email").fill(homologEnv.email);
  await page.getByTestId("login-password").fill(homologEnv.password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("page-dashboard")).toBeVisible();
}

const PILOT_IBGE_SORTED = ["3504107", "3507605", "3528502", "3547809"];

test.describe("Homolog portal — escopo PO 4 municípios", () => {
  test("UAT-P0-01 — login e dashboard", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByRole("heading", { name: /dashboard operacional/i })).toBeVisible();
    await ensureNavVisible(page, "nav-charges");
  });

  test("UAT-P0-02 — lista de cobranças", async ({ page }) => {
    await loginAdmin(page);
    await clickNav(page, "nav-charges");
    await expect(page.getByTestId("page-charges")).toBeVisible();
    await expect(page.getByRole("heading", { name: /cobrancas/i })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("UAT-P0-03 — filtro emissões com 4 municípios piloto (UAT-20)", async ({ page }) => {
    await loginAdmin(page);
    await clickNav(page, "nav-issues");
    await expect(page.getByTestId("page-issues")).toBeVisible();
    const municipio = page.getByTestId("filter-municipio");
    await expect(municipio).toBeVisible();
    await expect(municipio.locator("option", { hasText: "Atibaia" })).toHaveCount(1);
    await expect(municipio.locator("option", { hasText: "Barueri" })).toHaveCount(0);
    const options = await municipio.locator("option").allTextContents();
    await expect(municipio.locator("option", { hasText: "Santo André" })).toHaveCount(1);
    expect(options.filter((t) => t && t !== "Todos").length).toBe(4);
  });

  test("UAT-P0-04 — detalhe cobrança registrada com Gateway (UAT-18)", async ({
    page,
    request,
  }) => {
    const token = await apiLogin(request);
    const charge = await createRegisteredCharge(request, token);
    expect(charge.status).toBe("registered");
    expect(charge.gateway_ref).toBeTruthy();

    await loginAdmin(page);
    await page.goto(`/charges/${charge.id}`);
    await expect(page.getByTestId("page-charge-detail")).toBeVisible();
    await expect(page.getByText("Registrada", { exact: true })).toBeVisible();
    await expect(page.getByTestId("charge-gateway")).toBeVisible();
    await expect(page.getByTestId("charge-gateway-mode")).toContainText("Mock");
    await expect(page.getByTestId("charge-gateway")).toContainText(charge.gateway_ref!);
    const sandboxLink = page.getByTestId("charge-gateway-sandbox-link");
    await expect(sandboxLink).toBeVisible();
    await expect(sandboxLink).toHaveAttribute("href", /sandbox\.exeq\.local/);
  });

  test("UAT-P0-05 — stats API com 4 municípios piloto (UAT-22)", async ({ request }) => {
    const token = await apiLogin(request);
    const res = await request.get(`${homologEnv.apiBase}/v1/nf/issues/stats`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const stats = (await res.json()) as { pilot_municipios: { ibge_code: string }[] };
    expect(stats.pilot_municipios.length).toBe(4);
    const codes = stats.pilot_municipios.map((m) => m.ibge_code).sort();
    expect(codes).toEqual(PILOT_IBGE_SORTED);
  });

  test("UAT-P0-06 — cobrança Paga após webhook (UAT-19)", async ({ page, request }) => {
    const token = await apiLogin(request);
    const charge = await createRegisteredCharge(request, token);
    await webhookPaymentPaid(request, charge.id, charge.amount_cents);

    await loginAdmin(page);
    await page.goto(`/charges/${charge.id}`);
    await expect(page.getByTestId("page-charge-detail")).toBeVisible();
    await expect(page.getByText("Paga", { exact: true })).toBeVisible();
    await expect(page.getByTestId("charge-payment-events")).toContainText("R$");
  });

  test("UAT-P0-07 — emissão Atibaia autorizada no portal (UAT-21)", async ({ page, request }) => {
    const token = await apiLogin(request);
    const issue = await createAuthorizedPilotIssue(request, token);
    expect(issue.status).toBe("authorized");

    await loginAdmin(page);
    await page.goto(`/issues/${issue.issue_id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("page-issue-detail")).toBeVisible();
    await expect(page.locator("span.pill").first()).toHaveText("Autorizada");
    await expect(page.getByTestId("issue-municipio")).toContainText("Atibaia");
  });

  test("UAT-P0-09 — tax resolve Atibaia 3504107", async ({ request }) => {
    const token = await apiLogin(request);
    const res = await request.post(`${homologEnv.apiBase}/v1/tax/resolve`, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      data: {
        ibge_code: "3504107",
        service_code: "1.01",
        tax_regime: "simples_nacional",
        competence_date: "2026-06-01",
        fiscal_profile_name: "Perfil Piloto SP",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { resolved: { iss_rate: number } };
    expect(body.resolved.iss_rate).toBe(0.02);
  });

  test("UAT-P0-10 — emissão Santo André autorizada (Sprint 15)", async ({ page, request }) => {
    const token = await apiLogin(request);
    const issue = await createAuthorizedPilotIssue(
      request,
      token,
      "3547809",
      "Santo André",
    );
    expect(issue.status).toBe("authorized");

    await loginAdmin(page);
    await page.goto(`/issues/${issue.issue_id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("page-issue-detail")).toBeVisible();
    await expect(page.getByTestId("issue-municipio")).toContainText("Santo André");
  });

  test("UAT-P0-10b — tax resolve Santo André 3547809", async ({ request }) => {
    const token = await apiLogin(request);
    const res = await request.post(`${homologEnv.apiBase}/v1/tax/resolve`, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      data: {
        ibge_code: "3547809",
        service_code: "1.01",
        tax_regime: "simples_nacional",
        competence_date: "2026-06-01",
        fiscal_profile_name: "Perfil Piloto SP",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { resolved: { iss_rate: number } };
    expect(body.resolved.iss_rate).toBe(0.02);
  });

  test("UAT-P0-08 — criar cobrança vinculada na emissão (Sprint 12)", async ({ page, request }) => {
    const token = await apiLogin(request);
    const issue = await createAuthorizedPilotIssue(request, token);

    await loginAdmin(page);
    await page.goto(`/issues/${issue.issue_id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("issue-create-charge-form")).toBeVisible();
    await page.getByTestId("issue-create-charge").click();
    await expect(page.getByTestId("page-charge-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Registrada", { exact: true })).toBeVisible();
    await expect(page.getByTestId("charge-gateway")).toBeVisible();
    await expect(page.getByTestId("charge-nf-issue-link")).toBeVisible();
  });
});
