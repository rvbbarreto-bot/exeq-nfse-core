import { expect, type Page } from "@playwright/test";

/** Grupo accordion da sidebar que contem cada link de navegacao. */
const NAV_ACCORDION_GROUP: Record<string, string> = {
  "nav-dashboard": "Visao geral",
  "nav-issues": "NFS-e e Cobranca",
  "nav-charges": "NFS-e e Cobranca",
  "nav-channel": "NFS-e e Cobranca",
  "nav-catalogs": "Fiscal",
  "nav-master-data": "Fiscal",
  "nav-das-guias": "Fiscal",
  "nav-webhooks": "Operacao",
};

export async function clickNav(page: Page, testId: string): Promise<void> {
  const link = page.getByTestId(testId);
  if (!(await link.isVisible())) {
    const group = NAV_ACCORDION_GROUP[testId];
    if (!group) {
      throw new Error(`Nav testId desconhecido: ${testId}`);
    }
    const trigger = page.getByRole("button", { name: group });
    await expect(trigger).toBeVisible();
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
  }
  await expect(link).toBeVisible();
  await link.click();
}

export async function ensureNavVisible(page: Page, testId: string): Promise<void> {
  const link = page.getByTestId(testId);
  if (!(await link.isVisible())) {
    const group = NAV_ACCORDION_GROUP[testId];
    if (!group) return;
    const trigger = page.getByRole("button", { name: group });
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
  }
  await expect(link).toBeVisible();
}
