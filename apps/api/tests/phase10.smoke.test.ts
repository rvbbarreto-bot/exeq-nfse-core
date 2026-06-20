process.env.NF_SYNC_PROCESSING = "true";
process.env.FOCUS_MOCK = "true";

import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";
import { setupEmissionMasterData } from "./helpers/emission-setup.js";
import { buildEmitPayload, emitViaApi } from "./helpers/qa-setup.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Monorepo git: `EmissaoNFSe/docs`; OneDrive local: `Projeto_Emissao_NFSe/`. */
function resolveDocsRoot(coreRoot: string): string {
  const candidates = [
    path.resolve(coreRoot, "../EmissaoNFSe/docs"),
    path.resolve(coreRoot, "../Projeto_Emissao_NFSe"),
    path.resolve(coreRoot, "../docs"),
  ];
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, "runbooks", "RUNBOOK_EMISSAO_NFSE.md")) &&
      existsSync(path.join(candidate, "runbooks", "RUNBOOK_GATEWAY_SANDBOX.md"))
    ) {
      return candidate;
    }
  }
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "runbooks", "RUNBOOK_EMISSAO_NFSE.md"))) {
      return candidate;
    }
  }
  return candidates[0]!;
}

describe("Fase 10 — smoke go-live / handover", () => {
  let token: string;
  let providerId: string;
  let customerId: string;
  let serviceId: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
    await restoreSeedPublishedCatalog();

    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    token = login.json().access_token;
    const md = await setupEmissionMasterData(app, token);
    providerId = md.providerId;
    customerId = md.customerId;
    serviceId = md.serviceId;
    await app.close();
  }, 90_000);

  afterAll(async () => {
    await restoreSeedPublishedCatalog();
    await closeDb();
  });

  it("FT-01: health reporta fase 10 (go-live ready)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", phase: "10" });
    await app.close();
  });

  it("FT-02: .env.production.example documenta flags de produção", async () => {
    const content = await readFile(path.join(rootDir, ".env.production.example"), "utf-8");
    expect(content).toContain("NODE_ENV=production");
    expect(content).toContain("FOCUS_MOCK=false");
    expect(content).toContain("NF_SYNC_PROCESSING=false");
  });

  it("FT-03: runbooks de handover existem", async () => {
    const docsRoot = resolveDocsRoot(rootDir);
    const emission = await readFile(
      path.join(docsRoot, "runbooks/RUNBOOK_EMISSAO_NFSE.md"),
      "utf-8",
    );
    const dlq = await readFile(path.join(docsRoot, "runbooks/RUNBOOK_DLQ_REPROCESS.md"), "utf-8");
    const secrets = await readFile(
      path.join(docsRoot, "runbooks/RUNBOOK_ROTACAO_SECRETS.md"),
      "utf-8",
    );
    expect(emission).toContain("POST /v1/nf/issues");
    expect(dlq).toContain("reprocess");
    expect(secrets).toContain("focus_token");
    expect(secrets).toContain("gateway_key");
    const gatewayRunbook = await readFile(
      path.join(docsRoot, "runbooks/RUNBOOK_GATEWAY_SANDBOX.md"),
      "utf-8",
    );
    expect(gatewayRunbook).toContain("GATEWAY_MOCK=false");
  });

  it("FT-04: materiais de treinamento entregues", async () => {
    const docsRoot = resolveDocsRoot(rootDir);
    const po = await readFile(path.join(docsRoot, "treinamento/TREINAMENTO_PO.md"), "utf-8");
    const ops = await readFile(
      path.join(docsRoot, "treinamento/TREINAMENTO_OPERADORES.md"),
      "utf-8",
    );
    const ti = await readFile(
      path.join(docsRoot, "treinamento/TREINAMENTO_TI_CLIENTE.md"),
      "utf-8",
    );
    expect(po).toContain("Go-live");
    expect(ops).toContain("Reprocessar");
    expect(ti).toContain("smoke:prod");
  });

  it("FT-05: smoke emissão pós-deploy (simulado)", async () => {
    const app = await buildApp();
    const emit = await emitViaApi(
      app,
      token,
      buildEmitPayload(
        { providerId, customerId, serviceId },
        "3504107",
        `ft-smoke-${Date.now()}`,
      ),
    );
    expect(emit.statusCode).toBe(202);
    expect(emit.json().status).toBe("authorized");
    await app.close();
  });

  it("FT-06: checklist go-live referenciado", async () => {
    const checklist = await readFile(
      path.join(resolveDocsRoot(rootDir), "GO_LIVE_PILOTO_CHECKLIST.md"),
      "utf-8",
    );
    expect(checklist).toContain("smoke:prod");
    expect(checklist).toContain("piloto-sp");
  });
});
