import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    reporters: "default",
    coverage: {
      reporter: ["text", "cobertura", "lcov"],
      provider: "v8",
      reportOnFailure: true,
      exclude: [...defaultExclude, "dist/**", "test/**"],
    },
    include: ["./test/**/*.test.ts"],
    maxConcurrency: 1,
    testTimeout: 120000,
  },
});
