import { startWorkers } from "./workers/queues.js";
import { env } from "./config/env.js";

const { emissionWorker, pollingWorker, webhookWorker } = startWorkers();

console.log(`NF emission + webhook workers started (FOCUS_MOCK=${env.FOCUS_MOCK})`);

async function shutdown() {
  await emissionWorker.close();
  await pollingWorker.close();
  await webhookWorker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
