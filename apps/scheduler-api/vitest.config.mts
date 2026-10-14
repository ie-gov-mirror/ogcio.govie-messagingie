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
      // Measured locally: 98.89 lines / 98.91 statements / 97.22 functions / 95.45 branches.
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 92,
        branches: 90,
      },
      exclude: [
        ...defaultExclude,
        "src/test/**/*",
        ".**/**/*.js",
        ".**/**/*.ts",
        "db/**/*",
        "src/db/**/*",
        // Migration tooling needs a live database; sibling apps
        // (messaging-api, profile-api) exclude it the same way.
        "src/migrations/**/*",
        // Side-effect-at-import entrypoints (app.listen / process.exit):
        // testing them means mocking every line. Their logic lives in
        // app.ts, worker.ts, cleanup-db.ts and migrate.ts, which are tested.
        "src/index.ts",
        "src/scripts/ci-job.ts",
        "src/scripts/cronjob.ts",
      ],
    },
    include: [
      "./src/@(test?(s)|__test?(s)__)/**/*.test.@(js|cjs|mjs|tap|cts|jsx|mts|ts|tsx)",
    ],
    exclude: ["./src/**/@(fixture*(s)|dist|node_modules)/**"],
    testTimeout: 30000,
  },
});
