/** Teto PO fábrica/homolog — proibido emitir NFS-e acima de R$ 4,00 em testes. */
export const FACTORY_MAX_NF_AMOUNT_CENTS = 400;

export class FactoryNfAmountCapExceededError extends Error {
  constructor(
    readonly amountCents: number,
    readonly maxCents: number = FACTORY_MAX_NF_AMOUNT_CENTS,
  ) {
    super(`FACTORY_NF_AMOUNT_CAP_EXCEEDED:${amountCents}>${maxCents}`);
    this.name = "FactoryNfAmountCapExceededError";
  }
}

export function assertFactoryNfAmountCap(
  amountCents: number,
  maxCents: number = FACTORY_MAX_NF_AMOUNT_CENTS,
): void {
  if (amountCents > maxCents) {
    throw new FactoryNfAmountCapExceededError(amountCents, maxCents);
  }
}

export function factoryNfAmountCapMessage(maxCents = FACTORY_MAX_NF_AMOUNT_CENTS): string {
  const reais = (maxCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return `Valor máximo para emissões de teste da fábrica: ${reais}. Proibido exceder.`;
}
