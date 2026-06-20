#!/usr/bin/env node
/**
 * Validação pós-deploy E0120 — Atibaia via Focus Nacional.
 * CNPJ prestador padrão: 37229907000137 (HOMOLOG_PROVIDER_CNPJ).
 *
 * Checklist:
 *   1. /health — provider focus_nacional + enviar_inscricao_municipal_prestador=false
 *   2. GET /v1/fiscal/municipal-rules/3504107
 *   3. Emissão real/sandbox (PROD_EMISSION_CONFIRM=yes para produção Focus)
 *   4. Ausência de código E0120 nos erros Focus
 *
 * Uso homolog:
 *   npm run validate:e0120:atibaia
 *
 * Uso produção (nota fiscal real):
 *   $env:PROD_EMISSION_CONFIRM = "yes"
 *   npm run prod:validate:e0120:atibaia
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const IBGE = "3504107";
const PRESTADOR_CNPJ = (process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(base) {
  const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
  const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
  const res = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (res.status !== 200 || !body.access_token) {
    throw new Error(`login HTTP ${res.status}`);
  }
  return body.access_token;
}

async function assertMunicipalRules(base, token) {
  const h = { authorization: `Bearer ${token}` };
  const res = await fetch(`${base}/v1/fiscal/municipal-rules/${IBGE}`, { headers: h });
  const rules = await res.json();
  if (res.status !== 200) {
    throw new Error(`municipal-rules HTTP ${res.status}: ${JSON.stringify(rules)}`);
  }
  if (rules.provider_kind !== "focus_nacional") {
    throw new Error(`provider_kind esperado focus_nacional, obtido ${rules.provider_kind}`);
  }
  if (rules.enviar_inscricao_municipal_prestador !== false) {
    throw new Error("enviar_inscricao_municipal_prestador deve ser false para Atibaia (E0120)");
  }
  console.log("OK — municipal_emission_rules Atibaia");
  console.log(`  provider_kind: ${rules.provider_kind}`);
  console.log(`  enviar_inscricao_municipal_prestador: ${rules.enviar_inscricao_municipal_prestador}`);
  return rules;
}

async function assertHealth(base) {
  const res = await fetch(`${base}/health`);
  const health = await res.json();
  if (!res.ok) throw new Error(`health HTTP ${res.status}`);
  const routing = health.atibaia_routing;
  if (routing?.provider !== "focus_nacional") {
    throw new Error(`health.atibaia_routing.provider=${routing?.provider}`);
  }
  if (routing?.enviar_inscricao_municipal_prestador !== false) {
    throw new Error("health deve refletir enviar_inscricao_municipal_prestador=false");
  }
  console.log("OK — /health Atibaia focus_nacional + IM omitida");
}

async function emitAndValidate(base, token) {
  const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const providers = await (await fetch(`${base}/v1/providers?limit=20`, { headers: h })).json();
  const provider = providers.items?.find((p) => p.document?.replace(/\D/g, "") === PRESTADOR_CNPJ);
  if (!provider?.id) {
    throw new Error(`prestador CNPJ ${PRESTADOR_CNPJ} não encontrado — rode homolog:focus:ensure-data`);
  }

  const customers = await (await fetch(`${base}/v1/customers?limit=50`, { headers: h })).json();
  const customer = customers.items?.find(
    (c) => c.document?.replace(/\D/g, "") !== PRESTADOR_CNPJ,
  );
  const services = await (await fetch(`${base}/v1/services?limit=10`, { headers: h })).json();
  const service = services.items?.find((s) => s.service_code === "1.01") ?? services.items?.[0];
  if (!customer?.id || !service?.id) {
    throw new Error("master data incompleto");
  }

  const issueRes = await fetch(`${base}/v1/nf/issues`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      idempotency_key: `validate-e0120-${Date.now()}`,
      provider_id: provider.id,
      customer_id: customer.id,
      service_id: service.id,
      ibge_code: IBGE,
      competence_date: "2026-06-01",
      amount_cents: 100,
      description: "Validacao E0120 pos-deploy migration 0013",
    }),
  });
  const issueBody = await issueRes.json();
  if (![200, 201, 202].includes(issueRes.status) || !issueBody.issue_id) {
    throw new Error(`emissão POST ${issueRes.status}: ${JSON.stringify(issueBody)}`);
  }

  const issueId = issueBody.issue_id;
  console.log(`POST emissão issue_id=${issueId} status=${issueBody.status}`);

  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const detail = await (await fetch(`${base}/v1/nf/issues/${issueId}`, { headers: h })).json();
    const lastEvent = detail.events?.[detail.events.length - 1];
    const focusErros = lastEvent?.metadata?.focus_erros ?? [];
    const codes = focusErros.map((e) => e.codigo).filter(Boolean);

    console.log(`poll ${i + 1}: ${detail.status}${codes.length ? ` erros=${codes.join(",")}` : ""}`);

    if (["authorized", "rejected", "failed", "cancelled"].includes(detail.status)) {
      if (codes.includes("E0120")) {
        throw new Error("E0120 ainda presente — verificar migration 0013 e payload Focus");
      }
      if (detail.status === "authorized") {
        console.log("OK — emissão autorizada sem E0120");
        return;
      }
      console.log("AVISO — emissão não autorizada, mas E0120 ausente");
      console.log(JSON.stringify(focusErros, null, 2));
      return;
    }
  }
  throw new Error("timeout aguardando emissão");
}

async function main() {
  const isProd = (process.env.FOCUS_BASE_URL ?? "").includes("api.focusnfe.com.br");
  if (isProd && process.env.PROD_EMISSION_CONFIRM !== "yes") {
    console.error(`
BLOQUEADO — FOCUS_BASE_URL aponta produção.

Para validar em produção:
  $env:PROD_EMISSION_CONFIRM = "yes"
  npm run prod:validate:e0120:atibaia
`);
    process.exit(1);
  }

  const base = process.env.API_URL ?? homologConfig.apiBase;
  console.log(`=== Validação E0120 — Atibaia (${IBGE}) CNPJ ${PRESTADOR_CNPJ} ===\n`);

  await assertHealth(base);
  const token = await login(base);
  await assertMunicipalRules(base, token);

  if (process.env.SKIP_EMISSION === "true") {
    console.log("\nSKIP_EMISSION=true — checklist DB/health OK, emissão omitida");
    return;
  }

  await emitAndValidate(base, token);
  console.log("\n=== Validação E0120 concluída ===");
}

main().catch((err) => {
  console.error("FALHA:", err.message ?? err);
  process.exit(1);
});
