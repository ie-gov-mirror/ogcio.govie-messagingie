import { readFileSync } from "node:fs"
import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

// Next loads apps/messaging-support/.env. Pull the same non-empty values so
// the session cookie is signed with the secret the running app verifies.
function applyLocalEnv() {
  let text: string
  try {
    text = readFileSync(path.join(__dirname, ".env"), "utf8")
  } catch {
    return
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq)
    if (key !== "COOKIE_SECRET" && key !== "BASE_URL") continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!value || process.env[key]) continue
    process.env[key] = value
  }
}

applyLocalEnv()

const baseURL = process.env.BASE_URL || "http://localhost:1337"

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  outputDir: "test-results/",
  reporter: [
    ["junit", { outputFile: "e2e/test-results/results.xml" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
