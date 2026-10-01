import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

// Use environment URL or fallback to local dev
// Must match the port the `dev` script binds (PORT=4002), otherwise the
// `webServer` block below polls a port nothing listens on.
const baseURL = process.env.BASE_URL || "http://localhost:4002"

// Reference: https://playwright.dev/docs/test-configuration
export default defineConfig({
  // A green run is ~10 minutes. The nightly runs six of these stages back to
  // back, so a suite that hangs must fail the stage early rather than sit on
  // the agent — build 121526 spent 58 minutes to report 5 failures.
  globalTimeout: 20 * 60 * 1000,
  expect: {
    timeout: 25000,
  },
  // A timed-out test gets a separate timeout for fixture/hook teardown.
  // Keep both windows short enough that one test cannot exhaust the suite.
  timeout: 60 * 1000,
  // Test directory
  testDir: path.join(__dirname, "e2e"),
  // One retry preserves a flaky-test signal without tripling its runtime.
  retries: 1,
  workers: 1,
  // Artifacts folder where screenshots, videos, and traces are stored.
  outputDir: "test-results/",
  //junit test results
  reporter: [
    ["junit", { outputFile: "e2e/test-results/results.xml" }], // JUnit report
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  // Run your local dev server before starting the tests:
  // https://playwright.dev/docs/test-advanced#launching-a-development-web-server-during-the-tests
  webServer: {
    command: "npm run dev",
    url: baseURL,
    timeout: 180 * 1000,
    reuseExistingServer: !process.env.CI,
  },

  use: {
    // Screenshot on test failure
    screenshot: "only-on-failure",
    // Record video on failure
    video: "retain-on-failure",
    // Use baseURL so to make navigations relative.
    // More information: https://playwright.dev/docs/api/class-testoptions#test-options-base-url
    baseURL,

    // Retry a test if its failing with enabled tracing. This allows you to analyze the DOM, console logs, network traffic etc.
    // More information: https://playwright.dev/docs/trace-viewer
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "Desktop Chrome",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    // {
    //   name: 'Desktop Firefox',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //   },
    // },
    // {
    //   name: 'Desktop Safari',
    //   use: {
    //     ...devices['Desktop Safari'],
    //   },
    // },
    // Test against mobile viewports.
    // {
    //   name: "Mobile Chrome",
    //   use: {
    //     ...devices["Pixel 5"],
    //   },
    // },
    // {
    //   name: "Mobile Safari",
    //   use: devices["iPhone 12"],
    // },
  ],
})
