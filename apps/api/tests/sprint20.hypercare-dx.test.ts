import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function resolveDocsRoot(): string {
  const candidates = [
    path.resolve(coreRoot, "../docs"),
    path.resolve(coreRoot, "../EmissaoNFSe/docs"),
    path.resolve(coreRoot, "../../EmissaoNFSe/docs"),
  ];
  for (const candidate of candidates) {
    const p = path.join(candidate, "OPERACAO_HYPERCARE_DASHBOARD.md");
    if (existsSync(p)) return candidate;
  }
  return candidates[0]!;
}

describe("Sprint 20 — hypercare DX", () => {
  it("OP-20-01: hint homolog sandbox no admin", async () => {
    const page = await readFile(
      path.join(coreRoot, "apps/admin/src/pages/ChargeDetailPage.tsx"),
      "utf-8",
    );
    const ui = await readFile(
      path.join(coreRoot, "apps/admin/src/lib/charge-ui.ts"),
      "utf-8",
    );
    expect(page).toContain("charge-sandbox-homolog-hint");
    expect(page).toContain("isHomologMockSandboxUrl");
    expect(ui).toContain("sandbox.exeq.local");
  });

  it("OP-20-02: hypercare-report --fail-on-threshold", async () => {
    const script = await readFile(path.join(coreRoot, "scripts/hypercare-report.mjs"), "utf-8");
    expect(script).toContain("--fail-on-threshold");
    expect(script).toContain("HYPERCARE_MAX_WEBHOOKS_FAILED");
  });

  it("OP-20-03: hypercare-export-webhooks failed CSV", async () => {
    const script = await readFile(
      path.join(coreRoot, "scripts/hypercare-export-webhooks.mjs"),
      "utf-8",
    );
    expect(script).toContain("status=failed");
    expect(script).toContain("id,status");
  });

  it("OP-20-04: doc operador hypercare", async () => {
    const docs = resolveDocsRoot();
    const doc = await readFile(path.join(docs, "OPERACAO_HYPERCARE_DASHBOARD.md"), "utf-8");
    expect(doc).toContain("dashboard-hypercare");
    expect(doc).toContain("hypercare:export-webhooks");
  });

  it("OP-20-05: package scripts sprint 20", async () => {
    const pkg = await readFile(path.join(coreRoot, "package.json"), "utf-8");
    expect(pkg).toContain("hypercare:export-webhooks");
    expect(pkg).toContain("test:sprint20");
  });
});
