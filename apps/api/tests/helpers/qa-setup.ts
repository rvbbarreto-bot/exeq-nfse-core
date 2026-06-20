import { PILOT_MUNICIPIOS as SHARED_PILOT } from "@exeq/shared";
import { expect } from "vitest";
import type { buildApp } from "../src/app.js";
import { channelHeaders } from "./channel-setup.js";

/** Alinhado a `@exeq/shared` (3 municípios operacionais PO). */
export const PILOT_MUNICIPIOS = SHARED_PILOT.map((m) => ({
  code: m.ibge_code,
  label: m.label,
}));

export type QaMasterData = {
  token: string;
  tenantId: string;
  providerId: string;
  customerId: string;
  serviceId: string;
};

export function buildEmitPayload(
  md: Pick<QaMasterData, "providerId" | "customerId" | "serviceId">,
  ibgeCode: string,
  idempotencyKey: string,
  amountCents = 150000,
) {
  return {
    idempotency_key: idempotencyKey,
    provider_id: md.providerId,
    customer_id: md.customerId,
    service_id: md.serviceId,
    ibge_code: ibgeCode,
    competence_date: "2026-06-01",
    amount_cents: amountCents,
  };
}

export async function emitViaApi(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  payload: ReturnType<typeof buildEmitPayload>,
) {
  return app.inject({
    method: "POST",
    url: "/v1/nf/issues",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

export async function emitViaChannel(
  app: Awaited<ReturnType<typeof buildApp>>,
  md: Pick<QaMasterData, "providerId" | "customerId" | "serviceId">,
  ibgeCode: string,
  idempotencyKey: string,
  phone = "+5511999001122",
) {
  const create = await app.inject({
    method: "POST",
    url: "/v1/channel/sessions",
    headers: channelHeaders(),
    payload: { phone_e164: phone, idempotency_key: idempotencyKey },
  });
  const sessionId = create.json().session_id;
  await app.inject({
    method: "PATCH",
    url: `/v1/channel/sessions/${sessionId}`,
    headers: channelHeaders(),
    payload: {
      provider_id: md.providerId,
      customer_id: md.customerId,
      service_id: md.serviceId,
      ibge_code: ibgeCode,
      competence_date: "2026-06-01",
      amount_cents: 150000,
    },
  });
  return app.inject({
    method: "POST",
    url: `/v1/channel/sessions/${sessionId}/confirm`,
    headers: channelHeaders(),
  });
}

export async function runRegressionSmoke(
  app: Awaited<ReturnType<typeof buildApp>>,
  md: QaMasterData,
  prefix: string,
) {
  const ibge = PILOT_MUNICIPIOS[0]!.code;
  const emit = await emitViaApi(
    app,
    md.token,
    buildEmitPayload(md, ibge, `${prefix}-api-${Date.now()}`),
  );
  expect(emit.statusCode).toBe(202);
  expect(emit.json().status).toBe("authorized");

  const stats = await app.inject({
    method: "GET",
    url: "/v1/nf/issues/stats",
    headers: { authorization: `Bearer ${md.token}` },
  });
  expect(stats.statusCode).toBe(200);
  expect(stats.json().total).toBeGreaterThan(0);

  const channel = await emitViaChannel(
    app,
    md,
    ibge,
    `${prefix}-channel-${Date.now()}`,
  );
  expect(channel.statusCode).toBe(202);
  expect(channel.json().status).toBe("authorized");

  return { apiIssueId: emit.json().issue_id, channelIssueId: channel.json().issue_id };
}
