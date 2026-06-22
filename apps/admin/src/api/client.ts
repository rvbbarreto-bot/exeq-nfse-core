import type { EmitDasGuiaInput, GuiaFiscalResponse } from "@exeq/shared";

const API_BASE = "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type") && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export type LoginResponse = {
  access_token: string;
  token_type: string;
  tenant_id: string;
  user: { id: string; email: string; name: string };
};

export type Catalog = {
  id: string;
  version: number;
  status: string;
  published_at: string | null;
  publish_checklist?: {
    csv_validated: boolean;
    rules_reviewed: boolean;
    validado_contador: boolean;
    terms_accepted: boolean;
  };
  created_at: string;
};

export type TaxRule = {
  id: string;
  ibge_code: string;
  municipio_nome: string;
  uf: string;
  service_code: string;
  service_description: string;
  tax_regime: string;
  iss_rate: string | number;
  iss_retained: boolean;
};

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  },

  listCatalogs(token: string) {
    return request<{ items: Catalog[] }>("/v1/fiscal/catalogs", { token });
  },

  createDraftCatalog(token: string) {
    return request<Catalog>("/v1/fiscal/catalogs", { method: "POST", token });
  },

  getCatalog(token: string, id: string) {
    return request<Catalog>(`/v1/fiscal/catalogs/${id}`, { token });
  },

  listRules(token: string, catalogId: string) {
    return request<{ items: TaxRule[] }>(`/v1/fiscal/catalogs/${catalogId}/rules`, { token });
  },

  publishCatalog(token: string, id: string) {
    return request<Catalog>(`/v1/fiscal/catalogs/${id}/publish`, { method: "POST", token });
  },

  getPublishChecklist(token: string, id: string) {
    return request<{ checklist: Catalog["publish_checklist"] }>(
      `/v1/fiscal/catalogs/${id}/publish-checklist`,
      { token },
    );
  },

  updatePublishChecklist(
    token: string,
    id: string,
    patch: Partial<NonNullable<Catalog["publish_checklist"]>>,
  ) {
    return request<{ checklist: Catalog["publish_checklist"] }>(
      `/v1/fiscal/catalogs/${id}/publish-checklist`,
      {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
  },

  importCsv(token: string, catalogId: string, csv: string) {
    return request<{
      imported: number;
      skipped: number;
      parse_errors: { line: number; message: string }[];
      map_errors: { line: number; message: string }[];
    }>(`/v1/fiscal/catalogs/${catalogId}/rules/import`, {
      method: "POST",
      token,
      body: csv,
    });
  },

  listIssues(token: string, query: Record<string, string> = {}) {
    const qs = new URLSearchParams(query).toString();
    const path = qs ? `/v1/nf/issues?${qs}` : "/v1/nf/issues";
    return request<{ items: NfIssueListItem[]; next_cursor: string | null }>(path, { token });
  },

  getIssueStats(token: string) {
    return request<NfIssueStats>("/v1/nf/issues/stats", { token });
  },

  getIssue(token: string, id: string) {
    return request<NfIssueDetail>(`/v1/nf/issues/${id}`, { token });
  },

  cancelIssue(token: string, id: string, justificativa: string) {
    return request<{ status: string; operator?: { detail: string } }>(
      `/v1/nf/issues/${id}/cancel`,
      {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa }),
      },
    );
  },

  reprocessIssue(token: string, id: string) {
    return request<{ issue_id: string; status: string }>(`/v1/nf/issues/${id}/reprocess`, {
      method: "POST",
      token,
    });
  },

  listCharges(token: string, query: Record<string, string> = {}) {
    const qs = new URLSearchParams(query).toString();
    const path = qs ? `/v1/charges?${qs}` : "/v1/charges";
    return request<{ items: ChargeListItem[]; next_cursor: string | null }>(path, { token });
  },

  getChargeStats(token: string) {
    return request<ChargeStats>("/v1/charges/stats", { token });
  },

  getOpsAlerts(token: string) {
    return request<OpsAlerts>("/v1/ops/alerts", { token });
  },

  getOpsSummary(token: string) {
    return request<OpsSummary>("/v1/ops/summary", { token });
  },

  listChannelSessions(token: string) {
    return request<{ items: ChannelSessionOpsItem[] }>("/v1/ops/channel/sessions", { token });
  },

  listChannelNotifications(token: string) {
    return request<{ items: ChannelNotificationOpsItem[] }>("/v1/ops/channel/notifications", {
      token,
    });
  },

  getHealth() {
    return request<HealthResponse>("/health");
  },

  getCharge(token: string, id: string) {
    return request<ChargeDetail>(`/v1/charges/${id}`, { token });
  },

  createCharge(
    token: string,
    body: {
      idempotency_key: string;
      customer_id: string;
      amount_cents: number;
      due_date: string;
      description?: string;
      nf_issue_id?: string;
    },
  ) {
    return request<{
      id: string;
      status: string;
      correlation_id: string;
      gateway_ref?: string;
      nf_issue_id?: string;
    }>("/v1/charges", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  cancelCharge(token: string, id: string) {
    return request<ChargeDetail>(`/v1/charges/${id}/cancel`, {
      method: "POST",
      token,
    });
  },

  listWebhookInbox(token: string, query: Record<string, string> = {}) {
    const qs = new URLSearchParams(query).toString();
    const path = qs ? `/v1/webhooks/inbox?${qs}` : "/v1/webhooks/inbox";
    return request<{ items: WebhookInboxListItem[]; next_cursor: string | null }>(path, { token });
  },

  getWebhookInbox(token: string, id: string) {
    return request<WebhookInboxDetail>(`/v1/webhooks/inbox/${id}`, { token });
  },

  reprocessWebhookInbox(token: string, id: string) {
    return request<{ inbox_id: string; status: string }>(`/v1/webhooks/inbox/${id}/reprocess`, {
      method: "POST",
      token,
    });
  },

  listProviders(token: string) {
    return request<{ items: ProviderListItem[] }>("/v1/providers", { token });
  },

  createProvider(
    token: string,
    body: {
      document: string;
      legal_name: string;
      tax_regime: string;
      municipal_registration?: string;
    },
  ) {
    return request<ProviderListItem>("/v1/providers", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  listCustomers(token: string) {
    return request<{ items: CustomerListItem[] }>("/v1/customers", { token });
  },

  createCustomer(
    token: string,
    body: { document: string; name: string; email?: string },
  ) {
    return request<CustomerListItem>("/v1/customers", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  listServices(token: string) {
    return request<{ items: ServiceListItem[] }>("/v1/services", { token });
  },

  createService(
    token: string,
    body: { service_code: string; description: string; lc116_item?: string },
  ) {
    return request<ServiceListItem>("/v1/services", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  listDasGuias(token: string, query: Record<string, string> = {}) {
    const qs = new URLSearchParams(query).toString();
    const path = qs ? `/v1/das/guias?${qs}` : "/v1/das/guias";
    return request<{ guias: GuiaFiscalResponse[]; next_cursor: string | null }>(path, { token });
  },

  getDasGuia(token: string, id: string) {
    return request<{ guia: GuiaFiscalResponse }>(`/v1/das/guias/${id}`, { token });
  },

  emitDasGuia(token: string, body: EmitDasGuiaInput) {
    return request<{ guia: GuiaFiscalResponse; deduplicated?: boolean }>("/v1/das/emitir", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  backfillTaxSnapshots(
    token: string,
    body: { days?: number; limit?: number; dry_run?: boolean },
  ) {
    return request<{
      tenant_id: string;
      tenant_slug?: string;
      days: number;
      candidates: number;
      created: number;
      skipped: number;
      errors: number;
      dry_run: boolean;
    }>("/v1/fiscal/admin/backfill-snapshots", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
};

export type NfIssueListItem = {
  id: string;
  status: string;
  ibge_code: string;
  competence_date: string;
  amount_cents: number;
  focus_ref: string | null;
  created_at: string;
};

export type NfIssueEvent = {
  id: number;
  from_status: string | null;
  to_status: string;
  actor: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};

export type NfIssueDetail = NfIssueListItem & {
  idempotency_key: string;
  provider_id: string;
  customer_id: string;
  service_id: string;
  resolved_rule_id: string | null;
  correlation_id: string;
  events: NfIssueEvent[];
};

export type NfIssueStats = {
  total: number;
  by_status: Record<string, number>;
  last_7_days: number;
  pilot_municipios: { ibge_code: string; label: string; count: number }[];
};

export type ChargeListItem = {
  id: string;
  status: string;
  idempotency_key: string;
  customer_id: string;
  amount_cents: number;
  due_date: string;
  description: string | null;
  gateway_ref: string | null;
  nf_issue_id: string | null;
  correlation_id: string;
  created_at: string;
};

export type ChargePaymentEvent = {
  id: string;
  amount_cents: number;
  paid_at: string;
  gateway_ref: string | null;
  webhook_inbox_id: string | null;
  created_at: string;
};

export type ChargeDetail = ChargeListItem & {
  gateway_mode?: "mock" | "http" | null;
  gateway_sandbox_url?: string | null;
  payment_events: ChargePaymentEvent[];
};

export type ChargeStats = {
  total: number;
  pending: number;
  paid_last_7_days: number;
  failed_last_7_days: number;
};

export type OpsAlerts = {
  issues_failed: number;
  issues_queued: number;
  webhooks_failed: number;
  charges_pending: number;
  charges_registered: number;
};

export type OpsSummary = {
  alerts: OpsAlerts;
  issue_stats: NfIssueStats;
  charge_stats: ChargeStats;
};

export type HealthResponse = {
  status: string;
  service: string;
  phase: string;
  gateway: {
    mock: boolean;
    base_url: string;
    sync_processing: boolean;
  };
};

export type WebhookInboxListItem = {
  id: string;
  status: string;
  idempotency_key: string;
  error_message: string | null;
  charge_id: string | null;
  created_at: string;
  processed_at: string | null;
};

export type WebhookInboxDetail = {
  id: string;
  status: string;
  idempotency_key: string;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
};

export type ProviderListItem = {
  id: string;
  document: string;
  legal_name: string;
  tax_regime: string;
  municipal_registration: string | null;
  is_active: boolean;
};

export type CustomerListItem = {
  id: string;
  document: string;
  name: string;
  email: string | null;
  is_active: boolean;
};

export type ServiceListItem = {
  id: string;
  service_code: string;
  description: string;
  lc116_item: string | null;
  is_active: boolean;
};

export type ChannelSessionOpsItem = {
  id: string;
  status: string;
  phone_e164: string;
  idempotency_key: string;
  nf_issue_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelNotificationOpsItem = {
  id: string;
  status: string;
  phone_e164: string;
  event_type: string;
  nf_issue_id: string | null;
  session_id: string | null;
  message_preview: string;
  created_at: string;
  sent_at: string | null;
};
