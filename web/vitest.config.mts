import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname, "server-only": `${import.meta.dirname}/test/server-only.ts` } },
  test: { environment: "node", coverage: { reporter: ["text", "json-summary"] } },
});
