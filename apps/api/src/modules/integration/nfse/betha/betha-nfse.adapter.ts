import type { ExeqNfseV1 } from "@exeq/shared";

/**
 * Mapeia exeq.nfse.v1 → XML ABRASF/Betha (skeleton).
 * Pendência: WSDL oficial Atibaia/SP + layout versão do município.
 */
export type BethaRpsPayload = {
  /** Placeholder — estrutura real virá da documentação Betha/ABRASF do município. */
  rps: {
    numero: string;
    serie: string;
    tipo: number;
    data_emissao: string;
    competencia: string;
    prestador_cnpj: string;
    tomador_documento: string;
    codigo_servico: string;
    valor_servicos: number;
    iss_retido: boolean;
    aliquota_iss: number;
  };
};

export function mapExeqNfseV1ToBethaRps(dto: ExeqNfseV1, rpsNumero: string): BethaRpsPayload {
  return {
    rps: {
      numero: rpsNumero,
      serie: "1",
      tipo: 1,
      data_emissao: `${dto.servico.competencia}T12:00:00`,
      competencia: dto.servico.competencia,
      prestador_cnpj: dto.prestador.cnpj,
      tomador_documento: dto.tomador.documento.replace(/\D/g, ""),
      codigo_servico: dto.servico.codigo,
      valor_servicos: dto.servico.valor_servico_cents / 100,
      iss_retido: dto.tributacao.iss_retido,
      aliquota_iss: dto.tributacao.iss_aliquota,
    },
  };
}
