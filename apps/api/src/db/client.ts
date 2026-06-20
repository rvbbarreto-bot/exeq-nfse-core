import postgres from "postgres";
import { env, migrationDatabaseUrl } from "../config/env.js";

/** Connection pool (supports `begin`, `end`). */
export type DbPool = ReturnType<typeof postgres>;

/** Pool or active transaction — use for repository/query functions. */
export type Sql = DbPool | postgres.TransactionSql;

let sql: DbPool | null = null;
let migrationSql: DbPool | null = null;

export function getDb(): DbPool {
  if (!sql) {
    sql = postgres(env.DATABASE_URL, {
      max: 10,
      prepare: false,
    });
  }
  return sql;
}

export function getMigrationDb(): DbPool {
  if (!migrationSql) {
    migrationSql = postgres(migrationDatabaseUrl, {
      max: 2,
      prepare: false,
    });
  }
  return migrationSql;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
  if (migrationSql) {
    await migrationSql.end();
    migrationSql = null;
  }
}

export async function withTenant<T>(
  tenantId: string,
  fn: (db: Sql) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
