import { describe, expect, it } from "vitest";
import {
  buildInfDpsId,
  formatBethaDhEmi,
  mapExeqNfseV1ToBethaDps,
} from "./betha-dps.adapter.js";
import { buildBethaDpsUnsignedXml, extractBethaDpsListaMensagem, extractXmlTag } from "./betha-dps-xml.builder.js";

const sampleDto = {
  schema_version: "exeq.nfse.v1" as const,
  prestador: {
    cnpj: "37229907000137",
    razao_social: "EXEQ TECNOLOGIA LTDA",
    inscricao_municipal: "64021",
    regime_tributario: "simples_nacional" as const,
  },
  tomador: {
    documento: "52998224725",
    nome: "Tomador Homologacao",
    email: "tomador@test.local",
  },
  servico: {
    codigo: "1.01",
    descricao: "Analise e desenvolvimento de sistemas",
    ibge_prestacao: "3504107",
    valor_servico_cents: 100,
    competencia: "2026-06-01",
  },
  tributacao: {
    iss_aliquota: 0.02,
    iss_retido: false,
    irrf_aliquota: 0,
    pis_aliquota: 0,
    cofins_aliquota: 0,
    csll_aliquota: 0,
  },
};

describe("betha-dps.adapter", () => {
  it("buildInfDpsId gera 47 chars após prefixo DPS", () => {
    const id = buildInfDpsId("3504107", "37229907000137", "900", "1");
    expect(id.startsWith("DPS3504107")).toBe(true);
    expect(id.length).toBe(3 + 7 + 1 + 14 + 5 + 15);
  });

  it("mapExeqNfseV1ToBethaDps usa tpAmb informado (produção=1)", () => {
    const dps = mapExeqNfseV1ToBethaDps(sampleDto, "exeq-test-ref", { tpAmb: 1 });
    expect(dps.tpAmb).toBe(1);
    expect(dps.vServ).toBe(1);
    expect(dps.cLocEmi).toBe("3504107");
  });

  it("formatBethaDhEmi usa horário America/Sao_Paulo sem offset", () => {
    const fixed = new Date("2026-06-18T19:00:00.000Z");
    expect(formatBethaDhEmi(fixed)).toBe("2026-06-18T16:00:00");
  });
});

describe("betha-dps-xml.builder", () => {
  it("buildBethaDpsUnsignedXml contém infDPS assinável e cTribNac 010101", () => {
    const payload = mapExeqNfseV1ToBethaDps(sampleDto, "exeq-test-ref", { tpAmb: 1 });
    const xml = buildBethaDpsUnsignedXml(payload);
    expect(xml).toContain(`<infDPS id="${payload.infDpsId}">`);
    expect(xml).toContain("<cTribNac>010101</cTribNac>");
    expect(xml).toContain("<totTrib>");
    expect(xml).toContain("<pTotTribFed>0.00</pTotTribFed>");
  });

  it("extractXmlTag lê protocolo", () => {
    const body = "<ns:protocolo>abc-123</ns:protocolo>";
    expect(extractXmlTag(body, "protocolo")).toBe("abc-123");
  });

  it("extractBethaDpsListaMensagem lê E001", () => {
    const body = `<listaMensagens><mensagem><codigo>E001</codigo><mensagem>XML invalido</mensagem><correcao>Corrija</correcao></mensagem></listaMensagens>`;
    const msg = extractBethaDpsListaMensagem(body);
    expect(msg?.codigo).toBe("E001");
    expect(msg?.mensagem).toBe("XML invalido");
    expect(msg?.correcao).toBe("Corrija");
  });

  it("extractBethaDpsListaMensagem lê L12 com namespace ns2", () => {
    const body = `<ns2:listaMensagens><ns2:mensagem><ns2:codigo>L12</ns2:codigo><ns2:mensagem>Proibida emissao</ns2:mensagem><ns2:correcao>Contate prefeitura</ns2:correcao></ns2:mensagem></ns2:listaMensagens>`;
    const msg = extractBethaDpsListaMensagem(body);
    expect(msg?.codigo).toBe("L12");
    expect(msg?.mensagem).toBe("Proibida emissao");
    expect(msg?.correcao).toBe("Contate prefeitura");
  });
});
