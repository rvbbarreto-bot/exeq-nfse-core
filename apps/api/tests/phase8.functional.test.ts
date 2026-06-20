process.env.NF_SYNC_PROCESSING = "true";
process.env.FOCUS_MOCK = "true";

import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";
import { setupEmissionMasterData } from "./helpers/emission-setup.js";
import { channelHeaders, findChannelNotificationForIssue } from "./helpers/channel-setup.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

const PILOT_IBGE = "3504107";

describe("Fase 8 — canal WhatsApp (funcional)", () => {
  let token: string;
  let tenantId: string;
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
    tenantId = login.json().tenant_id;
    const md = await setupEmissionMasterData(app, token);
    providerId = md.providerId;
    customerId = md.customerId;
    serviceId = md.serviceId;
    await app.close();
  }, 60_000);

  afterAll(async () => {
    await restoreSeedPublishedCatalog();
    await closeDb();
  });

  function draftPayload() {
    return {
      provider_id: providerId,
      customer_id: customerId,
      service_id: serviceId,
      ibge_code: PILOT_IBGE,
      competence_date: "2026-06-01",
      amount_cents: 120000,
    };
  }

  async function createReadySession(app: Awaited<ReturnType<typeof buildApp>>, suffix: string) {
    const idem = `fw-${suffix}-${Date.now()}`;
    const create = await app.inject({
      method: "POST",
      url: "/v1/channel/sessions",
      headers: channelHeaders(),
      payload: { phone_e164: "+5511999887766", idempotency_key: idem },
    });
    const sessionId = create.json().session_id;
    await app.inject({
      method: "PATCH",
      url: `/v1/channel/sessions/${sessionId}`,
      headers: channelHeaders(),
      payload: draftPayload(),
    });
    return { sessionId, idem };
  }

  it("FW-01: cria sessao de canal + coleta draft", async () => {
    const app = await buildApp();
    const { sessionId } = await createReadySession(app, "collect");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/channel/sessions/${sessionId}`,
      headers: channelHeaders(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().status).toBe("ready_to_confirm");
    await app.close();
  });

  it("FW-02: idempotency sessao — segunda criacao retorna 409", async () => {
    const app = await buildApp();
    const idem = `fw-dup-session-${Date.now()}`;

    const first = await app.inject({
      method: "POST",
      url: "/v1/channel/sessions",
      headers: channelHeaders(),
      payload: { phone_e164: "+5511888776655", idempotency_key: idem },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/v1/channel/sessions",
      headers: channelHeaders(),
      payload: { phone_e164: "+5511888776655", idempotency_key: idem },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().session_id).toBe(first.json().session_id);
    await app.close();
  });

  it("FW-03: token invalido retorna 401", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/channel/sessions",
      headers: channelHeaders({ "x-channel-token": "token-invalido" }),
      payload: { phone_e164: "+5511777665544", idempotency_key: `fw-bad-${Date.now()}` },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("FW-04: confirm emite NFS-e e marca sessao emitted", async () => {
    const app = await buildApp();
    const { sessionId } = await createReadySession(app, "confirm");

    const confirm = await app.inject({
      method: "POST",
      url: `/v1/channel/sessions/${sessionId}/confirm`,
      headers: channelHeaders(),
    });
    expect(confirm.statusCode).toBe(202);
    expect(confirm.json().status).toBe("authorized");
    expect(confirm.json().issue_id).toBeTruthy();

    const detail = await app.inject({
      method: "GET",
      url: `/v1/channel/sessions/${sessionId}`,
      headers: channelHeaders(),
    });
    expect(detail.json().status).toBe("emitted");
    await app.close();
  });

  it("FW-05: confirm idempotente — segunda chamada retorna 200", async () => {
    const app = await buildApp();
    const { sessionId } = await createReadySession(app, "confirm-idem");

    const first = await app.inject({
      method: "POST",
      url: `/v1/channel/sessions/${sessionId}/confirm`,
      headers: channelHeaders(),
    });
    expect(first.statusCode).toBe(202);

    const second = await app.inject({
      method: "POST",
      url: `/v1/channel/sessions/${sessionId}/confirm`,
      headers: channelHeaders(),
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(second.json().issue_id).toBe(first.json().issue_id);
    await app.close();
  });

  it("FW-06: notificacao pendente apos emissao autorizada", async () => {
    const app = await buildApp();
    const { sessionId } = await createReadySession(app, "notify");

    const confirm = await app.inject({
      method: "POST",
      url: `/v1/channel/sessions/${sessionId}/confirm`,
      headers: channelHeaders(),
    });
    const issueId = confirm.json().issue_id;

    const match = await findChannelNotificationForIssue(tenantId, issueId);
    expect(match).toBeTruthy();
    expect(match!.status).toBe("pending");
    expect(match!.event_type).toBe("nf.authorized");
    expect(match!.message_body).toContain("autorizada");

    const ack = await app.inject({
      method: "POST",
      url: `/v1/channel/notifications/${match!.id}/ack`,
      headers: channelHeaders(),
    });
    expect(ack.statusCode).toBe(204);

    const afterAck = await findChannelNotificationForIssue(tenantId, issueId);
    expect(afterAck!.status).toBe("sent");
    await app.close();
  });

  it("FW-07: paridade canal vs API — mesmo payload gera authorized", async () => {
    const app = await buildApp();
    const idem = `fw-parity-${Date.now()}`;
    const payload = draftPayload();

    const apiEmit = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: { idempotency_key: `${idem}-api`, ...payload },
    });
    expect(apiEmit.statusCode).toBe(202);
    expect(apiEmit.json().status).toBe("authorized");

    const create = await app.inject({
      method: "POST",
      url: "/v1/channel/sessions",
      headers: channelHeaders(),
      payload: { phone_e164: "+5511666554433", idempotency_key: `${idem}-channel` },
    });
    const sessionId = create.json().session_id;
    await app.inject({
      method: "PATCH",
      url: `/v1/channel/sessions/${sessionId}`,
      headers: channelHeaders(),
      payload,
    });
    const channelConfirm = await app.inject({
      method: "POST",
      url: `/v1/channel/sessions/${sessionId}/confirm`,
      headers: channelHeaders(),
    });
    expect(channelConfirm.statusCode).toBe(202);
    expect(channelConfirm.json().status).toBe("authorized");

    const apiDetail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${apiEmit.json().issue_id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const channelDetail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${channelConfirm.json().issue_id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(apiDetail.json().status).toBe(channelDetail.json().status);
    expect(apiDetail.json().amount_cents).toBe(channelDetail.json().amount_cents);
    await app.close();
  });

  it("FW-08: draft incompleto na confirmacao retorna 422", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/channel/sessions",
      headers: channelHeaders(),
      payload: {
        phone_e164: "+5511555443322",
        idempotency_key: `fw-incomplete-${Date.now()}`,
      },
    });
    const sessionId = create.json().session_id;

    const confirm = await app.inject({
      method: "POST",
      url: `/v1/channel/sessions/${sessionId}/confirm`,
      headers: channelHeaders(),
    });
    expect(confirm.statusCode).toBe(422);
    expect(confirm.json().error).toBe("CHANNEL_SESSION_NOT_READY");
    await app.close();
  });

  async function inbound(
    app: Awaited<ReturnType<typeof buildApp>>,
    phone: string,
    text: string,
    extra: { contact_name?: string; message_id?: string } = {},
  ) {
    return app.inject({
      method: "POST",
      url: "/v1/channel/inbound",
      headers: channelHeaders(),
      payload: {
        phone_e164: phone,
        message_id: extra.message_id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        contact_name: extra.contact_name,
      },
    });
  }

  it("FW-09: conversa multi-mensagem acumula draft e pede só campos pendentes", async () => {
    const app = await buildApp();
    const phone = `+55119${String(Date.now()).slice(-8)}`;
    const contactName = "João Silva";

    const r1 = await inbound(app, phone, "bom dia", { contact_name: contactName });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().reply_text).toMatch(/João/i);
    expect(r1.json().emitted).toBe(false);
    const sessionId = r1.json().session_id;

    const r2 = await inbound(app, phone, "tudo bem?");
    expect(r2.statusCode).toBe(200);
    expect(r2.json().session_id).toBe(sessionId);
    expect(r2.json().reply_text).not.toMatch(/Ainda faltam/i);
    expect(r2.json().reply_text).toMatch(/olá de novo|Olá de novo/i);

    const r3 = await inbound(app, phone, "quer uma nota");
    expect(r3.statusCode).toBe(200);
    expect(r3.json().reply_text).not.toMatch(/Ainda faltam/i);
    expect(r3.json().reply_text).toMatch(/várias mensagens|reunindo|quando quiser/i);

    const partial = [
      "Documento: 52998224725",
      "Valor: R$ 1.200,00",
      "Descrição: Consultoria homolog",
      "Data: 01/06/2026",
      "Código do serviço: 1.01",
      `Código do município da prestação: ${PILOT_IBGE}`,
    ].join("\n");
    const r4 = await inbound(app, phone, partial);
    expect(r4.statusCode).toBe(200);
    expect(r4.json().reply_text).toMatch(/nome|cliente/i);

    const r5 = await inbound(app, phone, "Tomador Homologacao");
    expect(r5.statusCode).toBe(200);
    expect(r5.json().reply_text).toMatch(/confirmar|resumo/i);

    const r6 = await inbound(app, phone, "CONFIRMAR");
    expect(r6.statusCode).toBe(200);
    expect(r6.json().emitted).toBe(true);
    expect(r6.json().issue_id).toBeTruthy();

    const r7 = await inbound(app, phone, "bom dia");
    expect(r7.statusCode).toBe(200);
    expect(r7.json().reply_text).toMatch(/mesmos dados|última/i);

    await app.close();
  });

  it("FW-10: message_id duplicado persiste uma vez e retorna deduplicated", async () => {
    const app = await buildApp();
    const phone = `+55118${String(Date.now()).slice(-8)}`;
    const messageId = `dedup-${Date.now()}`;

    const first = await inbound(app, phone, "bom dia", { message_id: messageId });
    expect(first.statusCode).toBe(200);
    expect(first.json().deduplicated).toBeFalsy();

    const second = await inbound(app, phone, "bom dia", { message_id: messageId });
    expect(second.statusCode).toBe(200);
    expect(second.json().deduplicated).toBe(true);
    expect(second.json().send_reply).toBe(false);

    const { withTenant } = await import("../src/db/client.js");
    const rows = await withTenant(tenantId, (db) =>
      db<{ id: string }[]>`
        SELECT id FROM exeq_core.channel_message_log
        WHERE tenant_id = ${tenantId}::uuid
          AND message_id = ${messageId}
          AND direction = 'inbound'
      `,
    );
    expect(rows.length).toBe(1);

    await app.close();
  });

  it("FW-11: inbound multi-linha consolida saudação + intenção + data relativa", async () => {
    const app = await buildApp();
    const phone = `+55117${String(Date.now()).slice(-8)}`;
    const text = ["oi", "boa noite", "quero emitir nova nota", "com data para ontem"].join("\n");

    const res = await inbound(app, phone, text);
    expect(res.statusCode).toBe(200);
    expect(res.json().reply_text).toMatch(/perfeito|várias mensagens/i);
    expect(res.json().reply_text).not.toMatch(/Ainda faltam/i);
    expect(res.json().session_id).toBeTruthy();

    await app.close();
  });
});
