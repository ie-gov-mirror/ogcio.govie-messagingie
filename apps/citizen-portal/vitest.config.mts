import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defaultExclude, defineConfig } from "vitest/config"

/**
 * Vitest configuration for the unified citizen-portal app.
 *
 * Includes the browser-test provider so the `*.browser.test.*` files
 * keep working when invoked with `--browser`; they remain excluded
 * from the default `pnpm test` run via the VITEST_BROWSER toggle.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // Vitest only defaults this when the shell hasn't set it, and a shell
    // exporting "development" makes useIdleMount defer work under test.
    env: { NODE_ENV: "test" },
    globals: true,
    environment: "jsdom",
    reporters: "default",
    setupFiles: "./test/vitest.setup.ts",
    coverage: {
      reporter: ["text", "cobertura", "lcov"],
      provider: "v8",
      reportOnFailure: true,
      include: ["src/**/*.ts", "src/**/*.tsx"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
      exclude: [...defaultExclude, "**/*.test.*", "test/**"],
    },
    include: [
      "**/@(test?(s)|__test?(s)__)/**/*.test.@(js|cjs|mjs|tap|cts|jsx|mts|ts|tsx)",
      "**/*.@(test?(s)|spec).@(js|cjs|mjs|tap|cts|jsx|mts|ts|tsx)",
      "**/test?(s).@(js|cjs|mjs|tap|cts|jsx|mts|ts|tsx)",
    ],
    exclude: [
      "**/@(fixture*(s)|dist|node_modules)/**",
      "e2e/**",
      "zones/**",
      ...(process.env.VITEST_BROWSER !== "true" ? ["**/*.browser.test.*"] : []),
    ],
    maxConcurrency: 1,
    testTimeout: 30000,
    server: {
      deps: {
        // The design system barrel uses `import { debounce } from "lodash"`,
        // a named import from a CJS module that Node's ESM loader can't resolve.
        // Inlining lets Vite transform it with proper CJS interop.
        // nextjs-analytics imports `./AnalyticsProvider` (a .jsx file) without
        // an extension, which Node can't resolve; Vite can. Tests render
        // through its real `AnalyticsContext` (test/utils/analytics.tsx).
        // sag-client's entry has the same extensionless imports; inlining lets
        // tests use its real navigation-abort check.
        inline: [
          /@ogcio[/\\]sag-client/,
          /@ogcio[/\\]design-system-react/,
          /@ogcio[/\\]nextjs-analytics/,
        ],
      },
    },
    browser: {
      enabled: false,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
  resolve: {
    alias: {
      // Mirror tsconfig `paths`: the more specific `@/public/*` -> ./public/*
      // must precede the catch-all `@/*` -> ./src/* so static assets
      // imported as `@/public/...` resolve (vite matches aliases in order).
      "@/public/": new URL("./public/", import.meta.url).pathname,
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    exclude: ["next", "next-intl"],
  },
})
