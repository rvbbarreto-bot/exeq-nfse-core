#!/usr/bin/env node
/**
 * Smoke de homolog para QA — valida ambiente antes dos UAT.
 * Exit 0 = liberado para testes | Exit 1 = bloqueado (enviar saída à fábrica).
 */
import { homologConfig, fetchExeqHealth, fetchAdmin } from "./homolog-utils.mjs";

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  const tag = ok ? "OK " : "FALHA";
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("=== Smoke homolog QA — Exeq NFS-e ===\n");
  console.log(`API:   ${homologConfig.apiBase}`);
  console.log(`Admin: ${homologConfig.adminBase}`);
  console.log(`Login: ${homologConfig.email}\n`);

  const health = await fetchExeqHealth();
  if (!health.ok) {
    const wrong =
      health.json?.service && health.json.service !== "exeq-nfse-core-api"
        ? `outro serviço na porta ${homologConfig.apiPort} (${health.json.service})`
        : health.error ?? `HTTP ${health.status}`;
    record("API /health (exeq-nfse-core-api)", false, wrong);
  } else {
    record("API /health (exeq-nfse-core-api)", true, `phase=${health.json.phase}`);
  }

  const admin = await fetchAdmin();
  record("Admin (HTML)", admin.ok, admin.error ?? `HTTP ${admin.status}`);

  let token;
  try {
    const login = await fetch(`${homologConfig.apiBase}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: homologConfig.email, password: homologConfig.password }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await login.json();
    if (login.status !== 200 || !body.access_token) {
      record("Login API", false, `HTTP ${login.status} ${body.message ?? ""}`);
    } else {
      token = body.access_token;
      record("Login API", true, `tenant=${body.tenant_id?.slice(0, 8)}…`);
    }
  } catch (err) {
    record("Login API", false, err.message);
  }

  if (token) {
    try {
      const proxyLogin = await fetch(`${homologConfig.adminBase}/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: homologConfig.email, password: homologConfig.password }),
        signal: AbortSignal.timeout(10000),
      });
      record("Login via proxy admin", proxyLogin.status === 200, `HTTP ${proxyLogin.status}`);
    } catch (err) {
      record("Login via proxy admin", false, err.message);
    }

    const customers = await fetch(`${homologConfig.apiBase}/v1/customers?limit=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const custJson = await customers.json();
    const customerId = custJson.items?.[0]?.id;
    if (!customerId) {
      record("Tomador cadastrado", false, "lista vazia — rode npm run db:seed");
    } else {
      record("Tomador cadastrado", true, customerId.slice(0, 8) + "…");
      const create = await fetch(`${homologConfig.apiBase}/v1/charges`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotency_key: `smoke-qa-${Date.now()}`,
          customer_id: customerId,
          amount_cents: 100,
          due_date: "2026-12-31",
          description: "smoke homolog QA",
        }),
      });
      const charge = await create.json();
      const gwOk = create.status === 201 && charge.status === "registered" && charge.gateway_ref;
      record(
        "Cobrança + gateway (UAT-17)",
        gwOk,
        gwOk
          ? `registered ${charge.gateway_ref}`
          : `HTTP ${create.status} status=${charge.status} (GATEWAY_SYNC_PROCESSING?)`,
      );
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log("\n=== Resultado ===");
  if (failed.length === 0) {
    console.log("AMBIENTE LIBERADO para UAT-17..22.");
    console.log("Próximo: npm run uat:charge  (copie o bloco PowerShell do final)");
    process.exit(0);
  }
  console.log(`AMBIENTE BLOQUEADO — ${failed.length} falha(s).`);
  console.log("Ação: npm run homolog:doctor -- --fix");
  console.log("Evidência: anexe esta saída na issue para a fábrica.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
