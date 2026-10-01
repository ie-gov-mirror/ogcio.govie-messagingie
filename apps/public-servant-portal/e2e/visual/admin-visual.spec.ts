import { expect, type Page, test } from "@playwright/test"
import { templates, urls } from "../fixtures"
import { authenticateUser } from "../helpers/auth"
import { createPageWithVideo } from "../helpers/browser-context"
import { navigateAndVerifyHeading } from "../utils/navigation-helpers"

let page: Page
const maxDiff = 0.02

const ADMIN_URL = urls.admin
const SERVICE_USERS_URL = `${urls.profileAdmin}/service-users`

const paginationButtons = (p: Page) =>
  p.getByRole("button", { name: /Go to page|Previous|Next/i })

async function goToProfileAdminServiceUsers(p: Page) {
  await p.goto(SERVICE_USERS_URL)
  // Cross-host hop can still be mid-SAG callback (build 118218 retry #1).
  await p.waitForURL(
    (url) =>
      url.hostname.includes("profile-admin") &&
      url.pathname.includes("/service-users"),
  )
  await expect(p.getByRole("heading", { name: /service users/i })).toBeVisible()
}

test.describe("Admin Visual Regression", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createPageWithVideo(browser)
    await authenticateUser(page)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("admin send a message page visual snapshot @visual", async () => {
    await page.goto(`${ADMIN_URL}/en`)
    await page.selectOption("select#template-select", templates.e2e)
    await expect(page).toHaveScreenshot("admin-send-message.png", {
      fullPage: true,
      maxDiffPixelRatio: maxDiff,
    })
  })

  test("admin message templates page visual snapshot @visual", async () => {
    await page.goto(`${ADMIN_URL}/en/message-templates`)
    await expect(page).toHaveScreenshot("admin-message-templates.png", {
      mask: [await page.locator("table")],
      maskColor: "white",
      maxDiffPixelRatio: maxDiff,
    })
  })

  test("admin event log page visual snapshot @visual", async () => {
    await navigateAndVerifyHeading(
      page,
      `${ADMIN_URL}/en/message-events`,
      "Event log",
    )
    await expect(page.locator("table")).toBeVisible()
    await expect(page).toHaveScreenshot("admin-event-log.png", {
      mask: [page.locator("table"), paginationButtons(page)],
      maskColor: "white",
      maxDiffPixelRatio: maxDiff,
    })
  })

  test("admin help page visual snapshot @visual", async () => {
    await page.goto(`${ADMIN_URL}/en/help`)
    await expect(page).toHaveScreenshot("admin-help.png", {
      fullPage: true,
      maxDiffPixelRatio: maxDiff,
    })
  })

  test("admin profile page visual snapshot @visual", async () => {
    await navigateAndVerifyHeading(
      page,
      `${urls.profileAdmin}/my-profile`,
      "My Profile",
    )
    await expect(page).toHaveScreenshot("admin-profile.png", {
      fullPage: true,
      maxDiffPixelRatio: maxDiff,
    })
  })

  /*Disabled due to flakyness, needs investigation
  test("admin providers page visual snapshot @visual", async () => {
    await page.goto(`${ADMIN_URL}/en/providers`)
    await expect(page).toHaveScreenshot("admin-providers.png", {
      fullPage: true,
      mask: [await page.locator("table")],
      maskColor: "white",
      maxDiffPixelRatio: maxDiff,
    })
  })*/

  test("admin service users page visual snapshot @visual", async () => {
    await goToProfileAdminServiceUsers(page)
    await expect(page).toHaveScreenshot("admin-service-users.png", {
      mask: [page.locator("table"), paginationButtons(page)],
      maskColor: "white",
      maxDiffPixelRatio: maxDiff,
    })
  })

  test("admin service users page Imports tab visual snapshot @visual", async () => {
    await goToProfileAdminServiceUsers(page)
    await page.getByText("Imports").click()
    await expect(page).toHaveScreenshot("admin-service-users-imports.png", {
      fullPage: true,
      mask: [page.locator("table")],
      maskColor: "white",
      maxDiffPixelRatio: maxDiff,
    })
  })

  test("admin service users page Import CSV tab visual snapshot @visual", async () => {
    await goToProfileAdminServiceUsers(page)
    await page.getByText("Import CSV").click()
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible()
    await expect(page).toHaveScreenshot("admin-service-users-import-csv.png", {
      fullPage: true,
      mask: [page.locator("table")],
      maskColor: "white",
      maxDiffPixelRatio: maxDiff,
    })
  })
})
