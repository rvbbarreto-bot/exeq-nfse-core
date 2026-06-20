import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.unit.test.ts", "tests/**/*.unit.test.tsx", "tests/**/*.system.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      thresholds: {
        lines: 78,
        functions: 78,
        branches: 70,
        statements: 78,
      },
    },
  },
});
