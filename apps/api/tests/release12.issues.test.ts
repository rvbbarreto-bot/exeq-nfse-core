process.env.NF_SYNC_PROCESSING = "true";
process.env.FOCUS_MOCK = "true";

import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { setupEmissionMasterData } from "./helpers/emission-setup.js";
import { buildEmitPayload, emitViaApi, type QaMasterData } from "./helpers/qa-setup.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Release 1.2 — issues pagination", () => {
  let token: string;
  let md: QaMasterData;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    const master = await setupEmissionMasterData(app, login.json().access_token);
    md = {
      token: login.json().access_token,
      tenantId: login.json().tenant_id,
      ...master,
    };
    token = md.token;
    const k1 = `r12a-${Date.now()}`;
    const k2 = `r12b-${Date.now() + 1}`;
    await emitViaApi(app, token, buildEmitPayload(md, "3504107", k1));
    await emitViaApi(app, token, buildEmitPayload(md, "3507605", k2));
    await app.close();
  }, 90_000);

  afterAll(async () => {
    await closeDb();
  });

  it("RC-05b: list issues com cursor keyset", async () => {
    const app = await buildApp();
    const page1 = await app.inject({
      method: "GET",
      url: "/v1/nf/issues?limit=1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.items).toHaveLength(1);
    expect(body1.items[0].amount_cents).toBeTypeOf("number");
    expect(body1.next_cursor).toBeTruthy();

    const page2 = await app.inject({
      method: "GET",
      url: `/v1/nf/issues?limit=1&cursor=${encodeURIComponent(body1.next_cursor)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json();
    expect(body2.items).toHaveLength(1);
    expect(body2.items[0].id).not.toBe(body1.items[0].id);

    const filtered = await app.inject({
      method: "GET",
      url: "/v1/nf/issues?status=authorized&ibge_code=3504107&limit=50",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().items.every((i: { ibge_code: string }) => i.ibge_code === "3504107")).toBe(
      true,
    );
    await app.close();
  });
});
