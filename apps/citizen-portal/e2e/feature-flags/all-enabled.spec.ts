import { expect, type Page, test } from "@playwright/test"
import { users } from "../fixtures"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"
import { appNav } from "../utils/navigation-helpers"

/**
 * Default deployment (every zone/integration enabled) — the regression
 * guard for AB#39580. Confirms that the feature-flag plumbing leaves the
 * fully-flagged experience intact: both cross-zone links are present and
 * the dashboard ships the recent-messages widget.
 *
 * The disabled-topology variants are exercised by
 * `standalone-topology.spec.ts` under `playwright.flags.config.ts`, which
 * boots a dev server with the flags switched off.
 */
let page: Page

test.describe("Feature flags — fully enabled deployment", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createAuthenticatedPage(browser, users.citizen1.email)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("the dashboard ships the recent-messages widget @regression", async () => {
    await page.goto("/en/my-dashboard")
    await expect(page.getByText("Your recent messages")).toBeVisible()
    await expect(page.getByText("View all messages")).toBeVisible()
  })

  test("the menu exposes both cross-zone links @regression", async () => {
    await page.goto("/en/my-dashboard")
    const nav = await appNav(page)
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Messages" })).toBeVisible()
  })
})
