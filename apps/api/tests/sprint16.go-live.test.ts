import { config } from "dotenv";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { PILOT_MUNICIPIOS } from "@exeq/shared";

config({ path: path.resolve(process.cwd(), "../../.env") });

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function resolveDocsRoot(): string {
  const candidates = [
    path.resolve(coreRoot, "../EmissaoNFSe/docs"),
    path.resolve(coreRoot, "../Projeto_Emissao_NFSe"),
    path.resolve(coreRoot, "../docs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "CHANGELOG_RELEASE_2.md"))) return candidate;
  }
  return candidates[0]!;
}

describe("Sprint 16 — go-live + hypercare", () => {
  let token: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    token = login.json().access_token;
    await app.close();
  }, 60_000);

  afterAll(async () => {
    await closeDb();
  });

  it("GL-16-01: escopo PO = 4 municípios no shared", () => {
    expect(PILOT_MUNICIPIOS).toHaveLength(4);
    expect(PILOT_MUNICIPIOS.map((m) => m.ibge_code).sort()).toEqual([
      "3504107",
      "3507605",
      "3528502",
      "3547809",
    ]);
  });

  it("GL-16-03: ops alerts com fila failed e cobranças refinadas", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/ops/alerts",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      issues_failed: expect.any(Number),
      issues_queued: expect.any(Number),
      webhooks_failed: expect.any(Number),
      charges_pending: expect.any(Number),
      charges_registered: expect.any(Number),
    });
    await app.close();
  });

  it("GL-16-04: pacote evidências R2 referenciado", async () => {
    const docs = resolveDocsRoot();
    const changelog = await readFile(path.join(docs, "CHANGELOG_RELEASE_2.md"), "utf-8");
    const index = await readFile(path.join(docs, "runbooks/RUNBOOK_INDEX.md"), "utf-8");
    expect(changelog).toContain("Sprint 16");
    expect(changelog).toContain("3504107");
    expect(index).toContain("GO_LIVE_PILOTO_CHECKLIST");
  });

  it("GL-16-02: script go-live-preflight existe", async () => {
    const script = await readFile(path.join(coreRoot, "scripts/go-live-preflight.mjs"), "utf-8");
    expect(script).toContain("test:phase9");
    expect(script).toContain("3 municípios");
  });
});
