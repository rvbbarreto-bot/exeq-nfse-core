import type { APIRequestContext } from "@playwright/test";
import { apiLogin, ensureEmissionMasterData, homologEnv } from "./homolog-env.js";

export type DasGuiaApi = {
  id: string;
  competencia: string;
  tipo_guia: string;
  status: string;
  valor_total: number;
  linha_digitavel: string | null;
};

function uniqueCompetencia(): string {
  const tick = Date.now();
  const year = 2020 + (tick % 50);
  const month = String((Math.floor(tick / 1000) % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function emitDasGuiaViaApi(
  request: APIRequestContext,
  token?: string,
): Promise<{ guia: DasGuiaApi; token: string }> {
  const authToken = token ?? (await apiLogin(request));
  const md = await ensureEmissionMasterData(request, authToken);
  const competencia = uniqueCompetencia();
  const idempotencyKey = `e2e-das-${Date.now()}`;

  const res = await request.post(`${homologEnv.apiBase}/v1/das/emitir`, {
    headers: {
      authorization: `Bearer ${authToken}`,
      "content-type": "application/json",
    },
    data: {
      provider_id: md.providerId,
      tipo_guia: "DAS",
      competencia,
      idempotency_key: idempotencyKey,
    },
  });

  if (!res.ok()) {
    throw new Error(`POST /v1/das/emitir failed: HTTP ${res.status()} ${await res.text()}`);
  }

  const body = (await res.json()) as { guia: DasGuiaApi };
  return { guia: body.guia, token: authToken };
}

export async function listDasGuiasViaApi(request: APIRequestContext, token: string) {
  const res = await request.get(`${homologEnv.apiBase}/v1/das/guias?limit=10`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`GET /v1/das/guias failed: HTTP ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { guias: DasGuiaApi[]; count: number };
}
