import { env } from "../../config/env.js";

export type SendEvolutionTextInput = {
  phone_e164: string;
  text: string;
};

export type SendEvolutionTextResult =
  | { ok: true }
  | { ok: false; reason: string };

export function isEvolutionOutboundConfigured(): boolean {
  return Boolean(
    (env.EVOLUTION_SERVER_URL || env.EVOLUTION_API_URL) &&
      env.EVOLUTION_INSTANCE &&
      env.EVOLUTION_API_KEY,
  );
}

function evolutionBaseUrl(): string | undefined {
  return (env.EVOLUTION_SERVER_URL ?? env.EVOLUTION_API_URL)?.replace(/\/$/, "");
}

/** Envia resposta WhatsApp via Evolution (API no host → localhost:8082). */
export async function sendChannelEvolutionText(
  input: SendEvolutionTextInput,
): Promise<SendEvolutionTextResult> {
  const base = evolutionBaseUrl();
  const instance = env.EVOLUTION_INSTANCE;
  const apiKey = env.EVOLUTION_API_KEY;
  const number = input.phone_e164.replace(/\D/g, "");
  const text = input.text.trim();

  if (!base || !instance || !apiKey) {
    return { ok: false, reason: "EVOLUTION_API_URL/INSTANCE/API_KEY não configurados na API" };
  }
  if (!number || !text) {
    return { ok: false, reason: "telefone ou texto vazio" };
  }

  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ number, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, reason: `Evolution HTTP ${res.status}: ${body.slice(0, 200)}` };
  }

  return { ok: true };
}
