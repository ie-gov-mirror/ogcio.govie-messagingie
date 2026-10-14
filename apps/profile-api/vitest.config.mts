import path from "node:path";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: "default",
    coverage: {
      reporter: ["text", "cobertura", "lcov"],
      provider: "v8",
      reportOnFailure: true,
      // Without an explicit include, the denominator is only the files the
      // tests happened to load, so untested modules are invisible and the
      // percentage shifts with the environment.
      include: ["src/**/*.ts"],
      // Ratchet floors, set below the measured numbers so they catch
      // regression rather than block the build. Raise them as coverage grows.
      // Measured locally: ~85.3 lines / ~85.2 statements / ~83.4 functions /
      // ~77.9 branches. CI is the arbiter: CI measured branches at 67.43%
      // for that same commit (a ~10.4pt local/CI branch skew; lines,
      // statements and functions passed their floors), so the branches floor
      // sits just under the CI-measured value.
      thresholds: {
        lines: 83,
        statements: 83,
        functions: 80,
        branches: 66,
      },
      exclude: [
        ...defaultExclude,
        "src/test/**/*",
        "src/db/**/*",
        "src/migrations/**/*",
        "**/.yalc/**/*",
      ],
    },
    include: [
      "./src/@(test?(s)|__test?(s)__)/**/*.test.@(js|cjs|mjs|tap|cts|jsx|mts|ts|tsx)",
    ],
    exclude: ["./src/**/@(fixture*(s)|dist|node_modules)/**"],
    maxConcurrency: 5,
    testTimeout: 30000, // Timeout in milliseconds (30 seconds)
    globalSetup: "./src/test/setup-tests.ts",
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
