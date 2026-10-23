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

test.describe("User Visual Regression - Mobile View", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createAuthenticatedPage(browser, users.citizen1.email)
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 }) // iPhone X dimensions
  })

  test.afterAll(async () => {
    await page.context().clearCookies() // Clear cookies to reset state for other tests
    await page.close()
  })

  test("inbox visual snapshot - Mobile View @visual", async () => {
    await page.goto("/")
    await page.getByRole("textbox", { name: "Search" }).fill("1234567890")
    await page.getByRole("textbox", { name: "Search" }).press("Enter")
    await expectSettledScreenshot(page, "user-inbox-mobile.png")
  })

  test("profile page visual snapshot - Mobile View @visual", async () => {
    await navigateAndVerifyHeading(page, `${PROFILE_URL}/en`, "My Profile")
    await expectSettledScreenshot(page, "user-profile-mobile.png")
  })

  test("dashboard page visual snapshot - Mobile View @visual", async () => {
    await navigateAndVerifyHeading(
      page,
      `${DASHBOARD_URL}/en/my-dashboard`,
      "Welcome back, E2E Citizen User",
    )
    await expectSettledScreenshot(page, "user-dashboard-mobile.png")
  })

  test("dashboard submissions page visual snapshot - Mobile View @visual", async () => {
    await navigateAndVerifySearch(
      page,
      `${DASHBOARD_URL}/en/my-submissions`,
      "Search",
    )
    await expectSettledScreenshot(page, "user-dashboard-submissions-mobile.png")
  })

  test("dashboard discovery page visual snapshot - Mobile View @visual", async () => {
    await navigateAndVerifyHeading(
      page,
      `${DASHBOARD_URL}/en/discovery`,
      "Life Events",
    )
    await expectSettledScreenshot(page, "user-dashboard-discovery-mobile.png")
  })         
  
  test("dashboard discovery child starting school page visual snapshot - Mobile View @visual", async () => {
    await navigateAndVerifyHeading(
      page,
      `${DASHBOARD_URL}/en/discovery/child-starting-school`,
      "Child starting school",
    )
    await expectSettledScreenshot(page, "user-dashboard-discovery-child-starting-school-mobile.png")
  })    
})
