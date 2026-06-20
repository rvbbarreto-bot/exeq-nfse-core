import type { OperatorMessage } from "../nfse-error-mapper.js";

const BETHA_STATUS_MESSAGES: Record<string, string> = {
  processando: "Aguardando retorno da prefeitura (Betha).",
  autorizado: "NFS-e autorizada.",
  rejeitado: "Prefeitura rejeitou a NFS-e via Betha. Revise cadastro e codigo de servico.",
  cancelado: "NFS-e cancelada com sucesso na prefeitura.",
};

export function mapBethaDpsListaMensagemToOperator(
  codigo: string,
  mensagem?: string,
  correcao?: string,
): OperatorMessage {
  const detail = [mensagem, correcao].filter(Boolean).join(" — ") || codigo;
  const action =
    codigo === "L12"
      ? "Confirme habilitação webservice DPS no portal Betha e cadastro no Emissor Nacional (nfse.gov.br). Se persistir, contate a prefeitura."
      : "Revise o cadastro e tente reprocessar ou contate o contador.";
  return {
    code: `BETHA_${codigo}`,
    title: `Betha ${codigo}`,
    detail,
    action,
  };
}

export function mapBethaStatusToOperatorMessage(status: string): OperatorMessage {
  const key = status.toLowerCase();
  const detail = BETHA_STATUS_MESSAGES[key] ?? `Status Betha: ${status}`;
  return {
    code: `BETHA_STATUS_${key.toUpperCase()}`,
    title: key === "autorizado" ? "Autorizada" : key === "cancelado" ? "Cancelada" : "Atencao",
    detail,
    action:
      key === "autorizado" || key === "cancelado"
        ? "Nenhuma acao necessaria."
        : "Revise o cadastro e tente reprocessar ou contate o contador.",
  };
}
