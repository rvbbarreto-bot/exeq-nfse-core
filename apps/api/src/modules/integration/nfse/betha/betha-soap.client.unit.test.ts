import { describe, expect, it } from "vitest";
import { resolveBethaSoapEndpoint } from "./betha-soap.client.js";

describe("resolveBethaSoapEndpoint", () => {
  it("resolve RPS recepcionar WSDL para endpoint de operação", () => {
    expect(
      resolveBethaSoapEndpoint(
        "https://nota-eletronica.betha.cloud/rps/ws/recepcionarLoteRps?wsdl",
      ),
    ).toBe("https://nota-eletronica.betha.cloud/rps/ws/recepcionarLoteRps");
  });

  it("resolve DPS service.wsdl para base /dps/ws", () => {
    expect(
      resolveBethaSoapEndpoint("https://nota-eletronica.betha.cloud/dps/ws/service.wsdl"),
    ).toBe("https://nota-eletronica.betha.cloud/dps/ws");
  });
});
