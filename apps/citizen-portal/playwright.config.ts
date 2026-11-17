import path from "node:path"
import { defineConfig, devices } from "@playwright/test"
import dotenv from "dotenv"

// Read from ".env" file.
dotenv.config({ path: path.resolve(__dirname, ".env") })

/**
 * Playwright configuration for the unified citizen-portal app.
 *
 * The unified app serves all three sections (messages, profile,
 * dashboard) from one nginx instance, so a single BASE_URL is
 * sufficient. CI scripts continue to set BASE_URL explicitly; the
 * local fallback points at the unified dev server (`pnpm dev` -> :4001).
 */
const baseURL = process.env.BASE_URL || "http://messaging.local.test:4001"

/**
 * Suppress the next-dev webServer when targeting the local docker harness
 * (BASE_URL=messaging.local.test:...). The docker container is already
 * serving every hostname, so we don't want playwright to also boot
 * `next dev` on :4001 and race with it.
 */
const isDockerHarness = /local\.test/.test(baseURL)

/**
 * Specs that only pass behind the docker harness's nginx (port 8080, host
 * redirects). A run against another stack sets E2E_SKIP_NGINX_ONLY to skip
 * them; the docker harness leaves it unset and runs them.
 */
const nginxOnlySpecs = /\/e2e\/smoke\/canonicalisation\.spec\.ts$/
const skipNginxOnly = Boolean(process.env.E2E_SKIP_NGINX_ONLY)

/** Specs ignored by every project of the current run. */
const ignoredSpecs = skipNginxOnly ? [nginxOnlySpecs] : []

/** Specs that need an Android emulator; only the `android` project runs them. */
const androidSpecs = /\/e2e\/android\/.*\.spec\.ts$/

/**
 * Specs the `android` project skips: the emulator has one browser context.
 *   user-new-users          signs in a second session while the first is open
 *   user-receive-messages   signs in as a public servant and as a citizen
 *   user-link-account       signs in as a public servant and as a citizen
 *   user-messaging          opens an attachment in a second tab
 */
const twoSessionSpecs =
  /\/e2e\/user\/user-(new-users|receive-messages|link-account|messaging)\.spec\.ts$/

export default defineConfig({
  globalTimeout: 3480000, // 58 minutes
  expect: {
    timeout: 25000,
  },
  timeout: 180 * 1000,
  testDir: path.join(__dirname, "e2e"),
  retries: 2,
  workers: 1,
  outputDir: "test-results/",
  reporter: [
    ["junit", { outputFile: "e2e/test-results/results.xml" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  webServer: isDockerHarness
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        timeout: 180 * 1000,
        reuseExistingServer: !process.env.CI,
      },

  use: {
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    baseURL,
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "Desktop Chrome",
      testIgnore: [androidSpecs, ...ignoredSpecs],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    /**
     * On-demand only — run it with `pnpm test:e2e:webkit:smoke`.
     *
     * The nightly scripts pin `--project='Desktop Chrome'` deliberately. The
     * Openshift agent image ships Chromium's shared libraries but not
     * WebKit's (libgstreamer, libgtk-4, libgraphene, libflite…), and the
     * pipeline's `playwright install` step already warns about them at
     * install time. WebKit therefore dies in `browserType.launch` before it
     * can assert anything, so including it in CI bought a guaranteed failure
     * and no signal. Putting it back in the nightly needs those libraries
     * baked into the agent image — `playwright install --with-deps` cannot do
     * it from the job, which runs unprivileged and cannot apt-get.
     */
    {
      name: "Desktop WebKit",
      testMatch: /user-message-mark-as-read\.spec\.ts/,
      testIgnore: ignoredSpecs,
      use: {
        ...devices["Desktop Safari"],
      },
    },
    // Mobile emulation, opt-in: run only when picked with `--project`.
    {
      name: "Mobile Chrome",
      default: false,
      testIgnore: [androidSpecs, ...ignoredSpecs],
      use: devices["Pixel 9"],
    },
    {
      name: "Mobile Safari",
      default: false,
      testIgnore: [androidSpecs, ...ignoredSpecs],
      use: devices["iPhone 16"],
    },
    /**
     * Opt-in only: `--project=android`. Runs the `@mobile` tests in Chrome on
     * a running Android emulator; e2e/android/fixtures.ts drives it. Artifacts
     * are off until capture from the emulator's single context is proven.
     */
    {
      name: "android",
      default: false,
      grep: /@mobile/,
      testIgnore: [twoSessionSpecs, ...ignoredSpecs],
      use: {
        screenshot: "off",
        video: "off",
        trace: "off",
      },
    },
  ],
})
