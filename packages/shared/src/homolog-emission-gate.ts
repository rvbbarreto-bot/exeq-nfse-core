/** IBGE Atibaia/SP — emissão via Focus Nacional (/v2/nfsen). */
export const ATIBAIA_IBGE = "3504107";

export type HomologEmissionHealth = {
  focus?: { mock?: boolean };
  atibaia_routing?: { provider?: string };
};

export type HomologEmissionGateMode =
  | "focus_mock"
  | "focus_nacional_real"
  | "none";

export type HomologEmissionGateResult = {
  ok: boolean;
  mode: HomologEmissionGateMode;
  message?: string;
};

/**
 * Gate homolog: FOCUS_MOCK=true (sandbox) ou Focus real com token no vault.
 */
export function isHomologEmissionGateReady(
  health: HomologEmissionHealth | null | undefined,
): HomologEmissionGateResult {
  if (!health) {
    return {
      ok: false,
      mode: "none",
      message: "API /health indisponível",
    };
  }

  if (health.focus?.mock === true) {
    return { ok: true, mode: "focus_mock" };
  }

  if (health.atibaia_routing?.provider === "focus_nacional") {
    return {
      ok: true,
      mode: "focus_nacional_real",
      message: "Focus Nacional real — token no vault; rode focus:preflight-atibaia",
    };
  }

  return {
    ok: false,
    mode: "none",
    message:
      "Configure FOCUS_MOCK=true (homolog sandbox) ou token Focus no vault + reinicie API/worker",
  };
}
