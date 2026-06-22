import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Sprint 21 — backfill snapshots P0 (RFC pós-Sprint 3)", () => {
  it("S21-01: rota admin backfill-snapshots registrada", async () => {
    const routes = await readFile(
      path.join(coreRoot, "apps/api/src/modules/fiscal/fiscal-ops.routes.ts"),
      "utf-8",
    );
    const app = await readFile(path.join(coreRoot, "apps/api/src/app.ts"), "utf-8");
    expect(routes).toContain("/v1/fiscal/admin/backfill-snapshots");
    expect(routes).toContain("ADMIN_ROLES");
    expect(routes).toContain("dry_run");
    expect(app).toContain("fiscalOpsRoutes");
  });

  it("S21-02: service extraído com tenantId e dry-run", async () => {
    const service = await readFile(
      path.join(coreRoot, "apps/api/src/modules/fiscal/backfill-tax-snapshot.service.ts"),
      "utf-8",
    );
    expect(service).toContain("tenantId?: string");
    expect(service).toContain("tenant_id: tenant.id");
    expect(service).toContain("dryRun");
    expect(service).toContain("createTaxSnapshot");
  });

  it("S21-03: CLI/script compatível com service", async () => {
    const script = await readFile(
      path.join(coreRoot, "apps/api/src/scripts/backfill-tax-snapshot.ts"),
      "utf-8",
    );
    const mjs = await readFile(path.join(coreRoot, "scripts/backfill-tax-snapshot.mjs"), "utf-8");
    expect(script).toContain("backfill-tax-snapshot.service.js");
    expect(mjs).toContain("runBackfillTaxSnapshots");
    expect(mjs).toContain("--dry-run");
  });

  it("S21-04: kickoff sprint 21 documentado", async () => {
    const kickoff = await readFile(
      path.join(coreRoot, "docs/KICKOFF_DESENVOLVIMENTO_SPRINT21.md"),
      "utf-8",
    );
    expect(kickoff).toContain("POST /v1/fiscal/admin/backfill-snapshots");
    expect(kickoff).toContain("test:sprint21");
  });

  it("S21-05: scripts npm sprint 21", async () => {
    const apiPkg = await readFile(path.join(coreRoot, "apps/api/package.json"), "utf-8");
    const rootPkg = await readFile(path.join(coreRoot, "package.json"), "utf-8");
    expect(apiPkg).toContain("test:sprint21");
    expect(rootPkg).toContain("test:sprint21");
    expect(rootPkg).toContain("sprint21:backfill:homolog-gate");
  });
});
