import {
  FISCAL_FEATURE_FLAG_KEYS,
  type FiscalFeatureFlagKey,
  isFiscalFeatureFlagKey,
} from "@exeq/shared";
import { selectEngineKind } from "@exeq/fiscal-engine";
import type { Sql } from "../../db/client.js";
import { asJsonValue } from "../../lib/json.js";
import { env } from "../../config/env.js";

export class FeatureFlagDisabledError extends Error {
  constructor(public readonly flag: FiscalFeatureFlagKey) {
    super(`FEATURE_FLAG_DISABLED:${flag}`);
    this.name = "FeatureFlagDisabledError";
  }
}

export type TenantFeatureFlagRow = {
  flag_key: FiscalFeatureFlagKey;
  enabled: boolean;
  rollout_config: Record<string, unknown>;
  updated_at: string;
};

export async function listTenantFeatureFlags(
  db: Sql,
  tenantId: string,
): Promise<TenantFeatureFlagRow[]> {
  const rows = await db<
    {
      flag_key: string;
      enabled: boolean;
      rollout_config: Record<string, unknown>;
      updated_at: string;
    }[]
  >`
    SELECT flag_key, enabled, rollout_config, updated_at::text AS updated_at
    FROM exeq_core.tenant_feature_flags
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY flag_key
  `;

  const byKey = new Map(rows.map((r) => [r.flag_key, r]));
  return FISCAL_FEATURE_FLAG_KEYS.map((flag_key) => {
    const row = byKey.get(flag_key);
    return {
      flag_key,
      enabled: row?.enabled ?? false,
      rollout_config: row?.rollout_config ?? {},
      updated_at: row?.updated_at ?? new Date(0).toISOString(),
    };
  });
}

export async function isFeatureEnabled(
  db: Sql,
  tenantId: string,
  flag: FiscalFeatureFlagKey,
): Promise<boolean> {
  if (env.FISCAL_FLAGS_GLOBAL_DISABLE) return false;

  const [row] = await db<{ enabled: boolean }[]>`
    SELECT enabled
    FROM exeq_core.tenant_feature_flags
    WHERE tenant_id = ${tenantId}::uuid AND flag_key = ${flag}
  `;
  return row?.enabled === true;
}

export async function setTenantFeatureFlag(
  db: Sql,
  tenantId: string,
  flagKey: string,
  enabled: boolean,
  updatedByUserId: string,
  rolloutConfig?: Record<string, unknown>,
): Promise<TenantFeatureFlagRow> {
  if (!isFiscalFeatureFlagKey(flagKey)) {
    throw new Error("INVALID_FEATURE_FLAG");
  }

  if (enabled && (flagKey === "FEATURE_IBS" || flagKey === "FEATURE_CBS") && !env.FISCAL_TAX_SNAPSHOT_ENABLED) {
    throw new Error("TAX_SNAPSHOT_REQUIRED_FOR_IBS_CBS");
  }

  const [row] = await db<
    {
      flag_key: string;
      enabled: boolean;
      rollout_config: Record<string, unknown>;
      updated_at: string;
    }[]
  >`
    INSERT INTO exeq_core.tenant_feature_flags (tenant_id, flag_key, enabled, rollout_config, updated_by)
    VALUES (
      ${tenantId}::uuid,
      ${flagKey},
      ${enabled},
      ${db.json(asJsonValue(rolloutConfig ?? {}))},
      ${updatedByUserId}::uuid
    )
    ON CONFLICT (tenant_id, flag_key) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      rollout_config = EXCLUDED.rollout_config,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING flag_key, enabled, rollout_config, updated_at::text AS updated_at
  `;

  return {
    flag_key: row!.flag_key as FiscalFeatureFlagKey,
    enabled: row!.enabled,
    rollout_config: row!.rollout_config,
    updated_at: row!.updated_at,
  };
}

/** Motor fiscal ativo para a competência — delega seleção ao @exeq/fiscal-engine. */
export async function resolveFiscalEngine(
  db: Sql,
  tenantId: string,
  competenceDate: string,
): Promise<"iss_legacy" | "hybrid" | "ibs_cbs_v1"> {
  const transition = await isFeatureEnabled(db, tenantId, "FEATURE_TRANSITION_MODE");
  const ibs = await isFeatureEnabled(db, tenantId, "FEATURE_IBS");
  const cbs = await isFeatureEnabled(db, tenantId, "FEATURE_CBS");

  return selectEngineKind(competenceDate, { transitionMode: transition, ibs, cbs });
}
