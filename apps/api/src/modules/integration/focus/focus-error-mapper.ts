/** Mensagens operador-friendly para erros Focus / pré-validação. */
const FOCUS_STATUS_MESSAGES: Record<string, string> = {
  erro_autorizacao: "Prefeitura rejeitou a NFS-e. Revise dados do tomador e codigo de servico.",
  denegado: "Emissao denegada pela prefeitura. Contate o contador.",
  rejeitado: "Documento rejeitado. Verifique campos obrigatorios do layout nfsen.",
  rejected: "Prefeitura rejeitou a NFS-e. Revise dados do tomador e codigo de servico.",
  cancelado: "NFS-e cancelada com sucesso na prefeitura.",
  cancelled: "NFS-e cancelada com sucesso na prefeitura.",
  processando: "Aguardando retorno da prefeitura (Focus).",
  processing: "Aguardando retorno da prefeitura (Focus).",
  autorizado: "NFS-e autorizada.",
  authorized: "NFS-e autorizada.",
};

const PREVALIDATE_MESSAGES: Record<string, string> = {
  CNPJ_INVALIDO: "CNPJ do prestador invalido. Corrija no cadastro do prestador.",
  MUNICIPIO_NAO_HOMOLOGADO:
    "Municipio ainda nao homologado neste ambiente. Use Atibaia, Braganca Paulista ou Mairipora.",
  VALOR_INVALIDO: "Valor do servico deve ser maior que zero.",
  ALIQUOTA_ISS_INVALIDA: "Aliquota ISS fora do intervalo permitido (0-100%).",
  SIMPLES_CODIGO_OBRIGATORIO:
    "Prestador Simples Nacional exige codigo de tributacao (1, 2 ou 3) na regra fiscal.",
  DOCUMENTO_TOMADOR_INVALIDO: "CPF/CNPJ do tomador invalido.",
  DESCRICAO_OBRIGATORIA: "Descricao/discriminacao do servico obrigatoria.",
};

export type OperatorMessage = {
  code: string;
  title: string;
  detail: string;
  action: string;
};

export function mapFocusStatusToOperatorMessage(status: string): OperatorMessage {
  const key = status.toLowerCase();
  const detail = FOCUS_STATUS_MESSAGES[key] ?? `Status Focus: ${status}`;
  const isAuthorized = key === "autorizado" || key === "authorized";
  const isCancelled = key === "cancelado" || key === "cancelled";
  return {
    code: `FOCUS_STATUS_${key.toUpperCase()}`,
    title: isAuthorized ? "Autorizada" : isCancelled ? "Cancelada" : "Atencao",
    detail,
    action:
      isAuthorized || isCancelled
        ? "Nenhuma acao necessaria."
        : "Revise o cadastro e tente reprocessar ou contate o contador.",
  };
}

export function mapPrevalidateCodeToOperatorMessage(code: string): OperatorMessage {
  const detail = PREVALIDATE_MESSAGES[code] ?? `Validacao Focus: ${code}`;
  return {
    code,
    title: "Validacao antes do envio",
    detail,
    action: "Corrija os campos indicados e emita novamente.",
  };
}

export function mapFocusHttpError(status: number, body?: unknown): OperatorMessage {
  const raw = typeof body === "object" && body !== null ? (body as { mensagem?: string }) : {};
  return {
    code: `FOCUS_HTTP_${status}`,
    title: "Erro na comunicacao Focus",
    detail: raw.mensagem ?? `Focus retornou HTTP ${status}. Tente novamente ou verifique token sandbox.`,
    action: "Verifique credenciais Focus no vault e status do sandbox.",
  };
}
