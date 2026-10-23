import type { Page } from "@playwright/test"
import { expect, test } from "@playwright/test"
import { urls, users } from "../fixtures"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"
import {
  navigateAndVerifyHeading,
  navigateAndVerifySearch,
} from "../utils/navigation-helpers"
import { expectSettledScreenshot } from "./visual-helpers"

let page: Page

const PROFILE_URL = urls.profileVisual
const DASHBOARD_URL = urls.dashboardVisual

test.describe("User Visual Regression", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createAuthenticatedPage(browser, users.citizen1.email)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("inbox visual snapshot @visual", async () => {
    await page.goto("/")
    await page.getByRole("textbox", { name: "Search" }).fill("1234567890")
    await page.getByRole("textbox", { name: "Search" }).press("Enter")
    await expectSettledScreenshot(page, "user-inbox.png")
  })

  /**
   * The three tests below leave the messaging zone, and `page.goto` resolves on
   * the first document of that hop — the SAG `/auth/sign-in?app=…` redirect —
   * not on the destination. Screenshotting straight after it therefore captures
   * whatever is on screen mid-bounce, which is why these failed on image *size*
   * (1280x784 against a 1280x1889 baseline) rather than on pixel diff.
   *
   * `b68677e9` removed the `networkidle` wait that had been absorbing the hop
   * without replacing it here, so the race has been live since. Wait on content
   * only the destination app renders instead, which is both what that commit
   * intended and what `a11y.spec.ts` already does for these same three URLs.
   */
  test("profile page visual snapshot @visual", async () => {
    await navigateAndVerifyHeading(page, `${PROFILE_URL}/en`, "My Profile")
    await expectSettledScreenshot(page, "user-profile.png")
  })

  test("dashboard page visual snapshot @visual", async () => {
    await navigateAndVerifyHeading(
      page,
      `${DASHBOARD_URL}/en/my-dashboard`,
      "Welcome back, E2E Citizen User",
    )
    await expectSettledScreenshot(page, "user-dashboard.png")
  })

  test("dashboard submissions page visual snapshot @visual", async () => {
    await navigateAndVerifySearch(
      page,
      `${DASHBOARD_URL}/en/my-submissions`,
      "Search",
    )
    await expectSettledScreenshot(page, "user-dashboard-submissions.png")
  })

  test("dashboard discovery page visual snapshot @visual", async () => {
    await navigateAndVerifyHeading(
      page,
      `${DASHBOARD_URL}/en/discovery`,
      "Life Events",
    )
    await expectSettledScreenshot(page, "user-dashboard-discovery.png")
  })

  test("dashboard discovery child starting school page visual snapshot @visual", async () => {
    await navigateAndVerifyHeading(
      page,
      `${DASHBOARD_URL}/en/discovery/child-starting-school`,
      "Child starting school",
    )
    await expectSettledScreenshot(page, "user-dashboard-discovery-child-starting-school.png")
  })
})
