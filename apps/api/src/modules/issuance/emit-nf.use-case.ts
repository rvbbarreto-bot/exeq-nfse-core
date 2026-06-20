import {
  assertFocusPrevalidate,
  FocusPrevalidateError,
  type EmitNfseRequest,
} from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { env } from "../../config/env.js";
import { getProvider, getCustomer, getServiceCatalogItem } from "../master-data/master-data.service.js";
import { resolveTaxParams, TaxRuleNotFoundError } from "../fiscal/tax-resolve.service.js";
import { createMunicipalRulesService } from "../fiscal/municipal-rules/municipal-rules.service.js";
import { buildExeqNfseV1 } from "./build-nfse-v1.js";
import {
  createNfIssueDraft,
  transitionNfIssue,
  hashPayload,
  appendAuditLog,
} from "./nf-issue.service.js";
import { processNfIssueUntilTerminal } from "./process-nf-issue.js";
import { mapPrevalidateCodeToOperatorMessage } from "../integration/nfse/nfse-error-mapper.js";
import { enqueueNfEmission } from "../../workers/queues.js";
import { resolveNfseProviderKind } from "../integration/nfse/nfse-provider.resolver.js";
import { resolveNfseCredentials } from "../integration/nfse/nfse-credentials.service.js";
import { getNfseProvider } from "../integration/nfse/nfse-provider.factory.js";

export async function emitNfse(
  db: Sql,
  tenantId: string,
  input: EmitNfseRequest,
  correlationId: string,
) {
  const nfseProviderKind = await resolveNfseProviderKind(db, input.ibge_code);

  let credentials;
  try {
    credentials = await resolveNfseCredentials(db, tenantId, nfseProviderKind, input.ibge_code);
  } catch (err) {
    if (err instanceof Error && err.message === "FOCUS_TOKEN_MISSING") {
      throw err;
    }
    throw err;
  }

  let issue = await createNfIssueDraft(db, tenantId, input, correlationId);
  issue = await transitionNfIssue(db, tenantId, issue.id, "pending_tax", "api");

  const providerRow = await getProvider(db, tenantId, input.provider_id);
  const customer = await getCustomer(db, tenantId, input.customer_id);
  const service = await getServiceCatalogItem(db, tenantId, input.service_id);

  let tax;
  try {
    tax = await resolveTaxParams(db, tenantId, {
      ibge_code: input.ibge_code,
      service_code: service.service_code,
      tax_regime: providerRow.tax_regime,
      competence_date: input.competence_date,
      fiscal_profile_name: input.fiscal_profile_name,
    });
  } catch (err) {
    if (err instanceof TaxRuleNotFoundError) {
      issue = await transitionNfIssue(db, tenantId, issue.id, "rejected", "api", {
        reason: "TAX_RULE_NOT_FOUND",
        details: err.details,
      });
      return issue;
    }
    throw err;
  }

  const municipalRules = await createMunicipalRulesService(db).resolveDtoByIbge(input.ibge_code);

  const internalPayload = buildExeqNfseV1({
    provider: providerRow,
    customer,
    service,
    ibge_code: input.ibge_code,
    competence_date: input.competence_date,
    amount_cents: input.amount_cents,
    tax,
    description: input.description,
    regras_municipais: municipalRules,
  });

  try {
    assertFocusPrevalidate(internalPayload);
  } catch (err) {
    if (err instanceof FocusPrevalidateError) {
      const operators = err.issues.map((i) => mapPrevalidateCodeToOperatorMessage(i.code));
      issue = await transitionNfIssue(db, tenantId, issue.id, "rejected", "api", {
        reason: "FOCUS_PREVALIDATE_FAILED",
        operators,
      });
      return issue;
    }
    throw err;
  }

  const payloadHash = hashPayload(internalPayload);
  issue = await transitionNfIssue(
    db,
    tenantId,
    issue.id,
    "queued",
    "api",
    { catalog_version: tax.catalog_version, nfse_provider_kind: nfseProviderKind },
    {
      resolved_rule_id: tax.rule_id,
      resolved_params: tax,
      internal_payload: internalPayload,
      payload_hash: payloadHash,
      nfse_provider_kind: nfseProviderKind,
    },
  );

  await appendAuditLog(db, tenantId, "nf_issue", issue.id, "payload_built", payloadHash, {
    rule_id: tax.rule_id,
    nfse_provider_kind: nfseProviderKind,
  });

  const nfseProvider = getNfseProvider(nfseProviderKind);

  if (env.NF_SYNC_PROCESSING) {
    await processNfIssueUntilTerminal(
      db,
      tenantId,
      issue.id,
      nfseProvider,
      credentials,
      nfseProviderKind,
    );
    return getIssueSnapshot(db, tenantId, issue.id);
  }

  await enqueueNfEmission({ tenantId, issueId: issue.id });
  return issue;
}

async function getIssueSnapshot(db: Sql, tenantId: string, issueId: string) {
  const [row] = await db`
    SELECT id, status, idempotency_key, correlation_id, focus_ref, created_at::text AS created_at
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid AND id = ${issueId}::uuid
  `;
  return row!;
}
