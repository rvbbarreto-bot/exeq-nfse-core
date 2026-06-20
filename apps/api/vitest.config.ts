import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: path.join(rootDir, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "src/**/*.unit.test.ts",
      "../../packages/shared/tests/**/*.unit.test.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    env: {
      NF_SYNC_PROCESSING: "true",
      FOCUS_MOCK: "true",
      WEBHOOK_SYNC_PROCESSING: "true",
      GATEWAY_SYNC_PROCESSING: "false",
    },
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/modules/fiscal/catalog-import.mapper.ts",
        "src/modules/fiscal/tax-resolve.mapper.ts",
        "../../packages/shared/src/**/*.ts",
      ],
      exclude: ["**/*.unit.test.ts", "**/index.ts"],
      thresholds: {
        lines: 78,
        functions: 78,
        branches: 70,
        statements: 78,
      },
    },
  },
});
