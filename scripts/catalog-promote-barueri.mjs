#!/usr/bin/env node
/**
 * US-FIS-13-04 — Promote Barueri após VALIDADO_CONTADOR (contador).
 * Uso: VALIDADO_CONTADOR=1 npm run catalog:promote-barueri
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogP0Schema } from "@exeq/shared";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  root,
  "apps/api/fixtures/fiscal-p0/catalog-3505708-rascunho.json",
);
const base = process.env.API_URL ?? "http://localhost:3002";
const email = process.env.SMOKE_EMAIL ?? "admin@piloto.local";
const password = process.env.SMOKE_PASSWORD ?? "changeme";

async function request(method, urlPath, { token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function fail(msg) {
  console.error(`FALHA: ${msg}`);
  process.exit(1);
}

async function main() {
  if (process.env.VALIDADO_CONTADOR !== "1") {
    fail(
      "Defina VALIDADO_CONTADOR=1 após assinatura do contador (docs/evidencias/CHECKLIST_CONTADOR_3505708.md).",
    );
  }

  console.log("=== Promote Barueri 3505708 (Sprint 13) ===\n");

  const raw = JSON.parse(await readFile(fixturePath, "utf-8"));
  const catalog = catalogP0Schema.parse(raw);
  if (catalog.rules.length < 6) {
    fail(`fixture com ${catalog.rules.length} regras; esperado >= 6`);
  }
  for (const rule of catalog.rules) {
    if (rule.input.ibge_code !== "3505708") {
      fail(`regra com IBGE ${rule.input.ibge_code}; esperado 3505708`);
    }
  }
  console.log(`OK  fixture ${catalog.rules.length} regras Barueri validadas\n`);

  const health = await request("GET", "/health");
  if (health.status !== 200) {
    console.log("API offline — apenas validação local do fixture concluída.");
    console.log("Próximo passo: homolog up → marcar gate validado_contador no admin → publicar catálogo.\n");
    return;
  }

  const login = await request("POST", "/v1/auth/login", { body: { email, password } });
  if (login.status !== 200) fail(`login ${login.status}`);
  const token = login.json.access_token;
  if (!token) fail("sem access_token");

  let passed = 0;
  for (const fixture of catalog.rules) {
    const resolve = await request("POST", "/v1/tax/resolve", {
      token,
      body: {
        ibge_code: fixture.input.ibge_code,
        service_code: fixture.input.service_code,
        tax_regime: fixture.input.tax_regime,
        competence_date: fixture.input.competence_date,
        fiscal_profile_name: fixture.input.fiscal_profile_name,
      },
    });
    if (resolve.status !== 200) {
      fail(
        `tax/resolve ${fixture.input.service_code} ${fixture.input.tax_regime}: HTTP ${resolve.status}`,
      );
    }
    passed += 1;
  }
  console.log(`OK  ${passed}/${catalog.rules.length} casos tax/resolve Barueri\n`);

  const catalogs = await request("GET", "/v1/fiscal/catalogs", { token });
  if (catalogs.status === 200) {
    const draft = catalogs.json.items?.find((c) => c.status === "draft");
    if (draft?.id) {
      const patch = await request("PATCH", `/v1/fiscal/catalogs/${draft.id}/publish-checklist`, {
        token,
        body: {
          csv_validated: true,
          rules_reviewed: true,
          validado_contador: true,
          terms_accepted: true,
        },
      });
      if (patch.status === 200) {
        console.log(`OK  checklist draft ${draft.id} — gates incl. validado_contador`);
        console.log("    Publicar manualmente no admin quando PO autorizar nova versão.\n");
      }
    } else {
      console.log(
        "INFO: nenhum catálogo draft — regras Barueri já no seed publicado; gate validado_contador é governança de nova versão.\n",
      );
    }
  }

  console.log("PROMOTE BARUERI — evidência técnica OK (VALIDADO_CONTADOR=1).\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
