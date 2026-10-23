import { expect, type Page, test } from "@playwright/test"
import { ids, urls, users } from "../fixtures"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"
import { navigateAndVerifySearch } from "../utils/navigation-helpers"

const BASE_URL = urls.messaging
const DASHBOARD_URL = urls.dashboard

let page: Page

test.describe("User Messages page", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createAuthenticatedPage(browser, users.peterParker.email)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("a user can open a message @smoke @regression", async () => {
    await navigateAndVerifySearch(page, "/en/messages", "Search")
    await page.getByRole("textbox", { name: "Search" }).fill("test")
    await page.getByRole("textbox", { name: "Search" }).press("Enter")
    await page
      .getByRole("row")
      .filter({
        has: page.getByRole("link", { name: "Test Subject", exact: true }),
      })
      .first()
      .getByRole("link", { name: "Test Subject", exact: true })
      .click()
    await expect(
      page.getByRole("heading", { name: "Test Subject" }),
    ).toBeVisible()
    await expect(page.getByText("Test rich text")).toBeVisible()
  })

  test("a user can open a message attachment @smoke @regression", async () => {
    // Skip the /secure-messages hop: that page only redirects into the unified
    // detail view once the ownership check finishes, and waiting on the
    // attachment action there burns the whole timeout on a loading shell.
    await page.goto(`/en/messages?id=${ids.secureMessage}`)
    const preview = page.getByTestId("attachment-preview-action")
    await expect(preview).toBeVisible()
    const [newPage] = await Promise.all([
      page.context().waitForEvent("page"),
      preview.click(),
    ])
    await newPage.waitForLoadState("domcontentloaded")
    await expect(newPage.getByText("46546546546546")).toBeVisible()
  })

  test("a user can download a message attachment @smoke @regression", async () => {
    await page.goto(`/en/messages?id=${ids.secureMessage}`)
    const downloadAction = page.getByTestId("attachment-download-action")
    await expect(downloadAction).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await downloadAction.click()
    const download = await downloadPromise

    await download.saveAs(`downloads/${download.suggestedFilename()}`)

    const path = await download.path()
    expect(path).not.toBeNull()
  })

  test("a user can access a recent message from the dashboard @regression", async () => {
    await page.goto(`${DASHBOARD_URL}/en/my-dashboard`)
    await expect(
      page.getByRole("heading", { name: "Welcome back, Toby Tobyson" }),
    ).toBeVisible()
    //wait for no new messages to be removed
    await page.waitForSelector("text=No new messages", { state: "detached" })
    await page.getByText("View all messages").click()
    await expect(page.url()).toContain(`${BASE_URL}`)
  })
})
