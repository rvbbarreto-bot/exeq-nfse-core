#!/usr/bin/env node
/**
 * UAT-19 — simula webhook payment.paid (homolog).
 *
 * Uso (qualquer um):
 *   npm run uat:webhook-paid
 *   npm run uat:webhook-paid -- a209ca92-dacd-465c-8aac-ac7ef25bbe5a
 *   $env:CHARGE_ID="..."; npm run uat:webhook-paid
 *
 * Após `npm run uat:charge`, usa .homolog/last-charge.json se CHARGE_ID não estiver definido.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lastChargeFile = path.join(root, ".homolog", "last-charge.json");

const base = process.env.API_URL ?? "http://localhost:3002";
const tenantSlug = process.env.TENANT_SLUG ?? "piloto-sp";
const webhookSecret = process.env.WEBHOOK_SECRET ?? "sandbox-webhook-secret-piloto";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signBody(rawBody) {
  const digest = createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");
  return `sha256=${digest}`;
}

function fail(msg) {
  console.error(`FALHA: ${msg}`);
  process.exit(1);
}

function resolveChargeId() {
  if (process.env.CHARGE_ID) return process.env.CHARGE_ID;

  const flag = process.argv.find((a) => a.startsWith("--charge-id="));
  if (flag) return flag.slice("--charge-id=".length);

  const positional = process.argv.slice(2).find((a) => !a.startsWith("-"));
  if (positional && UUID_RE.test(positional)) return positional;

  try {
    const last = JSON.parse(readFileSync(lastChargeFile, "utf8"));
    if (last.charge_id) {
      console.log(`[uat] usando última cobrança: ${last.charge_id} (${lastChargeFile})\n`);
      return last.charge_id;
    }
  } catch {
    /* sem arquivo */
  }

  return null;
}

function resolveAmountCents(chargeId) {
  if (process.env.AMOUNT_CENTS) return Number(process.env.AMOUNT_CENTS);
  try {
    const last = JSON.parse(readFileSync(lastChargeFile, "utf8"));
    if (last.charge_id === chargeId && last.amount_cents) return Number(last.amount_cents);
  } catch {
    /* ignore */
  }
  return 250000;
}

async function main() {
  const chargeId = resolveChargeId();
  if (!chargeId) {
    fail(
      "sem CHARGE_ID. Rode antes: npm run uat:charge\n" +
        "Ou: npm run uat:webhook-paid -- <uuid>\n" +
        "Ou defina $env:CHARGE_ID na MESMA linha de comando que o webhook.",
    );
  }
  if (!UUID_RE.test(chargeId)) {
    fail(`CHARGE_ID invalido: "${chargeId}"`);
  }

  const amountCents = resolveAmountCents(chargeId);
  const payload = {
    idempotency_key: process.env.WEBHOOK_IDEMPOTENCY_KEY ?? `uat-19-wh-${Date.now()}`,
    event: "payment.paid",
    charge_id: chargeId,
    amount_cents: amountCents,
    paid_at: new Date().toISOString(),
    gateway_ref: process.env.GATEWAY_REF ?? "gw-uat-sandbox-001",
  };

  const rawBody = JSON.stringify(payload);
  const signature = signBody(rawBody);
  const url = `${base}/v1/webhooks/gateway/${tenantSlug}`;

  console.log(`UAT-19 — webhook payment.paid → ${url}\n`);
  console.log("Payload:", rawBody);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": signature,
    },
    body: rawBody,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  console.log("\nResposta:", res.status, JSON.stringify(json, null, 2));

  if (res.status !== 202) fail(`webhook retornou ${res.status}`);
  if (json.duplicate === true) {
    console.warn("AVISO: webhook marcado como duplicate (idempotency_key repetida)");
  }

  console.log("\nOK — UAT-19 (API). Confirme no PORTAL (admin):");
  console.log(`  http://localhost:5173/charges/${chargeId}`);
  console.log("  Status esperado: Paga + evento de pagamento na timeline");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
