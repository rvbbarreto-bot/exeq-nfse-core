import { describe, expect, it } from "vitest";
import { formatGatewayMode, gatewayModeClass } from "../src/lib/charge-ui.js";

describe("charge-ui gateway mode", () => {
  it("formata mock e http", () => {
    expect(formatGatewayMode("mock")).toContain("Mock");
    expect(formatGatewayMode("http")).toContain("HTTP");
    expect(formatGatewayMode(null, "mock-xyz")).toContain("Mock");
  });

  it("aplica classe visual por modo", () => {
    expect(gatewayModeClass("mock")).toBe("warn");
    expect(gatewayModeClass("http")).toBe("ok");
  });
});
