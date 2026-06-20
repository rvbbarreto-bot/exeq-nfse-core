import { afterEach, describe, expect, it } from "vitest";
import {
  assertChannelPhoneAllowed,
  ChannelPhoneNotAllowedError,
  getChannelAllowedPhoneDigits,
  isChannelPhoneAllowed,
  normalizeChannelPhoneDigits,
} from "./channel-phone-guard.js";

describe("channel-phone-guard", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("normaliza dígitos", () => {
    expect(normalizeChannelPhoneDigits("+55 (11) 97330-5448")).toBe("5511973305448");
  });

  it("sem allowlist permite qualquer remetente (piloto aberto)", () => {
    delete process.env.CHANNEL_ALLOWED_SENDERS;
    delete process.env.CHANNEL_ALLOWED_PHONES;
    process.env.CHANNEL_PAIRED_PHONE = "+5511973305448";
    process.env.CHANNEL_TEST_PHONE = "+5511973305448";
    expect(getChannelAllowedPhoneDigits()).toBeNull();
    expect(isChannelPhoneAllowed("+5511987654403")).toBe(true);
    expect(isChannelPhoneAllowed("+5511973857162")).toBe(true);
  });

  it("CHANNEL_PAIRED_PHONE sozinho não bloqueia clientes", () => {
    process.env.CHANNEL_PAIRED_PHONE = "+5511973305448";
    delete process.env.CHANNEL_ALLOWED_SENDERS;
    delete process.env.CHANNEL_ALLOWED_PHONES;
    delete process.env.CHANNEL_TEST_PHONE;
    expect(isChannelPhoneAllowed("+5511973857162")).toBe(true);
  });

  it("com CHANNEL_ALLOWED_SENDERS restringe remetentes beta", () => {
    process.env.CHANNEL_ALLOWED_SENDERS = "+5511973857162, 5511999887766";
    delete process.env.CHANNEL_ALLOWED_PHONES;
    expect(isChannelPhoneAllowed("+5511973857162")).toBe(true);
    expect(isChannelPhoneAllowed("+5511999887766")).toBe(true);
    expect(isChannelPhoneAllowed("+5511973305448")).toBe(false);
    expect(() => assertChannelPhoneAllowed("+5511973305448")).toThrow(
      ChannelPhoneNotAllowedError,
    );
  });

  it("aceita lista em CHANNEL_ALLOWED_PHONES", () => {
    process.env.CHANNEL_ALLOWED_PHONES = "+5511973857162, 5511999887766";
    delete process.env.CHANNEL_ALLOWED_SENDERS;
    expect(isChannelPhoneAllowed("+5511999887766")).toBe(true);
    expect(isChannelPhoneAllowed("+5511987654403")).toBe(false);
  });
});
