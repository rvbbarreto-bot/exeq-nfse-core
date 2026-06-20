process.env.NF_SYNC_PROCESSING = "true";
process.env.FOCUS_MOCK = "true";
process.env.FOCUS_HOMOLOG_MOCK = "true";

import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";
import {
  setFocusClient,
  HomologSandboxFocusClient,
  MockFocusClient,
} from "../src/modules/integration/focus/focus-client.js";
import { setupEmissionMasterData } from "./helpers/emission-setup.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

const PILOT_IBGE = [
  { code: "3504107", label: "Atibaia" },
  { code: "3507605", label: "Braganca Paulista" },
  { code: "3528502", label: "Mairipora" },
] as const;

describe("Fase 5 — homologacao Focus sandbox (funcional)", () => {
  let token: string;
  let providerId: string;
  let customerId: string;
  let serviceId: string;

  beforeAll(async () => {
    setFocusClient(new HomologSandboxFocusClient());
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
  }, 60_000);

  afterAll(async () => {
    await restoreSeedPublishedCatalog();
    setFocusClient(null);
    await closeDb();
  });

  for (const m of PILOT_IBGE) {
    it(`FH-0${PILOT_IBGE.indexOf(m) + 1}: homolog ${m.label} (IBGE ${m.code})`, async () => {
      const app = await buildApp();
      const emit = await app.inject({
        method: "POST",
        url: "/v1/nf/issues",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          idempotency_key: `fh-${m.code}-${Date.now()}`,
          provider_id: providerId,
          customer_id: customerId,
          service_id: serviceId,
          ibge_code: m.code,
          competence_date: "2026-06-01",
          amount_cents: 150000,
        },
      });
      expect(emit.statusCode).toBe(202);
      expect(emit.json().status).toBe("authorized");

      const detail = await app.inject({
        method: "GET",
        url: `/v1/nf/issues/${emit.json().issue_id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(detail.json().status).toBe("authorized");
      await app.close();
    });
  }

  it("FH-04: cancela NFS-e autorizada via Focus mock", async () => {
    const app = await buildApp();
    const emit = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fh-cancel-${Date.now()}`,
        provider_id: providerId,
        customer_id: customerId,
        service_id: serviceId,
        ibge_code: "3504107",
        competence_date: "2026-06-01",
        amount_cents: 120000,
      },
    });
    const issueId = emit.json().issue_id;

    const cancel = await app.inject({
      method: "POST",
      url: `/v1/nf/issues/${issueId}/cancel`,
      headers: { authorization: `Bearer ${token}` },
      payload: { justificativa: "Cancelamento homologacao sandbox Fase 5 teste." },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe("cancelled");
    expect(cancel.json().operator.detail).toContain("cancelada");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${issueId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().status).toBe("cancelled");
    await app.close();
  });

  it("FH-05: rejeicao Focus retorna mensagem operador-friendly", async () => {
    class RejectingFocusClient extends MockFocusClient {
      override async consultNfsen() {
        return {
          status: "erro_autorizacao",
          erros: [{ codigo: "E001", mensagem: "Codigo servico invalido" }],
          raw: { status: "erro_autorizacao" },
        };
      }
    }
    setFocusClient(new RejectingFocusClient());

    const app = await buildApp();
    const emit = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fh-reject-${Date.now()}`,
        provider_id: providerId,
        customer_id: customerId,
        service_id: serviceId,
        ibge_code: "3504107",
        competence_date: "2026-06-01",
        amount_cents: 80000,
      },
    });
    expect(emit.statusCode).toBe(202);
    expect(emit.json().status).toBe("rejected");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${emit.json().issue_id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const lastEvent = detail.json().events.at(-1);
    expect(lastEvent.metadata.operator.detail).toContain("Prefeitura");
    setFocusClient(new HomologSandboxFocusClient());
    await app.close();
  });

  it("FH-06: cancelamento negado para NFS-e nao autorizada", async () => {
    const app = await buildApp();
    const emit = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fh-nocancel-${Date.now()}`,
        provider_id: providerId,
        customer_id: customerId,
        service_id: serviceId,
        ibge_code: "3550308",
        competence_date: "2026-06-01",
        amount_cents: 50000,
      },
    });
    expect(emit.json().status).toBe("rejected");

    const cancel = await app.inject({
      method: "POST",
      url: `/v1/nf/issues/${emit.json().issue_id}/cancel`,
      headers: { authorization: `Bearer ${token}` },
      payload: { justificativa: "Tentativa cancelamento indevido homologacao." },
    });
    expect(cancel.statusCode).toBe(409);
    await app.close();
  });
});
