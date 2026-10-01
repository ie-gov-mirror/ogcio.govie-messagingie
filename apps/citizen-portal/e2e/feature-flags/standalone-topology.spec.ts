import { expect, type Page, test } from "@playwright/test"
import { users } from "../fixtures"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"
import { appNav } from "../utils/navigation-helpers"

/**
 * Standalone-topology e2e (AB#39580): "MessagingIE + Profile, no
 * Dashboard".
 *
 * Build-time `NEXT_PUBLIC_ENABLE_*` flags are baked at dev-server start,
 * so this spec only makes sense against the dedicated dev server booted
 * by `playwright.flags.config.ts` (which sets `ENABLE_DASHBOARD=false`).
 * The `CITIZEN_PORTAL_FLAGS_E2E` guard skips it under the default harness
 * (where dashboard is enabled), so it never runs against the wrong build.
 */
test.skip(
  !process.env.CITIZEN_PORTAL_FLAGS_E2E,
  "Runs only under playwright.flags.config.ts (dashboard disabled).",
)

let page: Page

test.describe("Feature flags — MessagingIE + Profile, Dashboard disabled", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createAuthenticatedPage(browser, users.citizen1.email)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("a direct visit to /my-dashboard redirects to the messages landing", async () => {
    await page.goto("/en/my-dashboard")
    // Dashboard zone is absent: the route guard steers to the first
    // enabled landing zone (messages) instead of rendering the dashboard.
    await expect(page).toHaveURL(/\/en\/messages/)
  })

  test("the menu drops the Dashboard link but keeps Messages", async () => {
    await page.goto("/en/messages")
    const nav = await appNav(page)
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveCount(0)
    await expect(nav.getByRole("link", { name: "Messages" })).toBeVisible()
  })
})
