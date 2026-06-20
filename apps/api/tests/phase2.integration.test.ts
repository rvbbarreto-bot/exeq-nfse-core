import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, withTenant } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Fase 2 — master data + catalogo", () => {
  let token: string;
  let profileId: string;
  let draftCatalogId: string;

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

    const profiles = await app.inject({
      method: "GET",
      url: "/v1/fiscal/profiles",
      headers: { authorization: `Bearer ${token}` },
    });
    profileId = profiles.json().items[0].id;
    await app.close();
    await restoreSeedPublishedCatalog();
  }, 60_000);

  afterAll(async () => {
    await restoreSeedPublishedCatalog();
    await closeDb();
  });

  it("CRUD prestador e tomador", async () => {
    const app = await buildApp();

    const provider = await app.inject({
      method: "POST",
      url: "/v1/providers",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        document: "11222333000181",
        legal_name: "Prestador Piloto LTDA",
        tax_regime: "simples_nacional",
        municipal_registration: "12345",
      },
    });
    if (provider.statusCode === 409) {
      await app.close();
      return;
    }
    expect(provider.statusCode).toBe(201);

    const customer = await app.inject({
      method: "POST",
      url: "/v1/customers",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        document: "52998224725",
        name: "Tomador Teste",
      },
    });
    expect(customer.statusCode).toBe(201);

    const service = await app.inject({
      method: "POST",
      url: "/v1/services",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        service_code: "1.99",
        description: "Servico teste Fase 2",
        lc116_item: "1.99",
      },
    });
    expect(service.statusCode).toBe(201);

    await app.close();
  });

  it("publica novo catalogo draft e resolve tax", async () => {
    const app = await buildApp();

    const draft = await app.inject({
      method: "POST",
      url: "/v1/fiscal/catalogs",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(draft.statusCode).toBe(201);
    draftCatalogId = draft.json().id;

    const rule = await app.inject({
      method: "POST",
      url: `/v1/fiscal/catalogs/${draftCatalogId}/rules`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fiscal_profile_id: profileId,
        ibge_code: "3504107",
        municipio_nome: "Atibaia",
        uf: "SP",
        service_code: "9.99",
        service_description: "Teste Fase 2",
        tax_regime: "simples_nacional",
        iss_rate: 0.02,
        iss_retained: false,
        simples_codigo_tributacao: 3,
        valid_from: "2026-06-01",
      },
    });
    expect(rule.statusCode).toBe(201);

    const checklist = await app.inject({
      method: "PATCH",
      url: `/v1/fiscal/catalogs/${draftCatalogId}/publish-checklist`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        csv_validated: true,
        rules_reviewed: true,
        validado_contador: true,
        terms_accepted: true,
      },
    });
    expect(checklist.statusCode).toBe(200);

    const publish = await app.inject({
      method: "POST",
      url: `/v1/fiscal/catalogs/${draftCatalogId}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().status).toBe("published");

    const resolve = await app.inject({
      method: "POST",
      url: "/v1/tax/resolve",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        ibge_code: "3504107",
        service_code: "9.99",
        tax_regime: "simples_nacional",
        competence_date: "2026-06-01",
      },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().resolved.iss_rate).toBe(0.02);

    await app.close();
  });

  it("bloqueia edicao de catalogo publicado", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/v1/fiscal/catalogs/${draftCatalogId}/rules`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fiscal_profile_id: profileId,
        ibge_code: "3504107",
        municipio_nome: "Atibaia",
        uf: "SP",
        service_code: "9.98",
        service_description: "Nao deve inserir",
        tax_regime: "simples_nacional",
        iss_rate: 0.02,
        iss_retained: false,
        simples_codigo_tributacao: 3,
        valid_from: "2026-06-01",
      },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
