import type {
  FocusCancelResponse,
  FocusClient,
  FocusConsultResponse,
  FocusNfsenSubmitPayload,
  FocusSubmitResponse,
} from "./focus-nfsen.adapter.js";

export type { FocusClient } from "./focus-nfsen.adapter.js";
import { env } from "../../../config/env.js";
import { mapFocusHttpError } from "./focus-error-mapper.js";

export class HttpFocusClient implements FocusClient {
  private authHeader(token: string): string {
    return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
  }

  async submitNfsen(
    token: string,
    ref: string,
    payload: FocusNfsenSubmitPayload,
  ): Promise<FocusSubmitResponse> {
    const url = `${env.FOCUS_BASE_URL}/v2/nfsen?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const op = mapFocusHttpError(res.status, raw);
      throw new Error(`${op.code}:${op.detail}`);
    }
    return {
      ref,
      status: (raw as { status?: string }).status ?? "processando",
      raw,
    };
  }

  async consultNfsen(token: string, ref: string): Promise<FocusConsultResponse> {
    const url = `${env.FOCUS_BASE_URL}/v2/nfsen/${encodeURIComponent(ref)}`;
    const res = await fetch(url, {
      headers: { Authorization: this.authHeader(token) },
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const op = mapFocusHttpError(res.status, raw);
      throw new Error(`${op.code}:${op.detail}`);
    }
    const body = raw as {
      status?: string;
      numero?: string;
      codigo_verificacao?: string;
      erros?: { codigo?: string; mensagem?: string }[];
    };
    return {
      status: body.status ?? "processando",
      numero_nfse: body.numero,
      codigo_verificacao: body.codigo_verificacao,
      erros: body.erros,
      raw,
    };
  }

  async cancelNfsen(token: string, ref: string, justificativa: string): Promise<FocusCancelResponse> {
    const url = `${env.FOCUS_BASE_URL}/v2/nfsen/${encodeURIComponent(ref)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: this.authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ justificativa }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const op = mapFocusHttpError(res.status, raw);
      throw new Error(`${op.code}:${op.detail}`);
    }
    return {
      status: (raw as { status?: string }).status ?? "cancelado",
      raw,
    };
  }
}

/** Mock basico (Fase 4). */
export class MockFocusClient implements FocusClient {
  private readonly submits = new Map<string, FocusNfsenSubmitPayload>();
  private readonly pollCounts = new Map<string, number>();

  async submitNfsen(
    _token: string,
    ref: string,
    payload: FocusNfsenSubmitPayload,
  ): Promise<FocusSubmitResponse> {
    this.submits.set(ref, payload);
    this.pollCounts.set(ref, 0);
    return { ref, status: "processando", raw: { status: "processando" } };
  }

  async consultNfsen(_token: string, ref: string): Promise<FocusConsultResponse> {
    if (!this.submits.has(ref)) {
      throw new Error(`FOCUS_REF_NOT_FOUND:${ref}`);
    }
    const count = (this.pollCounts.get(ref) ?? 0) + 1;
    this.pollCounts.set(ref, count);
    if (ref.includes("reject")) {
      return {
        status: "erro_autorizacao",
        erros: [{ codigo: "E001", mensagem: "Codigo servico invalido para municipio" }],
        raw: { status: "erro_autorizacao" },
      };
    }
    if (count < 2) {
      return { status: "processando", raw: { status: "processando" } };
    }
    return {
      status: "autorizado",
      numero_nfse: "2026000000123",
      codigo_verificacao: "MOCK-VERIFY-ABC",
      raw: { status: "autorizado", numero: "2026000000123" },
    };
  }

  async cancelNfsen(_token: string, ref: string, _justificativa: string): Promise<FocusCancelResponse> {
    if (!this.submits.has(ref)) throw new Error(`FOCUS_REF_NOT_FOUND:${ref}`);
    return { status: "cancelado", raw: { status: "cancelado" } };
  }
}

/** Simula sandbox homologado para municipios piloto SP (Fase 5). */
export class HomologSandboxFocusClient extends MockFocusClient {
  private readonly cancelled = new Set<string>();

  override async consultNfsen(token: string, ref: string): Promise<FocusConsultResponse> {
    if (this.cancelled.has(ref)) {
      return { status: "cancelado", raw: { status: "cancelado" } };
    }
    return super.consultNfsen(token, ref);
  }

  override async cancelNfsen(token: string, ref: string, justificativa: string): Promise<FocusCancelResponse> {
    const res = await super.cancelNfsen(token, ref, justificativa);
    this.cancelled.add(ref);
    return res;
  }
}

let focusClientSingleton: FocusClient | null = null;

export function getFocusClient(): FocusClient {
  if (!focusClientSingleton) {
    if (env.FOCUS_MOCK) {
      focusClientSingleton = env.FOCUS_HOMOLOG_MOCK
        ? new HomologSandboxFocusClient()
        : new MockFocusClient();
    } else {
      focusClientSingleton = new HttpFocusClient();
    }
  }
  return focusClientSingleton;
}

export function setFocusClient(client: FocusClient | null): void {
  focusClientSingleton = client;
}
