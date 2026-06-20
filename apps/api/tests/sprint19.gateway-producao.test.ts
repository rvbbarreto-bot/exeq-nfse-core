import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDocsRoot(): string {
  const candidates = [
    path.resolve(coreRoot, "../docs"),
    path.resolve(coreRoot, "../EmissaoNFSe/docs"),
    path.resolve(coreRoot, "../../EmissaoNFSe/docs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "GATEWAY_PROD_ROTACAO.md"))) return candidate;
  }
  return candidates[0]!;
}

function resolveRepoRoot(): string {
  const candidates = [
    path.resolve(coreRoot, ".."),
    path.resolve(coreRoot, "../EmissaoNFSe"),
    path.resolve(coreRoot, "../../EmissaoNFSe"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, ".github/workflows/gateway-smoke.yml"))) {
      return candidate;
    }
  }
  return candidates[0]!;
}

describe("Sprint 19 — gateway produção", () => {
  it("BIL-19-01: smoke-gateway-prod exige GATEWAY_MOCK=false", async () => {
    const script = await readFile(path.join(coreRoot, "scripts/smoke-gateway-prod.mjs"), "utf-8");
    expect(script).toContain("GATEWAY_MOCK");
    expect(script).toContain("/health");
    expect(script).toContain("gateway.mock");
  });

  it("BIL-19-02: runbook rotação gateway_key", async () => {
    const docs = resolveDocsRoot();
    const runbook = await readFile(path.join(docs, "GATEWAY_PROD_ROTACAO.md"), "utf-8");
    expect(runbook).toContain("gateway_key");
    expect(runbook).toContain("smoke:gateway-prod");
  });

  it("BIL-19-03: health expõe gateway + admin badge", async () => {
    const app = await readFile(path.join(apiRoot, "src/app.ts"), "utf-8");
    const dashboard = await readFile(
      path.join(coreRoot, "apps/admin/src/pages/DashboardPage.tsx"),
      "utf-8",
    );
    expect(app).toContain("gateway:");
    expect(app).toContain("GATEWAY_MOCK");
    expect(dashboard).toContain("gateway-integration-badge");
  });

  it("BIL-19-04: workflow gateway-smoke manual", async () => {
    const repo = resolveRepoRoot();
    const wf = await readFile(
      path.join(repo, ".github/workflows/gateway-smoke.yml"),
      "utf-8",
    );
    expect(wf).toContain("workflow_dispatch");
    expect(wf).toContain("smoke:gateway-prod");
  });

  it("BIL-19-05: prod-gateway-postdeploy", async () => {
    const script = await readFile(
      path.join(coreRoot, "scripts/prod-gateway-postdeploy.mjs"),
      "utf-8",
    );
    expect(script).toContain("smoke-gateway-prod");
    expect(script).toContain("uat-webhook-paid");
  });

  it("BIL-19-06: DEPLOY_PRODUCAO documenta GATEWAY_MOCK=false", async () => {
    const deploy = await readFile(path.join(coreRoot, "docs/DEPLOY_PRODUCAO.md"), "utf-8");
    expect(deploy).toContain("GATEWAY_MOCK=false");
    expect(deploy).toContain("smoke:gateway-prod");
  });
});
