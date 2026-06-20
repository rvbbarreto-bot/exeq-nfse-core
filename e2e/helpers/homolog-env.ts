import { createHmac } from "node:crypto";

export const homologEnv = {
  apiBase: process.env.API_URL ?? process.env.E2E_API_BASE ?? "http://127.0.0.1:3002",
  adminBase: process.env.ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:5173",
  email: process.env.SMOKE_EMAIL ?? "admin@piloto.local",
  password: process.env.SMOKE_PASSWORD ?? "changeme",
  tenantSlug: process.env.TENANT_SLUG ?? "piloto-sp",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "sandbox-webhook-secret-piloto",
};

export async function apiLogin(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post(`${homologEnv.apiBase}/v1/auth/login`, {
    data: { email: homologEnv.email, password: homologEnv.password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed: HTTP ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export async function createRegisteredCharge(
  request: import("@playwright/test").APIRequestContext,
  token: string,
) {
  let customers = await request.get(`${homologEnv.apiBase}/v1/customers?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  let custJson = (await customers.json()) as { items: { id: string }[] };
  let customerId = custJson.items?.[0]?.id;

  if (!customerId) {
    const createCustomer = await request.post(`${homologEnv.apiBase}/v1/customers`, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      data: { document: "52998224725", name: "Tomador Homologacao E2E" },
    });
    if (!createCustomer.ok()) {
      throw new Error(
        `POST /v1/customers failed: HTTP ${createCustomer.status()} ${await createCustomer.text()}`,
      );
    }
    customerId = ((await createCustomer.json()) as { id: string }).id;
  }

  if (!customerId) throw new Error("Nenhum tomador — rode npm run db:seed");

  const idempotency = `e2e-uat17-${Date.now()}`;
  const create = await request.post(`${homologEnv.apiBase}/v1/charges`, {
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    data: {
      idempotency_key: idempotency,
      customer_id: customerId,
      amount_cents: 250_000,
      due_date: "2026-12-15",
      description: "E2E homolog Sprint 9",
    },
  });
  if (!create.ok()) {
    throw new Error(`POST /v1/charges failed: HTTP ${create.status()} ${await create.text()}`);
  }
  const charge = (await create.json()) as {
    id: string;
    status: string;
    gateway_ref?: string | null;
    amount_cents?: number;
  };
  return { ...charge, amount_cents: charge.amount_cents ?? 250_000 };
}

export async function ensureEmissionMasterData(
  request: import("@playwright/test").APIRequestContext,
  token: string,
) {
  const auth = { authorization: `Bearer ${token}` };
  const headers = { ...auth, "content-type": "application/json" };

  const providerRes = await request.post(`${homologEnv.apiBase}/v1/providers`, {
    headers,
    data: {
      document: "11222333000181",
      legal_name: "Prestador Piloto E2E",
      tax_regime: "simples_nacional",
      municipal_registration: "12345",
    },
  });
  let providerId =
    providerRes.ok() ? ((await providerRes.json()) as { id: string }).id : undefined;
  if (!providerId) {
    const list = await request.get(`${homologEnv.apiBase}/v1/providers`, { headers: auth });
    providerId = ((await list.json()) as { items: { id: string }[] }).items[0]?.id;
  }

  const customerRes = await request.post(`${homologEnv.apiBase}/v1/customers`, {
    headers,
    data: { document: "52998224725", name: "Tomador Homologacao E2E" },
  });
  let customerId =
    customerRes.ok() ? ((await customerRes.json()) as { id: string }).id : undefined;
  if (!customerId) {
    const list = await request.get(`${homologEnv.apiBase}/v1/customers?limit=1`, { headers: auth });
    customerId = ((await list.json()) as { items: { id: string }[] }).items[0]?.id;
  }

  const serviceRes = await request.post(`${homologEnv.apiBase}/v1/services`, {
    headers,
    data: {
      service_code: "1.01",
      description: "Analise e desenvolvimento de sistemas",
      lc116_item: "1.01",
    },
  });
  let serviceId =
    serviceRes.ok() ? ((await serviceRes.json()) as { id: string }).id : undefined;
  if (!serviceId) {
    const list = await request.get(`${homologEnv.apiBase}/v1/services`, { headers: auth });
    const items = ((await list.json()) as { items: { id: string; service_code: string }[] }).items;
    serviceId =
      items.find((s) => s.service_code === "1.01")?.id ?? items[0]?.id;
  }

  if (!providerId || !customerId || !serviceId) {
    throw new Error("Master data emissão incompleto — rode db:seed");
  }
  return { providerId, customerId, serviceId };
}

/** Emissão autorizada em município do escopo operacional PO (3 H3). */
export async function createAuthorizedPilotIssue(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  ibgeCode = "3504107",
  municipioLabel = "Atibaia",
) {
  const md = await ensureEmissionMasterData(request, token);
  const res = await request.post(`${homologEnv.apiBase}/v1/nf/issues`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: {
      idempotency_key: `e2e-pilot-${ibgeCode}-${Date.now()}`,
      provider_id: md.providerId,
      customer_id: md.customerId,
      service_id: md.serviceId,
      ibge_code: ibgeCode,
      competence_date: "2026-06-01",
      amount_cents: 150_000,
      description: `E2E emissão ${municipioLabel}`,
    },
  });
  if (!res.ok()) {
    throw new Error(`POST /v1/nf/issues failed: HTTP ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { issue_id: string; status: string };
  return body;
}

/** @deprecated Escopo PO = 3 municípios; use createAuthorizedPilotIssue */
export async function createAuthorizedBarueriIssue(
  request: import("@playwright/test").APIRequestContext,
  token: string,
) {
  return createAuthorizedPilotIssue(request, token, "3504107", "Atibaia");
}

export async function webhookPaymentPaid(
  request: import("@playwright/test").APIRequestContext,
  chargeId: string,
  amountCents: number,
) {
  const payload = {
    idempotency_key: `e2e-uat19-wh-${Date.now()}`,
    event: "payment.paid",
    charge_id: chargeId,
    amount_cents: amountCents,
    paid_at: new Date().toISOString(),
    gateway_ref: "gw-e2e-uat19",
  };
  const rawBody = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", homologEnv.webhookSecret)
    .update(rawBody, "utf8")
    .digest("hex")}`;

  const res = await request.post(
    `${homologEnv.apiBase}/v1/webhooks/gateway/${homologEnv.tenantSlug}`,
    {
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": signature,
      },
      data: rawBody,
    },
  );
  if (res.status() !== 202) {
    throw new Error(`webhook payment.paid failed: HTTP ${res.status()} ${await res.text()}`);
  }
  return res.json();
}
