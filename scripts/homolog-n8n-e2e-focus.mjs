#!/usr/bin/env node
/**
 * E2E homolog — Focus Nacional (homologacao.focusnfe.com.br ou FOCUS_MOCK) + fluxo n8n V14.
 *
 * Fluxo:
 *   1. Preflight (Focus homolog, Atibaia focus_nacional, E0120 rules)
 *   2. n8n webhook — mensagem draft (simula Evolution)
 *   3. n8n webhook — confirmar emissão
 *   4. Poll NFS-e até terminal
 *   5. Valida ausência E0120 + payload rules
 *   6. Outbound n8n (pending → Evolution → ack)
 *
 * Uso:
 *   npm run homolog:n8n:e2e
 *
 * Pré-requisitos:
 *   npm run homolog:ready-for-qa
 *   npm run channel:up && npm run channel:import-workflow
 *   npm run homolog:focus:ensure-data
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  homologConfig,
  homologTestAmountCents,
  fetchWithRetry,
  flushBullNfQueues,
} from "./homolog-utils.mjs";
import {
  DEFAULT_HOMOLOG_TOMADOR_CNPJ,
  resolveHomologCustomerAddress,
} from "./homolog-tomador-rf.mjs";
import { ATIBAIA_IBGE } from "../packages/shared/dist/homolog-emission-gate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });
config({ path: path.join(root, ".env.channel"), override: true });

function resolveN8nWebhookUrl() {
  const fromEnv = process.env.N8N_WEBHOOK_INBOUND_URL;
  if (fromEnv) return fromEnv;
  const base = process.env.N8N_WEBHOOK_URL ?? "http://localhost:5680";
  if (base.includes("exeq-nfse-whatsapp")) return base;
  return `${base.replace(/\/$/, "")}/webhook/exeq-nfse-whatsapp`;
}

const n8nWebhook = resolveN8nWebhookUrl();
const evolutionUrl = process.env.EVOLUTION_SERVER_URL ?? "http://localhost:8082";
const evolutionInstance = process.env.EVOLUTION_INSTANCE ?? "exeq-nfse-core";
const evolutionApiKey = process.env.EVOLUTION_API_KEY ?? "homolog-evolution-api-key-nfse";
const IBGE = ATIBAIA_IBGE;
const focusBase = process.env.FOCUS_BASE_URL ?? "";

const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
const tenantSlug = process.env.EXEQ_TENANT_SLUG ?? "piloto-sp";
const channelToken = process.env.EXEQ_CHANNEL_TOKEN ?? "sandbox-channel-token-piloto";
  const phone =
    process.env.CHANNEL_E2E_PHONE ??
    process.env.CHANNEL_TEST_PHONE ??
    "+5511973857162";
  if (!phone) {
    console.error("Defina CHANNEL_E2E_PHONE no .env.channel (remetente/cliente simulado)");
    process.exit(1);
  }
const phoneDigits = phone.replace(/\D/g, "");

function channelHeaders(extra = {}) {
  return {
    "x-tenant-slug": tenantSlug,
    "x-channel-token": channelToken,
    "content-type": "application/json",
    ...extra,
  };
}

function evolutionPayload(messageId, text) {
  const digits = phoneDigits;
  return {
    event: "messages.upsert",
    instance: evolutionInstance,
    data: {
      key: {
        remoteJid: `${digits}@s.whatsapp.net`,
        fromMe: false,
        id: messageId,
      },
      message: { conversation: text },
      pushName: "Homolog E2E",
    },
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fail(step, msg, extra) {
  console.error(`\nFALHA [${step}] ${msg}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

function assertFocusProfile(health) {
  const mock = health?.focus?.mock === true || process.env.FOCUS_MOCK === "true";
  const prodProfile =
    process.env.EXEQ_FOCUS_PROFILE === "production" ||
    focusBase.includes("api.focusnfe.com.br");

  if (mock) {
    console.log("   Focus: MOCK ativo — sem chamada HTTP à API Focus");
    return;
  }

  if (prodProfile) {
    if (!focusBase.includes("api.focusnfe.com.br")) {
      fail("preflight", "EXEQ_FOCUS_PROFILE=production exige api.focusnfe.com.br", {
        FOCUS_BASE_URL: focusBase,
      });
    }
    console.log("   Focus: PRODUÇÃO api.focusnfe.com.br (PO — emissão real)");
    return;
  }

  if (focusBase.includes("api.focusnfe.com.br")) {
    fail(
      "preflight",
      "FOCUS_MOCK=false com FOCUS_BASE_URL de PRODUÇÃO sem EXEQ_FOCUS_PROFILE=production",
      { FOCUS_BASE_URL: focusBase },
    );
  }
  if (!focusBase.includes("homologacao.focusnfe.com.br")) {
    fail(
      "preflight",
      "FOCUS_BASE_URL deve ser homologacao.focusnfe.com.br quando FOCUS_MOCK=false",
      { FOCUS_BASE_URL: focusBase },
    );
  }
  console.log("   Focus: homologacao.focusnfe.com.br");
}

async function postN8nWebhook(messageId, text) {
  let last = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetchWithRetry(n8nWebhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(evolutionPayload(messageId, text)),
    });
    let body;
    try {
      body = await res.json();
    } catch {
      body = { raw: await res.text().catch(() => "") };
    }
    last = { status: res.status, body };
    if (res.status !== 404) return last;
    await sleep(3000);
  }
  return last;
}

async function main() {
  console.log("=== E2E Homolog — Focus Nacional + n8n V14 (Atibaia) ===\n");

  await flushBullNfQueues();
  await sleep(500);

  console.log("0/7 — Preflight API + regras municipais");
  const health = await (await fetchWithRetry(`${base}/health`)).json();
  assertFocusProfile(health);
  const focusBaseLabel = health.focus?.base_url ?? (focusBase || "(mock)");
  console.log(`   focus: mock=${health.focus?.mock} base=${focusBaseLabel}`);
  if (health.status !== "ok") fail("health", "API indisponível — npm run homolog:ready-for-qa");
  if (health.atibaia_routing?.provider !== "focus_nacional") {
    fail("routing", "Atibaia deve ser focus_nacional", health.atibaia_routing);
  }
  if (health.atibaia_routing?.enviar_inscricao_municipal_prestador !== false) {
    fail("e0120", "migration 0013 — enviar_inscricao_municipal_prestador deve ser false");
  }
  console.log(`   atibaia: ${health.atibaia_routing?.provider} IM_omit=${!health.atibaia_routing?.enviar_inscricao_municipal_prestador}`);

  try {
    const n8nHealth = await fetch("http://localhost:5680/healthz", { signal: AbortSignal.timeout(3000) });
    if (!n8nHealth.ok) fail("n8n", "n8n offline — npm run channel:up && channel:import-workflow");
    console.log("   n8n: OK");
  } catch {
    fail("n8n", "n8n offline — npm run channel:up && npm run channel:import-workflow");
  }

  const login = await fetchWithRetry(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const { access_token: adminToken } = await login.json();
  if (!adminToken) fail("login", "falha autenticação admin");
  const adminH = { authorization: `Bearer ${adminToken}` };

  const msgId1 = `e2e-n8n-draft-${Date.now()}`;
  const amountLabel = (homologTestAmountCents / 100).toFixed(2).replace(".", ",");

  console.log("\n1/7 — n8n inbound: mensagem draft (Evolution → webhook)");
  const tomadorAddr = resolveHomologCustomerAddress(process.env);
  const draftText = [
    "Tomador: Tomador Homologacao PJ",
    `Documento: ${DEFAULT_HOMOLOG_TOMADOR_CNPJ}`,
    `Valor: R$ ${amountLabel}`,
    "Descricao: E2E n8n Focus Atibaia",
    "Data: 01/06/2026",
    "Codigo do servico: 1.01",
    "Codigo do municipio da prestacao: 3504107",
    `Logradouro do tomador: ${tomadorAddr.street}`,
    `Numero do tomador: ${tomadorAddr.number}`,
    `Bairro do tomador: ${tomadorAddr.district}`,
    `Cep do tomador: ${tomadorAddr.zip_code}`,
    `Codigo do municipio do tomador: ${tomadorAddr.ibge_code}`,
  ].join("\n");
  const w1 = await postN8nWebhook(msgId1, draftText);
  if (w1.status === 404) {
    fail("n8n-webhook", "webhook 404 — workflow V14 inativo? npm run channel:import-workflow");
  }
  if (w1.status >= 500) fail("n8n-webhook", `HTTP ${w1.status}`, w1.body);
  console.log(`   webhook HTTP ${w1.status} (onReceived — processamento assíncrono)`);

  let sessionAfterDraft = null;
  for (let poll = 1; poll <= 10; poll++) {
    await sleep(2000);
    const sessionsAfterDraft = await (
      await fetchWithRetry(`${base}/v1/ops/channel/sessions?limit=20`, { headers: adminH })
    ).json();
    const phoneSessions = (sessionsAfterDraft.items ?? []).filter(
      (s) => s.phone_e164 === phone || s.phone_e164 === `+${phoneDigits}`,
    );
    sessionAfterDraft =
      phoneSessions.find((s) => s.status === "ready_to_confirm") ??
      phoneSessions
        .filter((s) => s.status !== "emitted")
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    if (sessionAfterDraft?.status === "ready_to_confirm") break;
    console.log(`   poll draft ${poll}: status=${sessionAfterDraft?.status ?? "none"}`);
  }
  if (sessionAfterDraft?.status !== "ready_to_confirm") {
    console.log(
      `   sessão status=${sessionAfterDraft?.status} missing=${JSON.stringify(sessionAfterDraft?.missing_fields)}`,
    );
    fail("draft", "n8n não completou draft — verifique workflow V15 API Channel Inbound", sessionAfterDraft);
  }
  const session = { id: sessionAfterDraft.id };
  console.log(`   session_id=${session.id} status=ready_to_confirm`);

  console.log("\n2/7 — n8n inbound: confirmar emissão");
  const msgId2 = `e2e-n8n-confirm-${Date.now()}`;
  const w2 = await postN8nWebhook(msgId2, "confirmar");
  if (w2.status >= 500) fail("n8n-confirm", `HTTP ${w2.status}`, w2.body);
  console.log(`   webhook HTTP ${w2.status} (onReceived)`);
  await sleep(4000);

  let issueId = null;
  const sessionsAfterConfirm = await (
    await fetchWithRetry(`${base}/v1/ops/channel/sessions?limit=20`, { headers: adminH })
  ).json();
  const confirmed = sessionsAfterConfirm.items?.find((s) => s.id === session.id);
  issueId = confirmed?.nf_issue_id;
  console.log(`   session emitted=${confirmed?.status === "emitted"} issue=${issueId ?? "?"}`);
  if (!issueId) fail("issue", "issue_id não retornado pelo fluxo n8n");

  console.log(`\n3/7 — Poll emissão issue_id=${issueId}`);
  let terminalStatus = null;
  let focusErros = [];
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const detail = await (await fetchWithRetry(`${base}/v1/nf/issues/${issueId}`, { headers: adminH })).json();
    const codes = (detail.events?.at(-1)?.metadata?.focus_erros ?? []).map((e) => e.codigo);
    console.log(`   poll ${i + 1}: ${detail.status}${codes.length ? ` [${codes.join(",")}]` : ""}`);
    if (["authorized", "rejected", "failed", "cancelled"].includes(detail.status)) {
      terminalStatus = detail.status;
      focusErros = detail.events?.at(-1)?.metadata?.focus_erros ?? [];
      break;
    }
  }
  if (!terminalStatus) fail("poll", "timeout aguardando emissão");

  const codes = focusErros.map((e) => e.codigo).filter(Boolean);
  if (codes.includes("E0120")) {
    fail("e0120", "E0120 presente — verificar municipal_emission_rules migration 0013", focusErros);
  }
  if (codes.includes("E0240")) {
    fail("e0240", "E0240 CEP×município tomador — alinhar endereço tomador", focusErros);
  }

  console.log("\n4/7 — Validar regras municipais via API");
  const rules = await (
    await fetchWithRetry(`${base}/v1/fiscal/municipal-rules/${IBGE}`, { headers: adminH })
  ).json();
  if (rules.enviar_inscricao_municipal_prestador !== false) {
    fail("rules", "Atibaia deve ter enviar_inscricao_municipal_prestador=false");
  }
  console.log("   OK — regras E0120 confirmadas");

  if (terminalStatus !== "authorized") {
    console.log("\nAVISO — emissão não autorizada (homolog Focus pode rejeitar por cadastro)");
    console.log(JSON.stringify(focusErros, null, 2));
    if (!codes.includes("E0120")) {
      console.log("\nE0120 ausente — correção payload validada; demais erros são cadastro/homolog Focus.");
    }
  } else {
    console.log("\n5/7 — Emissão autorizada (Focus homolog/mock)");
  }

  console.log("\n6/7 — Outbound n8n (pending → Evolution → ack)");
  await sleep(2000);
  const pending = await (
    await fetchWithRetry(`${base}/v1/channel/notifications/pending?limit=20`, {
      headers: channelHeaders({ "content-type": undefined }),
    })
  ).json();
  const notif = pending.items?.find((n) => n.nf_issue_id === issueId);
  if (!notif?.id) {
    fail("notification", "sem notification pending — fluxo outbound incompleto", pending);
  }
  console.log(`   pending id=${notif.id} event=${notif.event_type}`);

  const evoRes = await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
    method: "POST",
    headers: { apikey: evolutionApiKey, "content-type": "application/json" },
    body: JSON.stringify({
      number: notif.phone_e164.replace(/^\+/, ""),
      text: notif.message_body,
    }),
  });
  if (![200, 201].includes(evoRes.status)) {
    const evoBody = await evoRes.text().catch(() => "");
    fail("evolution", `HTTP ${evoRes.status}`, evoBody);
  }
  console.log(`   Evolution sendText HTTP ${evoRes.status}`);

  const ackRes = await fetchWithRetry(`${base}/v1/channel/notifications/${notif.id}/ack`, {
    method: "POST",
    headers: channelHeaders(),
    body: "{}",
  });
  if (ackRes.status !== 204) fail("ack", `HTTP ${ackRes.status}`);

  console.log("\n7/7 — Confirmar fila outbound vazia");
  const after = await (
    await fetchWithRetry(`${base}/v1/channel/notifications/pending?limit=10`, {
      headers: channelHeaders({ "content-type": undefined }),
    })
  ).json();
  const still = after.items?.filter((n) => n.id === notif.id)?.length ?? 0;
  if (still > 0) fail("verify", "notificação ainda pending após ack");

  const e2eOk = terminalStatus === "authorized" && !codes.includes("E0120");
  const focusLabel = health.focus?.mock
    ? "MOCK (sandbox)"
    : focusBase.includes("api.focusnfe.com.br")
      ? "PRODUÇÃO api.focusnfe.com.br"
      : "homolog real";
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  E2E n8n + Focus — ${e2eOk ? "SUCESSO" : "PARCIAL"}                                      ║
╠══════════════════════════════════════════════════════════════════╣
║  session_id:  ${session.id}
║  issue_id:     ${issueId}
║  status:       ${terminalStatus}
║  E0120:        ${codes.includes("E0120") ? "PRESENTE" : "ausente"}
║  E0240:        ${codes.includes("E0240") ? "PRESENTE" : "ausente"}
║  n8n webhook:  ${n8nWebhook}
║  Focus:        ${focusLabel}
╚══════════════════════════════════════════════════════════════════╝
`);

  process.exit(e2eOk ? 0 : codes.includes("E0120") ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
