import type { Sql } from "../../db/client.js";
import { env } from "../../config/env.js";
import { enqueueNfEmission } from "../../workers/queues.js";
import {
  getNfIssueForProcessing,
  transitionNfIssue,
} from "./nf-issue.service.js";

export class ReprocessNotAllowedError extends Error {
  constructor(readonly status: string) {
    super("REPROCESS_NOT_ALLOWED");
    this.name = "ReprocessNotAllowedError";
  }
}

export async function reprocessNfIssue(db: Sql, tenantId: string, issueId: string) {
  const issue = await getNfIssueForProcessing(db, tenantId, issueId);
  if (issue.status !== "failed") {
    throw new ReprocessNotAllowedError(issue.status);
  }

  await transitionNfIssue(db, tenantId, issueId, "queued", "admin-reprocess", {
    action: "reprocess",
  });

  if (!env.NF_SYNC_PROCESSING) {
    await enqueueNfEmission({ tenantId, issueId });
  }

  return { issue_id: issueId, status: "queued" as const };
}
