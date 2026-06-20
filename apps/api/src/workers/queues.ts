import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { NfseProviderKind } from "@exeq/shared";
import { env } from "../config/env.js";
import { getDb, withTenant } from "../db/client.js";
import { processNfIssueLifecycle } from "../modules/issuance/process-nf-issue.js";
import { processWebhookInboxUntilTerminal } from "../modules/billing/process-webhook-inbox.js";
import { getNfIssueForProcessing } from "../modules/issuance/nf-issue.service.js";
import { getNfseProvider } from "../modules/integration/nfse/nfse-provider.factory.js";
import { resolveNfseCredentials } from "../modules/integration/nfse/nfse-credentials.service.js";
import { resolveNfseProviderKind } from "../modules/integration/nfse/nfse-provider.resolver.js";

export type NfEmissionJob = {
  tenantId: string;
  issueId: string;
};

export type WebhookProcessingJob = {
  tenantId: string;
  inboxId: string;
};

let connection: Redis | null = null;
let emissionQueue: Queue<NfEmissionJob> | null = null;
let pollingQueue: Queue<NfEmissionJob> | null = null;
let webhookQueue: Queue<WebhookProcessingJob> | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function getEmissionQueue(): Queue<NfEmissionJob> {
  if (!emissionQueue) {
    emissionQueue = new Queue<NfEmissionJob>("nf-emission", {
      connection: getRedisConnection(),
    });
  }
  return emissionQueue;
}

export function getPollingQueue(): Queue<NfEmissionJob> {
  if (!pollingQueue) {
    pollingQueue = new Queue<NfEmissionJob>("nf-polling", {
      connection: getRedisConnection(),
    });
  }
  return pollingQueue;
}

export async function enqueueNfEmission(job: NfEmissionJob): Promise<void> {
  await getEmissionQueue().add("emit", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export function getWebhookQueue(): Queue<WebhookProcessingJob> {
  if (!webhookQueue) {
    webhookQueue = new Queue<WebhookProcessingJob>("webhook-inbox", {
      connection: getRedisConnection(),
    });
  }
  return webhookQueue;
}

export async function enqueueWebhookProcessing(job: WebhookProcessingJob): Promise<void> {
  await getWebhookQueue().add("process", job, {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function enqueueNfPolling(job: NfEmissionJob, delayMs = 3000): Promise<void> {
  await getPollingQueue().add("poll", job, {
    delay: delayMs,
    attempts: 10,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

async function loadEmissionContext(tenantId: string, issueId: string) {
  return withTenant(tenantId, async (tx) => {
    const issue = await getNfIssueForProcessing(tx, tenantId, issueId);
    const providerKind: NfseProviderKind =
      (issue.nfse_provider_kind as NfseProviderKind) ??
      (await resolveNfseProviderKind(tx, issue.ibge_code));
    const prestadorCnpj = issue.internal_payload?.prestador?.cnpj;
    const credentials = await resolveNfseCredentials(
      tx,
      tenantId,
      providerKind,
      issue.ibge_code,
      { prestadorCnpj },
    );
    const provider = getNfseProvider(providerKind);
    return { provider, credentials, providerKind };
  });
}

export function startWorkers(): {
  emissionWorker: Worker<NfEmissionJob>;
  pollingWorker: Worker<NfEmissionJob>;
  webhookWorker: Worker<WebhookProcessingJob>;
} {
  const emissionWorker = new Worker<NfEmissionJob>(
    "nf-emission",
    async (job) => {
      const { provider, credentials, providerKind } = await loadEmissionContext(
        job.data.tenantId,
        job.data.issueId,
      );

      await withTenant(job.data.tenantId, (tx) =>
        processNfIssueLifecycle(
          tx,
          job.data.tenantId,
          job.data.issueId,
          provider,
          credentials,
          providerKind,
        ),
      );
      await enqueueNfPolling(job.data);
    },
    { connection: getRedisConnection() },
  );

  const pollingWorker = new Worker<NfEmissionJob>(
    "nf-polling",
    async (job) => {
      const { provider, credentials, providerKind } = await loadEmissionContext(
        job.data.tenantId,
        job.data.issueId,
      );

      const status = await withTenant(job.data.tenantId, async (tx) => {
        await processNfIssueLifecycle(
          tx,
          job.data.tenantId,
          job.data.issueId,
          provider,
          credentials,
          providerKind,
        );
        const [row] = await tx<{ status: string }[]>`
          SELECT status::text FROM exeq_core.nf_issue WHERE id = ${job.data.issueId}::uuid
        `;
        return row?.status;
      });

      if (status && !["authorized", "rejected", "cancelled", "failed"].includes(status)) {
        await enqueueNfPolling(job.data, 5000);
      }
    },
    { connection: getRedisConnection() },
  );

  const webhookWorker = new Worker<WebhookProcessingJob>(
    "webhook-inbox",
    async (job) => {
      await withTenant(job.data.tenantId, (tx) =>
        processWebhookInboxUntilTerminal(tx, job.data.tenantId, job.data.inboxId),
      );
    },
    { connection: getRedisConnection() },
  );

  return { emissionWorker, pollingWorker, webhookWorker };
}
