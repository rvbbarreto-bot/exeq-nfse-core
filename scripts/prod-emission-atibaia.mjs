#!/usr/bin/env node
/**
 * PRODUÇÃO Focus — emissão diagnóstico Atibaia (3504107).
 * Hipótese PO: convênio nacional ativo só em produção; homolog nacional quebrado (E0037).
 *
 * Uso:
 *   PROD_EMISSION_CONFIRM=yes npm run prod:emission:atibaia
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local") });

const IBGE = "3504107";
const MUNICIPIO = "Atibaia";
const focusBase = process.env.FOCUS_BASE_URL ?? "";
const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
const homologCustomerDoc = (() => {
  const fromEnv = (process.env.HOMOLOG_CUSTOMER_DOCUMENT ?? "").replace(/\D/g, "");
  const provider = (process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "");
  if (fromEnv && fromEnv !== "52998224725" && fromEnv !== provider) return fromEnv;
  return "11444777000161";
})();

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function diagnose(status, focusErros = []) {
  const codes = focusErros.map((e) => e.codigo).filter(Boolean);
  const messages = focusErros.map((e) => e.mensagem).filter(Boolean);

  console.log("\n--- Diagnostico PO (Hipotese 1) ---");
  console.log(`FOCUS_BASE_URL: ${focusBase}`);
  console.log(`Status terminal: ${status}`);
  if (codes.length) console.log(`Codigos Focus: ${codes.join(", ")}`);

  if (status === "authorized") {
    console.log(`
RESULTADO: HIPOTESE 1 CONFIRMADA (forte)
  Convênio nacional Atibaia responde em PRODUCAO.
  E0037 em homolog + autorizada em prod => homolog nacional provavelmente quebrado/desatualizado.
  ACAO: cancelar NFS-e de teste se necessario; manter homolog municipal separado ate Focus/prefeitura corrigir.
`);
    return;
  }

  if (codes.includes("E0202")) {
    console.log(`
RESULTADO: HIPOTESE 1 CONFIRMADA + ajuste tomador
  Convênio nacional OK em PRODUCAO (nao houve E0037).
  E0202: prestador = tomador — use tomador CNPJ distinto (npm run homolog:focus:ensure-data).
`);
    return;
  }

  if (codes.includes("E0037")) {
    console.log(`
RESULTADO: HIPOTESE 1 REFUTADA
  E0037 também em PRODUCAO — Atibaia nao reconhecida no convênio nacional (ou cadastro Focus divergente).
  Nao e apenas falha do ambiente de homologacao nacional.
`);
    return;
  }

  if (codes.length || status === "rejected") {
    console.log(`
RESULTADO: HIPOTESE 1 PARCIALMENTE CONFIRMADA
  Passou da validacao de convênio municipal (nao houve E0037).
  Rejeicao por regra de negocio/cadastro: ${messages.join(" | ") || "ver metadata"}.
  Interpretacao: ambiente PRODUCAO nacional aceita Atibaia; ajustar cadastro (IM, servico, tomador).
`);
    return;
  }

  console.log("RESULTADO: inconclusivo — analisar events/metadata manualmente.");
}

async function main() {
  if (process.env.PROD_EMISSION_CONFIRM !== "yes") {
    console.error(`
BLOQUEADO — emissao em PRODUCAO Focus (nota fiscal real).

Para executar o diagnostico PO:
  $env:PROD_EMISSION_CONFIRM = "yes"
  npm run prod:emission:atibaia
`);
    process.exit(1);
  }

  if (!focusBase.includes("api.focusnfe.com.br")) {
    console.error(`ERRO: FOCUS_BASE_URL deve ser producao (api.focusnfe.com.br). Atual: ${focusBase || "(vazio)"}`);
    console.error("Rode: npm run prod:focus:configure");
    process.exit(1);
  }

  console.log(`=== PRODUCAO Focus — emissao diagnostico ${MUNICIPIO} (${IBGE}) ===\n`);

  const login = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  if (login.status !== 200 || !loginBody.access_token) {
    console.error(`FALHA login: HTTP ${login.status}`);
    process.exit(1);
  }
  const token = loginBody.access_token;
  const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const tax = await fetch(`${base}/v1/tax/resolve`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      ibge_code: IBGE,
      service_code: "1.01",
      tax_regime: "simples_nacional",
      competence_date: "2026-06-01",
      fiscal_profile_name: "Perfil Piloto SP",
    }),
  });
  const taxBody = await tax.json();
  if (tax.status !== 200) {
    console.error("FALHA tax/resolve:", tax.status, JSON.stringify(taxBody));
    process.exit(1);
  }

  const providers = await (await fetch(`${base}/v1/providers?limit=5`, { headers: h })).json();
  const provider =
    providers.items?.find((p) => p.document === "37229907000137") ?? providers.items?.[0];
  const providerDoc = provider?.document?.replace(/\D/g, "") ?? "";
  const customers = await (await fetch(`${base}/v1/customers?limit=50`, { headers: h })).json();
  const customer =
    customers.items?.find((c) => c.document?.replace(/\D/g, "") === homologCustomerDoc) ??
    customers.items?.find((c) => c.document?.replace(/\D/g, "") !== providerDoc) ??
    customers.items?.[0];
  const customerId = customer?.id;
  if (customer?.document?.replace(/\D/g, "") === providerDoc) {
    console.error("FALHA: tomador nao pode ser o mesmo CNPJ do prestador (E0202). Rode npm run homolog:focus:ensure-data");
    process.exit(1);
  }
  const services = await (await fetch(`${base}/v1/services?limit=10`, { headers: h })).json();
  const service = services.items?.find((s) => s.service_code === "1.01") ?? services.items?.[0];

  if (!provider?.id || !customerId || !service?.id) {
    console.error("FALHA: master data — npm run homolog:focus:ensure-data");
    process.exit(1);
  }

  const issue = await fetch(`${base}/v1/nf/issues`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      idempotency_key: `prod-diagnostico-atibaia-${Date.now()}`,
      provider_id: provider.id,
      customer_id: customerId,
      service_id: service.id,
      ibge_code: IBGE,
      competence_date: "2026-06-01",
      amount_cents: 100,
      description: `Diagnostico PO E0037 ${MUNICIPIO} PROD`,
    }),
  });
  const issueBody = await issue.json();
  if (![200, 201, 202].includes(issue.status) || !issueBody.issue_id) {
    console.error("FALHA emissão POST:", issue.status, JSON.stringify(issueBody));
    process.exit(1);
  }

  const issueId = issueBody.issue_id;
  console.log(`POST ${issue.status} issue_id=${issueId} status=${issueBody.status}`);

  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const detail = await (await fetch(`${base}/v1/nf/issues/${issueId}`, { headers: h })).json();
    const lastEvent = detail.events?.[detail.events.length - 1];
    console.log(
      `poll ${i + 1}: ${detail.status}${detail.focus_ref ? ` ref=${detail.focus_ref}` : ""}`,
    );

    if (["authorized", "rejected", "failed", "cancelled"].includes(detail.status)) {
      const focusErros = lastEvent?.metadata?.focus_erros ?? [];
      const workerError = lastEvent?.metadata?.error;
      if (workerError?.includes("401")) {
        console.log("\n--- Diagnostico PO ---");
        console.log(`
BLOQUEIO: token Focus invalido para PRODUCAO (HTTP 401).
O vault ainda tem token de homologacao. PO deve gravar token de producao:

  $env:FOCUS_TOKEN = "TOKEN_DO_PAINEL_FOCUS_PRODUCAO"
  npm run prod:focus:save-token
  # reiniciar worker + repetir prod:emission:atibaia
`);
        process.exit(1);
      }
      diagnose(detail.status, focusErros);

      console.log("\n--- Detalhe ---");
      console.log(`issue_id:  ${issueId}`);
      console.log(`focus_ref: ${detail.focus_ref ?? "(n/a)"}`);
      console.log(JSON.stringify(detail.events?.slice(-3), null, 2));

      process.exit(detail.status === "authorized" ? 0 : 1);
    }
  }

  console.error("FALHA — timeout (worker rodando com FOCUS_BASE_URL producao?)");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
