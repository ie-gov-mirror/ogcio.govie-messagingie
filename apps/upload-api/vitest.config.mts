import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: "default",
    setupFiles: ["./src/test/setup-env.ts"],
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
      // Measured locally: 81.03 lines / 80.98 statements / 84.51 functions / 76.47 branches.
      // CI measured branches at 75.29, below the laptop figure, so the branch
      // floor sits under the CI number.
      //
      // These floors dropped ~3.5pt when openapi-definition.test.ts was added,
      // even though that test executes strictly more of src/ (it boots the real
      // app). @fastify/autoload imports the plugin files by absolute path, which
      // bypasses Vitest's module runner, so those modules are also loaded as
      // plain ESM; the v8 ranges that come back for them are merged with — and
      // drag down — the instrumented numbers the dedicated unit tests produce
      // for the same files (src/utils/clamav/*, utils/authentication-factory.ts,
      // plugins/api-auth.ts). It is a measurement artefact, not a loss of
      // coverage: those files' own tests still pass unchanged.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 84,
        branches: 74,
      },
      exclude: [
        ...defaultExclude,
        "src/test/**/*",
        ".**/**/*.js",
        ".**/**/*.ts",
        "db/**/*",
      ],
    },
    include: [
      "./src/@(test?(s)|__test?(s)__)/**/*.test.@(js|cjs|mjs|tap|cts|jsx|mts|ts|tsx)",
    ],
    exclude: [
      "./src/**/@(fixture*(s)|dist|node_modules)/**",
      "./src/**/*.integration.test.*",
    ],
    testTimeout: 60000,
  },
});
