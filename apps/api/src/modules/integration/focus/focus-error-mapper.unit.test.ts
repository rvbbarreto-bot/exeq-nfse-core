import { describe, expect, it } from "vitest";
import {
  mapFocusHttpError,
  mapFocusStatusToOperatorMessage,
  mapPrevalidateCodeToOperatorMessage,
} from "./focus-error-mapper.js";

describe("focus-error-mapper", () => {
  it("mapeia status autorizado", () => {
    const msg = mapFocusStatusToOperatorMessage("autorizado");
    expect(msg.title).toBe("Autorizada");
  });

  it("mapeia erro_autorizacao com acao", () => {
    const msg = mapFocusStatusToOperatorMessage("erro_autorizacao");
    expect(msg.detail).toContain("Prefeitura");
    expect(msg.action).toContain("contador");
  });

  it("mapeia codigo prevalidate", () => {
    const msg = mapPrevalidateCodeToOperatorMessage("SIMPLES_CODIGO_OBRIGATORIO");
    expect(msg.detail).toContain("Simples");
  });

  it("mapeia HTTP 401", () => {
    const msg = mapFocusHttpError(401);
    expect(msg.code).toBe("FOCUS_HTTP_401");
  });
});
