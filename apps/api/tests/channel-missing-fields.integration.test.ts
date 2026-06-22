import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, withTenant } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { processChannelInbound } from "../src/modules/channel/process-channel-inbound.use-case.js";
import { randomUUID } from "node:crypto";

describe("Canal WhatsApp — lista completa de campos faltantes (QA Ricardo 22:02)", () => {
  let tenantId: string;

  beforeAll(async () => {
    await runMigrations();
    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    tenantId = login.json().tenant_id;
    await app.close();
  }, 60_000);

  afterAll(async () => {
    await closeDb();
  });

  it("cenario Opa noite + valor + cidade tomador lista V11A e endereco", async () => {
    const phone = `+55119${String(Date.now()).slice(-8)}`;
    const text = [
      "Opa, noite",
      "Quero emitir uma nova nota",
      "O valore é 1.190,00",
      "E a cidade tomador Atibaia",
    ].join("\n");

    const result = await withTenant(tenantId, (db) =>
      processChannelInbound(
        db,
        tenantId,
        {
          phone_e164: phone,
          message_id: `qa-missing-${Date.now()}`,
          text,
          contact_name: "Ricardo",
        },
        randomUUID(),
      ),
    );

    expect(result.emitted).toBe(false);
    expect(result.reply_text).toContain("nome do cliente");
    expect(result.reply_text).toContain("CPF ou CNPJ");
    expect(result.reply_text).toContain("código do serviço");
    expect(result.reply_text).toContain("logradouro do tomador");
    expect(result.reply_text).toContain("numero do tomador");
    expect(result.reply_text).toContain("bairro do tomador");
    expect(result.reply_text).toContain("CEP do tomador");
    expect(result.reply_text).not.toContain("E a cidade tomador");
  });

  it("sessao antiga com V11A fantasma + nova nota lista todos os campos faltantes", async () => {
    const phone = `+55118${String(Date.now()).slice(-8)}`;
    const staleDraft = {
      provider_id: "00000000-0000-4000-a000-000000000001",
      tomador_name: "Cliente Fantasma",
      tomador_document: "52998224725",
      description: "Descricao antiga",
      competence_date: "2026-06-01",
      service_code: "1.01",
      ibge_code: "3504107",
      amount_cents: 100,
    };

    await withTenant(tenantId, async (db) => {
      const { createChannelSession, collectChannelSessionDraft } = await import(
        "../src/modules/channel/channel.service.js"
      );
      const session = await createChannelSession(
        db,
        tenantId,
        { phone_e164: phone, idempotency_key: `stale-${Date.now()}` },
        randomUUID(),
      );
      const defaults = await import("../src/modules/channel/channel-defaults.service.js");
      const { provider_id } = await defaults.resolveChannelEmissionDefaults(db, tenantId);
      await collectChannelSessionDraft(db, tenantId, session.id, {
        ...staleDraft,
        provider_id,
        conversation_flags: { greeted: true, missing_list_sent: true },
      });

      const text = [
        "Opa, noite",
        "Quero emitir uma nova nota",
        "O valore é 1.190,00",
        "E a cidade tomador Atibaia",
      ].join("\n");

      const result = await processChannelInbound(
        db,
        tenantId,
        {
          phone_e164: phone,
          message_id: `qa-stale-${Date.now()}`,
          text,
          contact_name: "Ricardo",
        },
        randomUUID(),
      );

      expect(result.reply_text).toContain("nome do cliente");
      expect(result.reply_text).toContain("CPF ou CNPJ");
      expect(result.reply_text).toContain("código do serviço");
      expect(result.reply_text).toContain("logradouro do tomador");
    });
  });
});
