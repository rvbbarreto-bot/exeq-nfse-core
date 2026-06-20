import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMigrationDb, closeDb } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

function isCliEntry(): boolean {
  return (
    !!process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  );
}

const GATEWAY_PAYMENT_URL_MIGRATION = "0010_charge_gateway_payment_url.sql";

async function chargeHasGatewayPaymentUrl(db: ReturnType<typeof getMigrationDb>): Promise<boolean> {
  const rows = await db<{ ok: number }[]>`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'exeq_core'
      AND table_name = 'charge'
      AND column_name = 'gateway_payment_url'
    LIMIT 1
  `;
  return rows.length > 0;
}

async function repairGatewayPaymentUrlColumn(
  db: ReturnType<typeof getMigrationDb>,
  appliedSet: Set<string>,
): Promise<void> {
  if (await chargeHasGatewayPaymentUrl(db)) return;

  const sqlPath = path.join(migrationsDir, GATEWAY_PAYMENT_URL_MIGRATION);
  const sqlText = await readFile(sqlPath, "utf-8");
  console.log(`Repair schema: applying ${GATEWAY_PAYMENT_URL_MIGRATION} (column gateway_payment_url missing)`);
  await db.unsafe(sqlText);
  if (!appliedSet.has(GATEWAY_PAYMENT_URL_MIGRATION)) {
    await db`INSERT INTO exeq_core.schema_migrations (id) VALUES (${GATEWAY_PAYMENT_URL_MIGRATION})`;
    appliedSet.add(GATEWAY_PAYMENT_URL_MIGRATION);
  }
}

export async function runMigrations(): Promise<void> {
  const db = getMigrationDb();

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  let applied: { id: string }[] = [];
  try {
    applied = await db<{ id: string }[]>`SELECT id FROM exeq_core.schema_migrations`;
  } catch {
    // schema or table not ready — first migration creates them
  }

  const appliedSet = new Set(applied.map((r) => r.id));
  let newlyApplied = 0;

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sqlText = await readFile(path.join(migrationsDir, file), "utf-8");
    await db.unsafe(sqlText);
    await db`INSERT INTO exeq_core.schema_migrations (id) VALUES (${file})`;
    appliedSet.add(file);
    newlyApplied += 1;
    console.log(`Applied migration: ${file}`);
  }

  await repairGatewayPaymentUrlColumn(db, appliedSet);

  if (newlyApplied === 0) {
    console.log("Migrations: no new files (schema up to date).");
  } else {
    console.log(`Migrations: ${newlyApplied} file(s) applied.`);
  }

  if (!(await chargeHasGatewayPaymentUrl(db))) {
    throw new Error(
      "Schema incomplete: exeq_core.charge.gateway_payment_url missing after migrate. Check MIGRATION_DATABASE_URL.",
    );
  }
}

const isMain = isCliEntry();
if (isMain) {
  runMigrations()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
