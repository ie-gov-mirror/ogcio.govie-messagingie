/// <reference types="vitest" />

import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    reporters: "default",
    setupFiles: "./vitest.setup.ts",
    coverage: {
      reporter: ["text", "cobertura", "lcov"],
      provider: "v8",
      reportOnFailure: true,
      // Without an explicit include, the denominator is only the files the
      // tests happened to load, so untested modules are invisible and the
      // percentage shifts with the environment. See ADR-0001.
      include: [
        "app/**/*.{ts,tsx}",
        "data/**/*.ts",
        "utils/**/*.ts",
        "const/**/*.ts",
      ],
      // Ratchet floors, set just under the measured numbers so they catch
      // regression rather than block the build. Raise them as coverage
      // grows. CI is the arbiter; verify these against the first CI run.
      // Measured locally: 82.1 lines / 82.4 statements / 85.4 functions /
      // 72.8 branches. Floors sit under the target (80/80/80/70) with margin
      // for local/CI skew; raise them once CI confirms the numbers.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
    deps: {
      optimizer: {
        web: {
          include: ["@ogcio/design-system-react"],
        },
      },
    },
    server: {
      deps: {
        // The design system barrel uses `import { debounce } from "lodash"`,
        // a named import from a CJS module that Node's ESM loader can't resolve.
        // Inlining lets Vite transform it with proper CJS interop.
        inline: [/@ogcio[/\\]design-system-react/],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  // Optimize dependencies to handle Next.js modules
  optimizeDeps: {
    exclude: ["next"],
  },
})
