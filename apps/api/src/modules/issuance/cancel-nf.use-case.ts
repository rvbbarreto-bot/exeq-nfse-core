import type { Sql } from "../../db/client.js";
import type { NfseProviderKind } from "@exeq/shared";
import {
  getNfIssueForProcessing,
  transitionNfIssue,
  appendAuditLog,
} from "./nf-issue.service.js";
import { mapProviderStatusToOperatorMessage } from "../integration/nfse/nfse-error-mapper.js";
import { getNfseProvider } from "../integration/nfse/nfse-provider.factory.js";
import { resolveNfseCredentials } from "../integration/nfse/nfse-credentials.service.js";
import { resolveNfseProviderKind } from "../integration/nfse/nfse-provider.resolver.js";

export class CancelNotAllowedError extends Error {
  constructor() {
    super("CANCEL_NOT_ALLOWED");
    this.name = "CancelNotAllowedError";
  }
}

export async function cancelNfIssue(
  db: Sql,
  tenantId: string,
  issueId: string,
  justificativa: string,
) {
  const issue = await getNfIssueForProcessing(db, tenantId, issueId);
  if (issue.status !== "authorized") throw new CancelNotAllowedError();
  if (!issue.focus_ref) throw new CancelNotAllowedError();

  const providerKind: NfseProviderKind =
    (issue.nfse_provider_kind as NfseProviderKind) ??
    (await resolveNfseProviderKind(db, issue.ibge_code));

  const credentials = await resolveNfseCredentials(db, tenantId, providerKind, issue.ibge_code);
  const provider = getNfseProvider(providerKind);

  const response = await provider.cancel(issue.focus_ref, justificativa, credentials);
  const operator = mapProviderStatusToOperatorMessage(providerKind, String(response.status));

  await appendAuditLog(db, tenantId, "nf_issue", issueId, "nfse_cancel", null, {
    provider_kind: providerKind,
    response,
    operator,
  });

  await transitionNfIssue(db, tenantId, issueId, "cancelled", "api", {
    operator,
    justificativa,
    provider_kind: providerKind,
  }, {
    focus_status_raw: response.raw,
  });

  return { status: "cancelled", operator };
}
