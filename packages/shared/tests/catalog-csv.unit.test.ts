import { describe, expect, it } from "vitest";
import { parseCatalogCsv } from "../src/catalog-csv.js";

const SAMPLE_ROW =
  "1,Perfil Piloto SP,3504107,Atibaia,SP,1.01,Analise,simples_nacional,0.0200,false,0,0,0,0,3,2026-06-01,,100,obs";

describe("parseCatalogCsv", () => {
  it("parseia CSV valido com header", () => {
    const csv = [
      "catalog_version,fiscal_profile_name,ibge_code,municipio_nome,uf,service_code,service_description,tax_regime,iss_rate,iss_retained,irrf_rate,pis_rate,cofins_rate,csll_rate,simples_codigo_tributacao,valid_from,valid_to,priority,observacao_contador",
      SAMPLE_ROW,
    ].join("\n");

    const { rows, errors } = parseCatalogCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.iss_rate).toBe(0.02);
    expect(rows[0]!.simples_codigo_tributacao).toBe(3);
  });

  it("rejeita CSV sem colunas obrigatorias", () => {
    const { rows, errors } = parseCatalogCsv("a,b,c\n1,2,3");
    expect(rows).toHaveLength(0);
    expect(errors[0]!.message).toContain("Coluna obrigatoria");
  });

  it("reporta erro em linha Simples sem codigo", () => {
    const csv = [
      "catalog_version,fiscal_profile_name,ibge_code,municipio_nome,uf,service_code,service_description,tax_regime,iss_rate,iss_retained,irrf_rate,pis_rate,cofins_rate,csll_rate,simples_codigo_tributacao,valid_from,valid_to,priority,observacao_contador",
      "1,Perfil,3504107,Atibaia,SP,1.01,Desc,simples_nacional,0.02,false,0,0,0,0,,2026-06-01,,100,",
    ].join("\n");
    const { rows, errors } = parseCatalogCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("parseia campo entre aspas com virgula", () => {
    const csv = [
      "catalog_version,fiscal_profile_name,ibge_code,municipio_nome,uf,service_code,service_description,tax_regime,iss_rate,iss_retained,irrf_rate,pis_rate,cofins_rate,csll_rate,simples_codigo_tributacao,valid_from,valid_to,priority,observacao_contador",
      '1,Perfil,3504107,Atibaia,SP,1.01,"Consultoria, TI",simples_nacional,0.02,false,0,0,0,0,3,2026-06-01,,100,',
    ].join("\n");
    const { rows } = parseCatalogCsv(csv);
    expect(rows[0]!.service_description).toBe("Consultoria, TI");
  });
});
