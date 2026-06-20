import type { OperatorMessage } from "../focus/focus-error-mapper.js";

export function mapGatewayHttpError(status: number, body?: unknown): OperatorMessage {
  const raw =
    typeof body === "object" && body !== null
      ? (body as { message?: string; mensagem?: string })
      : {};
  const detail =
    raw.message ?? raw.mensagem ?? `Gateway retornou HTTP ${status}. Tente novamente.`;
  return {
    code: `GATEWAY_HTTP_${status}`,
    title: "Erro no gateway de cobrança",
    detail,
    action: "Verifique gateway_key no vault e status do sandbox.",
  };
}

export function mapGatewayTransportError(cause: unknown): OperatorMessage {
  const detail = cause instanceof Error ? cause.message : "Falha de rede ao contatar o gateway.";
  return {
    code: "GATEWAY_TIMEOUT",
    title: "Gateway indisponível",
    detail,
    action: "Aguarde e tente criar a cobrança novamente. Se persistir, acione TI.",
  };
}

export function mapGatewayCredentialError(): OperatorMessage {
  return {
    code: "GATEWAY_CREDENTIAL_MISSING",
    title: "Credencial do gateway ausente",
    detail: "Nenhuma gateway_key configurada para este tenant.",
    action: "Cadastre a chave sandbox no secret_vault (runbook de rotação).",
  };
}
