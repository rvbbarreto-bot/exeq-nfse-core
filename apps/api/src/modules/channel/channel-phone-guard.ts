/**
 * Allowlist opcional de REMETENTES (clientes beta).
 *
 * Pareamento Evolution (linha Exeq em EVOLUTION_INSTANCE / CHANNEL_PAIRED_PHONE)
 * define qual WhatsApp RECEBE mensagens — não restringe quem pode solicitar NFS-e.
 *
 * Use CHANNEL_ALLOWED_SENDERS ou CHANNEL_ALLOWED_PHONES só para piloto fechado.
 */

export class ChannelPhoneNotAllowedError extends Error {
  readonly code = "CHANNEL_PHONE_NOT_ALLOWED" as const;
  readonly phone_e164: string;

  constructor(phoneE164: string) {
    super(`Telefone nao autorizado no canal: ${phoneE164}`);
    this.name = "ChannelPhoneNotAllowedError";
    this.phone_e164 = phoneE164;
  }
}

export function normalizeChannelPhoneDigits(phone: string): string {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // BR: DDD+número (10–11 dígitos) sem código 55 → prefixa 55 (paridade Evolution/WhatsApp)
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits;
}

/** Dígitos E.164 sem '+' — ex.: 5511973305448. Null = aceita qualquer remetente. */
export function getChannelAllowedPhoneDigits(): Set<string> | null {
  const sources = [
    process.env.CHANNEL_ALLOWED_SENDERS,
    process.env.CHANNEL_ALLOWED_PHONES,
  ].filter(Boolean) as string[];

  if (sources.length === 0) return null;

  const digits = new Set<string>();
  for (const source of sources) {
    for (const part of source.split(/[,;\s]+/)) {
      const d = normalizeChannelPhoneDigits(part);
      if (d.length >= 10) digits.add(d);
    }
  }

  return digits.size > 0 ? digits : null;
}

export function isChannelPhoneAllowed(phoneE164: string): boolean {
  const allowed = getChannelAllowedPhoneDigits();
  if (!allowed) return true;
  const digits = normalizeChannelPhoneDigits(phoneE164);
  return digits.length >= 10 && allowed.has(digits);
}

export function assertChannelPhoneAllowed(phoneE164: string): void {
  if (!isChannelPhoneAllowed(phoneE164)) {
    throw new ChannelPhoneNotAllowedError(phoneE164);
  }
}
