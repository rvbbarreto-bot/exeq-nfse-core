import type postgres from "postgres";

/** Cast values for postgres.js `sql.json()` (strict JSONValue typing). */
export function asJsonValue(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}

/** Normaliza address JSONB que pode ter sido salvo como string JSON escapada. */
export function coerceAddressRecord(
  raw: unknown,
): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  let value: unknown = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).length === 0 ? undefined : obj;
}
