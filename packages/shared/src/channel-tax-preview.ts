export type ChannelTaxPreviewSummary = {
  engine: "iss_legacy" | "hybrid" | "ibs_cbs_v1";
  iss_amount_cents: number;
  ibs_amount_cents?: number;
  cbs_amount_cents?: number;
  ready: boolean;
};

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildChannelTaxPreviewSuffix(summary: ChannelTaxPreviewSummary): string {
  const lines = [
    "",
    "*Prévia tributária (sandbox):*",
    `• ISS: R$ ${formatBrl(summary.iss_amount_cents)}`,
  ];

  if (summary.ibs_amount_cents != null && summary.ibs_amount_cents > 0) {
    lines.push(`• IBS (transição): R$ ${formatBrl(summary.ibs_amount_cents)}`);
  }
  if (summary.cbs_amount_cents != null && summary.cbs_amount_cents > 0) {
    lines.push(`• CBS (transição): R$ ${formatBrl(summary.cbs_amount_cents)}`);
  }

  if (summary.engine === "hybrid") {
    lines.push("_Valores de transição LC 214 — referência interna._");
  }

  return lines.join("\n");
}

export function buildChannelTaxPreviewBlockedReply(reason: string): string {
  return (
    `Não consegui validar os tributos desta NFS-e:\n${reason}\n\n` +
    `Revise os dados (serviço, cidade, valor) ou fale com seu contador.`
  );
}

export function appendTaxPreviewToConfirmation(
  confirmationReply: string,
  summary: ChannelTaxPreviewSummary,
): string {
  const suffix = buildChannelTaxPreviewSuffix(summary);
  const confirmLine = "Se estiver tudo certo, responda CONFIRMAR.";
  if (confirmationReply.includes(confirmLine)) {
    return confirmationReply.replace(confirmLine, `${suffix}\n\n${confirmLine}`);
  }
  return `${confirmationReply}${suffix}\n\nResponda *CONFIRMAR* para emitir.`;
}
