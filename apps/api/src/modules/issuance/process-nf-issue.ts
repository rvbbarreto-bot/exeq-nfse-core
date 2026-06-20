import { assertFocusPrevalidate, FocusPrevalidateError } from "@exeq/shared";
import type { ExeqNfseV1, NfIssueStatus, NfseProviderKind } from "@exeq/shared";
import { isTerminalNfIssueStatus } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import type { INfseProvider, NfseProviderCredentials } from "../integration/nfse/nfse-provider.types.js";
import {
  mapProviderStatusToOperatorMessage,
  mapPrevalidateCodeToOperatorMessage,
} from "../integration/nfse/nfse-error-mapper.js";
import { mapBethaDpsListaMensagemToOperator } from "../integration/nfse/betha/betha-error-mapper.js";
import {
  isTerminalExternalStatus,
  mapExternalStatusToIssueStatus,
} from "../integration/nfse/nfse-status.mapper.js";
import {
  transitionNfIssue,
  getNfIssueForProcessing,
  appendAuditLog,
  hashPayload,
} from "./nf-issue.service.js";

export async function processNfIssueLifecycle(
  db: Sql,
  tenantId: string,
  issueId: string,
  provider: INfseProvider,
  credentials: NfseProviderCredentials,
  providerKind: NfseProviderKind,
): Promise<void> {
  let issue = await getNfIssueForProcessing(db, tenantId, issueId);

  if (issue.status === "queued") {
    await runSubmit(db, tenantId, issueId, issue.internal_payload!, provider, credentials, providerKind);
    issue = await getNfIssueForProcessing(db, tenantId, issueId);
  }

  if (issue.status === "submitting" || issue.status === "polling") {
    await runPolling(db, tenantId, issueId, provider, credentials, providerKind);
  }
}

function decodeBethaXmlEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Erros Betha E### são rejeição fiscal/config — não falha técnica. */
function mapBethaSubmitError(err: unknown): {
  status: "rejected" | "failed";
  error: string;
  operators?: ReturnType<typeof mapPrevalidateCodeToOperatorMessage>[];
} {
  const raw = err instanceof Error ? err.message : "unknown";
  const error = decodeBethaXmlEntities(raw);
  const code = error.match(/BETHA_DPS_(E\d+)/)?.[1];
  if (code) {
    const detail = error.split(":").slice(1).join(":").trim() || code;
    return {
      status: "rejected",
      error,
      operators: [{ code, title: `Betha ${code}`, detail, action: "Verificar cadastro portal Betha e tpAmb" }],
    };
  }
  return { status: "failed", error };
}

async function runSubmit(
  db: Sql,
  tenantId: string,
  issueId: string,
  payload: ExeqNfseV1,
  provider: INfseProvider,
  credentials: NfseProviderCredentials,
  providerKind: NfseProviderKind,
): Promise<void> {
  await transitionNfIssue(db, tenantId, issueId, "submitting", "emission-worker");

  try {
    assertFocusPrevalidate(payload);
  } catch (err) {
    if (err instanceof FocusPrevalidateError) {
      await transitionNfIssue(db, tenantId, issueId, "rejected", "emission-worker", {
        operators: err.issues.map((i) => mapPrevalidateCodeToOperatorMessage(i.code)),
      });
      return;
    }
    throw err;
  }

  const externalRef = `exeq-${issueId}`;

  try {
    const response = await provider.submit(externalRef, payload, credentials);
    await appendAuditLog(db, tenantId, "nf_issue", issueId, "nfse_submit", hashPayload(payload), {
      provider_kind: providerKind,
      external_ref: externalRef,
      response,
    });
    await transitionNfIssue(db, tenantId, issueId, "polling", "emission-worker", {
      provider_status: response.status,
      provider_kind: providerKind,
    }, {
      focus_ref: response.externalRef,
      focus_status_raw: response.raw,
      nfse_provider_kind: providerKind,
    });
  } catch (err) {
    const mapped = mapBethaSubmitError(err);
    await transitionNfIssue(db, tenantId, issueId, mapped.status, "emission-worker", {
      error: mapped.error,
      provider_kind: providerKind,
      operators: mapped.operators,
    });
  }
}

async function runPolling(
  db: Sql,
  tenantId: string,
  issueId: string,
  provider: INfseProvider,
  credentials: NfseProviderCredentials,
  providerKind: NfseProviderKind,
): Promise<void> {
  const issue = await getNfIssueForProcessing(db, tenantId, issueId);
  if (!issue.focus_ref || isTerminalNfIssueStatus(issue.status)) return;

  try {
    const response = await provider.consult(issue.focus_ref, credentials);
    await appendAuditLog(db, tenantId, "nf_issue", issueId, "nfse_consult", null, {
      provider_kind: providerKind,
      external_ref: issue.focus_ref,
      response,
    });

    const statusStr = String(response.status);
    const mapped = mapExternalStatusToIssueStatus(statusStr);
    if (mapped && mapped !== "polling" && isTerminalExternalStatus(statusStr)) {
      const bethaErro = providerKind === "betha" ? response.erros?.[0] : undefined;
      const operator =
        bethaErro?.codigo && bethaErro.codigo !== "BETHA_DPS"
          ? mapBethaDpsListaMensagemToOperator(
              bethaErro.codigo,
              bethaErro.mensagem,
            )
          : mapProviderStatusToOperatorMessage(providerKind, statusStr);
      await transitionNfIssue(db, tenantId, issueId, mapped, "polling-worker", {
        numero_nfse: response.numero_nfse,
        codigo_verificacao: response.codigo_verificacao,
        operator,
        focus_erros: response.erros,
        provider_kind: providerKind,
      }, {
        focus_status_raw: response.raw,
      });
      return;
    }

    if (issue.status === "submitting") {
      await transitionNfIssue(db, tenantId, issueId, "polling", "polling-worker", {
        provider_status: response.status,
        provider_kind: providerKind,
      }, {
        focus_status_raw: response.raw,
      });
    }
  } catch (err) {
    await transitionNfIssue(db, tenantId, issueId, "failed", "polling-worker", {
      error: err instanceof Error ? err.message : "unknown",
      provider_kind: providerKind,
    });
  }
}

export async function processNfIssueUntilTerminal(
  db: Sql,
  tenantId: string,
  issueId: string,
  provider: INfseProvider,
  credentials: NfseProviderCredentials,
  providerKind: NfseProviderKind,
  maxPolls = 5,
): Promise<NfIssueStatus> {
  for (let i = 0; i < maxPolls; i++) {
    await processNfIssueLifecycle(db, tenantId, issueId, provider, credentials, providerKind);
    const issue = await getNfIssueForProcessing(db, tenantId, issueId);
    if (isTerminalNfIssueStatus(issue.status)) return issue.status;
  }
  const issue = await getNfIssueForProcessing(db, tenantId, issueId);
  return issue.status;
}
