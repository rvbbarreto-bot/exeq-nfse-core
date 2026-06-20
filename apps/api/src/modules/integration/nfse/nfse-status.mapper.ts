import type { NfseExternalStatus } from "@exeq/shared";

const FOCUS_TO_EXTERNAL: Record<string, NfseExternalStatus> = {
  processando: "processing",
  processando_autorizacao: "processing",
  autorizado: "authorized",
  erro_autorizacao: "rejected",
  denegado: "rejected",
  rejeitado: "rejected",
  cancelado: "cancelled",
};

const BETHA_TO_EXTERNAL: Record<string, NfseExternalStatus> = {
  processando: "processing",
  autorizado: "authorized",
  rejeitado: "rejected",
  cancelado: "cancelled",
  "processado com sucesso": "authorized",
  "processado com erro": "rejected",
  "aguardando validação do ambiente nacional": "processing",
};

export function mapProviderStatusToExternal(
  providerKind: string,
  status: string,
): NfseExternalStatus | string {
  const key = status.toLowerCase();
  if (providerKind === "betha") {
    return BETHA_TO_EXTERNAL[key] ?? status;
  }
  return FOCUS_TO_EXTERNAL[key] ?? status;
}

export function isTerminalExternalStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return [
    "authorized",
    "autorizado",
    "rejected",
    "erro_autorizacao",
    "denegado",
    "rejeitado",
    "cancelled",
    "cancelado",
    "failed",
    "processado com sucesso",
    "processado com erro",
  ].includes(normalized);
}

export function mapExternalStatusToIssueStatus(
  status: string,
): "authorized" | "rejected" | "cancelled" | "polling" | null {
  const n = status.toLowerCase();
  if (n === "authorized" || n === "autorizado" || n.includes("processado com sucesso")) {
    return "authorized";
  }
  if (
    ["rejected", "erro_autorizacao", "denegado", "rejeitado"].includes(n) ||
    n.includes("processado com erro")
  ) {
    return "rejected";
  }
  if (n === "cancelled" || n === "cancelado") return "cancelled";
  if (["processing", "processando", "processando_autorizacao"].includes(n)) return "polling";
  if (n.includes("aguardando validação")) return "polling";
  return null;
}
