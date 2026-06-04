import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@llm-skills-poc/skill-runner": resolve(rootDir, "packages/skill-runner/src/index.ts"),
      "@llm-skills-poc/skill-spec": resolve(rootDir, "packages/skill-spec/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    testTimeout: 10_000
  }
});
