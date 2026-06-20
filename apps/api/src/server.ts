import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDb } from "./db/client.js";
import { startChannelDebounceFlushHandler } from "./modules/channel/channel-debounce-flush.handler.js";

if (env.CHANNEL_DEBOUNCE_SECONDS > 0) {
  startChannelDebounceFlushHandler();
}

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  });
}
