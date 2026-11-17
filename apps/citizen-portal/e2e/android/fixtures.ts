import { execFileSync } from "node:child_process"
import {
  _android,
  type Browser,
  type BrowserContext,
  type Page,
  test as base,
} from "@playwright/test"

/**
 * Fixtures for the opt-in `android` project: tests run in Chrome on the
 * first Android emulator adb lists, against the stack on the host.
 *
 *   emulator Chrome                          host
 *   messaging.local.test:4001 ─┐
 *     (host resolver rule)     ├─ 127.0.0.1:P ── adb reverse ── localhost:P
 *   localhost:3301 ────────────┘
 *
 * `browser` is an adapter over the emulator's single context:
 *
 *   browser.newContext()  clears storage and routes, returns that context
 *   context.newPage()     returns Chrome's foreground tab
 *   close()               does nothing
 *
 * Specs that open a context or a page through `browser`, `context` or `page`
 * run unchanged. Specs holding two sessions at once cannot, and the `android`
 * project ignores them. On any other project this `test` is Playwright's own.
 */

/** Name of the Playwright project that runs on the emulator. */
const ANDROID_PROJECT = "android"

/** Host ports the emulator reaches: portals, gateway, Logto, MyGovID mock. */
const HOST_PORTS = [4001, 4002, 3333, 3301, 4005]

/**
 * Sends workspace host names to the emulator's loopback, keeping them in
 * cookies and Host headers. Quoted: Playwright writes Chrome's arguments to
 * its command-line file joined by spaces.
 */
const HOST_RESOLVER_RULES = '--host-resolver-rules="MAP *.local.test 127.0.0.1"'

/** Wraps `target`, replacing the members in `overrides`. */
function withOverrides<T extends object>(
  target: T,
  overrides: Record<string, unknown>,
): T {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in overrides) {
        return overrides[prop as string]
      }

      const value = Reflect.get(obj, prop, obj)
      return typeof value === "function" ? value.bind(obj) : value
    },
  })
}

type Stub = Parameters<Page["unroute"]>

/** Stubs of the previous tests: the tab outlives them. */
const stubs: Stub[] = []

/**
 * Removes recorded stubs one by one. `unrouteAll` would be shorter, but it
 * leaves the emulator's tab closing on its next navigation.
 */
async function dropStubs(page: Page): Promise<void> {
  for (const stub of stubs.splice(0)) {
    await page.unroute(...stub)
  }
}

/** Chrome's foreground tab: a tab opened over CDP stays in the background, where clicks wait forever. */
async function foregroundPage(context: BrowserContext): Promise<Page> {
  const [existing] = context.pages()
  const page = existing ?? (await context.newPage())
  await dropStubs(page)

  // Settle the previous test's navigation, which would abort the next goto
  await page.goto("about:blank")

  return withOverrides(page, {
    close: async () => {},
    route: (...stub: Parameters<Page["route"]>) => {
      stubs.push([stub[0], stub[1]])
      return page.route(...stub)
    },
  })
}

/** The single context, as a fresh one: nothing signed in, nothing stubbed. */
function freshContext(context: BrowserContext): BrowserContext {
  return withOverrides(context, {
    newPage: () => foregroundPage(context),
    close: async () => {},
  })
}

/** Starts the forwarding, opens Chrome and returns the adapter. */
async function openAndroid(baseURL: string | undefined) {
  for (const port of HOST_PORTS) {
    execFileSync("adb", ["reverse", `tcp:${port}`, `tcp:${port}`])
  }

  const [device] = await _android.devices()
  if (!device) {
    throw new Error("No Android emulator found: start one first")
  }

  const context = await device.launchBrowser({
    baseURL,
    args: [HOST_RESOLVER_RULES],
  })

  const browser = {
    newContext: async () => {
      // The emulator's Chrome profile persists: a session left by an
      // earlier run or test would skip sign-in
      await context.setStorageState({ cookies: [], origins: [] })

      return freshContext(context)
    },
    newPage: async () => foregroundPage(context),
    contexts: () => [context],
    close: async () => {},
    // Read by the test runner for remote browsers; none here
    _connection: {},
  } as unknown as Browser

  return {
    browser,
    close: async () => {
      await context.close()
      await device.close()
    },
  }
}

export const test = base.extend<object, { browser: Browser }>({
  browser: [
    async ({ browser }, use, workerInfo) => {
      if (workerInfo.project.name !== ANDROID_PROJECT) {
        await use(browser)
        return
      }

      const android = await openAndroid(workerInfo.project.use.baseURL)
      await use(android.browser)
      await android.close()
    },
    { scope: "worker" },
  ],
})
