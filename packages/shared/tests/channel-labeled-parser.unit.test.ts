import { describe, expect, it } from "vitest";
import {
  buildV11aConfirmationReply,
  extractLabeledChannelFields,
  getMissingTomadorAddressFields,
  getMissingV11aFields,
  parseAmountCentsFromLabel,
} from "../src/channel-labeled-parser.js";

const PO_SAMPLE = `Nome do cliente: MARIA BEATRIZ DUARTE MONTEIRO DE OLIVEIRA
Documento: 54.955.991/0001-95
Valor: 2,11
Descrição: Nota fiscal referente a serviços prestados configuração de equipamentos de programas de informática em Março/2026
Data da prestação: 24/04/2026
Código do serviço: 01.07.01
Código do município da prestação: 3505708
Email do tomador: riicardo84@hotmail.com
Logradouro do tomador: Rua Anapolis
Número do tomador: 100
Complemento do tomador: Complemento CONJ 05 PAVMTO7 EDIF N B C
Bairro do tomador: VILA NILVA
CEP do tomador: 06404250
Código do município do tomador: 3505708`;

describe("channel-labeled-parser V11A", () => {
  it("extrai bloco rotulado do PO", () => {
    const f = extractLabeledChannelFields(PO_SAMPLE);
    expect(f.tomador_name).toContain("MARIA BEATRIZ");
    expect(f.tomador_document).toBe("54.955.991/0001-95");
    expect(f.amount_label).toBe("2,11");
    expect(f.ibge_code).toBe("3505708");
    expect(f.service_code).toBe("01.07.01");
    expect(f.tomador_email).toBe("riicardo84@hotmail.com");
    expect(getMissingV11aFields(f)).toHaveLength(0);
    expect(getMissingTomadorAddressFields(f)).toHaveLength(0);
  });

  it("parse valor BR", () => {
    expect(parseAmountCentsFromLabel("2,11")).toBe(211);
    expect(parseAmountCentsFromLabel("R$ 2,11")).toBe(211);
    expect(parseAmountCentsFromLabel("R$ 1.200,00")).toBe(120000);
  });

  it("monta resumo confirmacao V11A", () => {
    const f = extractLabeledChannelFields(PO_SAMPLE);
    const msg = buildV11aConfirmationReply(f);
    expect(msg).toContain("MARIA BEATRIZ");
    expect(msg).toContain("54.955.991/0001-95");
    expect(msg).toContain("CONFIRMAR");
  });

  it("aceita nome da cidade do tomador sem codigo IBGE", () => {
    const f = extractLabeledChannelFields(
      "Logradouro do tomador: Rua A\nNumero do tomador: 10\nBairro do tomador: Centro\nCEP do tomador: 12940000\nCidade do tomador: Atibaia",
    );
    expect(getMissingTomadorAddressFields(f)).toHaveLength(0);
  });

  it("nao exige IBGE quando cliente informa Atibaia", () => {
    expect(getMissingTomadorAddressFields({ tomador_city_ibge: "Atibaia" })).not.toContain(
      "tomador_city_ibge",
    );
  });
});
