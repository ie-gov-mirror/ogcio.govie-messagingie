import { type Browser, expect, test } from "@playwright/test"
import { urls } from "../fixtures"
import { createPageWithVideo } from "../helpers/browser-context"
import {
  setSafeLevel,
  setSafeLevelAndUser,
  waitForMockLoginForm,
} from "../helpers/user-auth.helper"
import { generateTestData } from "../utils/functions"

const PROFILE_URL = urls.profile
const DASHBOARD_URL = urls.dashboard

/**
 * Signs the same identity back in at level 2 from a new browser session, the
 * way a citizen returns after upgrading MyGovID.
 *
 * Do not reuse the gated tab. Its sessionStorage keeps `sag_onboarding_ts`
 * from the first login, so the onboarding guard holds the re-login on a
 * loading shell until 30s after that first redirect (traced on dev: 12s of a
 * 25s dialog wait). Logging out does not clear sessionStorage; a new
 * context does.
 */
async function signInUpgradedInFreshSession(browser: Browser, email: string) {
  const page = await createPageWithVideo(browser)
  await page.goto("/")
  await waitForMockLoginForm(page)
  await setSafeLevelAndUser(page, "2", email)
  return page
}

test.describe("User Messaging page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await waitForMockLoginForm(page)
  })

  test("a user with safe level 2 can create an account @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "2")
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("a user with safe level 1 cannot create a full account @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "1")
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
  })

  test("a user with safe level 0 cannot create a full account @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "0")
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
  })

  test("a user with safe level 1 can upgrade to safe level 2 to gain full access @regression", async ({
    page,
    browser,
  }) => {
    const { uuid } = generateTestData()
    const userEmail = `testAccount+${uuid}@mail.ie`
    await setSafeLevelAndUser(page, "1", userEmail)
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
    const upgraded = await signInUpgradedInFreshSession(browser, userEmail)
    await expect(upgraded.getByRole("dialog")).toBeVisible()
    await upgraded.context().close()
  })

  test("a user with safe level 0 can upgrade to safe level 2 to gain full access @regression", async ({
    page,
    browser,
  }) => {
    const { uuid } = generateTestData()
    const userEmail = `testAccount+${uuid}@mail.ie`
    await setSafeLevelAndUser(page, "0", userEmail)
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
    const upgraded = await signInUpgradedInFreshSession(browser, userEmail)
    await expect(upgraded.getByRole("dialog")).toBeVisible()
    await upgraded.context().close()
  })

  test("a user with safe level 2 can access the dashboard @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "2")
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.goto(`${DASHBOARD_URL}`)
    await expect(page.getByText("Your recent messages")).toBeVisible()
    // locator for dashboard when LEA is disabled  
    //await expect(page.getByText("Your messages")).toBeVisible()
  })

  test("a user with safe level 1 cannot access the dashboard @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "1")
    await page.goto(`${DASHBOARD_URL}`)
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
  })

  test("a user with safe level 0 cannot access the dashboard @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "0")
    await page.goto(`${DASHBOARD_URL}`)
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
  })

  test("a user with safe level 2 can access the profile @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "2")
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.goto(`${PROFILE_URL}`)
    await expect(
      page.getByText(
        "The information below includes everything we have sourced from your MyGovID and currently have on file.",
      ),
    ).toBeVisible()
  })

  test("a user with safe level 1 cannot access the profile @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "1")
    await page.goto(`${PROFILE_URL}`)
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
  })

  test("a user with safe level 0 cannot access the profile @regression", async ({
    page,
  }) => {
    await setSafeLevel(page, "0")
    // Prove L0 stuck on the messaging-side gate before the cross-zone hop;
    // build 116939 reached /en/my-profile instead, which only happens when
    // the hop runs against a session that is not actually gated.
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
    await page.goto(`${PROFILE_URL}`)
    await expect(
      page.getByRole("heading", {
        name: "Complete Your MyGovID Account Verification to Proceed",
      }),
    ).toBeVisible()
  })
})
