import { describe, expect, it } from "vitest";
import { MunicipalRulesService } from "./municipal-rules.service.js";
import {
  ATIBAIA_MUNICIPAL_RULES,
  GENERIC_MUNICIPAL_RULES,
  InMemoryMunicipalRulesRepository,
} from "./municipal-rules.in-memory.repository.js";

describe("MunicipalRulesService", () => {
  it("resolve Atibaia sem enviar IM", async () => {
    const repo = new InMemoryMunicipalRulesRepository(
      new Map([["3504107", ATIBAIA_MUNICIPAL_RULES]]),
    );
    const service = new MunicipalRulesService(repo);
    const dto = await service.resolveDtoByIbge("3504107");
    expect(dto.enviar_inscricao_municipal_prestador).toBe(false);
  });

  it("resolve município genérico enviando IM", async () => {
    const repo = new InMemoryMunicipalRulesRepository(
      new Map([["3507605", GENERIC_MUNICIPAL_RULES]]),
    );
    const service = new MunicipalRulesService(repo);
    const dto = await service.resolveDtoByIbge("3507605");
    expect(dto.enviar_inscricao_municipal_prestador).toBe(true);
  });

  it("default envia IM para IBGE desconhecido", async () => {
    const service = new MunicipalRulesService(new InMemoryMunicipalRulesRepository());
    const dto = await service.resolveDtoByIbge("9999999");
    expect(dto.enviar_inscricao_municipal_prestador).toBe(true);
  });

  it("upsert persiste regras no repositório", async () => {
    const repo = new InMemoryMunicipalRulesRepository();
    const service = new MunicipalRulesService(repo);
    const saved = await service.upsert("3550308", {
      municipio_nome: "São Paulo",
      uf: "SP",
      enviar_inscricao_municipal_prestador: true,
      usa_nfse_nacional: true,
      provider_kind: "focus_nacional",
    });
    expect(saved.ibge_code).toBe("3550308");
    const dto = await service.resolveDtoByIbge("3550308");
    expect(dto.enviar_inscricao_municipal_prestador).toBe(true);
  });
});
