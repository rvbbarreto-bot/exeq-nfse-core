import type { ExeqNfseV1 } from "@exeq/shared";
import type {
  INfseProvider,
  NfseCancelResult,
  NfseConsultResult,
  NfseProviderCredentials,
  NfseSubmitResult,
} from "../nfse-provider.types.js";
import { mapExeqNfseV1ToBethaRps } from "./betha-nfse.adapter.js";

/** Mock Betha para testes locais/CI quando BETHA_MOCK=true. */
export class MockBethaNfseProvider implements INfseProvider {
  readonly kind = "betha" as const;

  private readonly submits = new Map<string, ExeqNfseV1>();
  private readonly pollCounts = new Map<string, number>();
  private readonly cancelled = new Set<string>();

  async submit(
    externalRef: string,
    payload: ExeqNfseV1,
    _credentials: NfseProviderCredentials,
  ): Promise<NfseSubmitResult> {
    mapExeqNfseV1ToBethaRps(payload, externalRef);
    this.submits.set(externalRef, payload);
    this.pollCounts.set(externalRef, 0);
    return { externalRef, status: "processing", raw: { status: "processando" } };
  }

  async consult(externalRef: string, _credentials: NfseProviderCredentials): Promise<NfseConsultResult> {
    if (!this.submits.has(externalRef)) {
      throw new Error(`BETHA_REF_NOT_FOUND:${externalRef}`);
    }
    if (this.cancelled.has(externalRef)) {
      return { status: "cancelled", raw: { status: "cancelado" } };
    }
    const count = (this.pollCounts.get(externalRef) ?? 0) + 1;
    this.pollCounts.set(externalRef, count);
    if (externalRef.includes("reject")) {
      return {
        status: "rejected",
        erros: [{ codigo: "B001", mensagem: "RPS rejeitado (mock)" }],
        raw: { status: "rejeitado" },
      };
    }
    if (count < 2) {
      return { status: "processing", raw: { status: "processando" } };
    }
    return {
      status: "authorized",
      numero_nfse: "BETHA-MOCK-0001",
      codigo_verificacao: "MOCK-BETHA-VERIFY",
      raw: { status: "autorizado" },
    };
  }

  async cancel(
    externalRef: string,
    _justificativa: string,
    _credentials: NfseProviderCredentials,
  ): Promise<NfseCancelResult> {
    if (!this.submits.has(externalRef)) throw new Error(`BETHA_REF_NOT_FOUND:${externalRef}`);
    this.cancelled.add(externalRef);
    return { status: "cancelled", raw: { status: "cancelado" } };
  }
}
