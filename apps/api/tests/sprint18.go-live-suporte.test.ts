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
    const p = path.join(candidate, "CHANGELOG_RELEASE_2.md");
    if (existsSync(p)) return candidate;
  }
  return candidates[0]!;
}

describe("Sprint 18 — go-live suporte TI", () => {
  it("GL-18-01: homolog-doctor verifica gateway_payment_url", async () => {
    const doctor = await readFile(path.join(coreRoot, "scripts/homolog-doctor.mjs"), "utf-8");
    const gate = await readFile(path.join(coreRoot, "scripts/schema-gate-charge.mjs"), "utf-8");
    expect(doctor).toContain("checkGatewayPaymentUrlColumn");
    expect(gate).toContain("gateway_payment_url");
  });

  it("GL-18-02: migrate repara coluna gateway_payment_url se ausente", async () => {
    const migrate = await readFile(path.join(apiRoot, "src/db/migrate.ts"), "utf-8");
    expect(migrate).toContain("repairGatewayPaymentUrlColumn");
    expect(migrate).toContain("Applied migration:");
  });

  it("GL-18-03: ata homolog PO registrada", async () => {
    const docs = resolveDocsRoot();
    const ata = await readFile(
      path.join(docs, "evidencias/ATA_HOMOLOG_PORTAL_3_MUNICIPIOS_2026-05-25.md"),
      "utf-8",
    );
    expect(ata).toContain("APROVADA");
    expect(ata).toContain("3504107");
  });

  it("GL-18-04: CHANGELOG 2.1 homolog aprovada", async () => {
    const docs = resolveDocsRoot();
    const changelog = await readFile(path.join(docs, "CHANGELOG_RELEASE_2.md"), "utf-8");
    expect(changelog).toMatch(/2\.1\.0|Release 2\.1|Sprint 18/);
  });

  it("GL-18-05: prod-handoff menciona db:migrate", async () => {
    const handoff = await readFile(path.join(coreRoot, "scripts/prod-handoff.mjs"), "utf-8");
    expect(handoff).toContain("db:migrate");
  });
});
