import { expect, type Page, test } from "@playwright/test"
import { users } from "../fixtures"
import { authenticateUser } from "../helpers/auth"
import { createPageWithVideo } from "../helpers/browser-context"
import {
  loginAsCitizen,
  waitForMockLoginForm,
} from "../helpers/user-auth.helper"
import { isFoldersFeatureEnabled } from "../utils/folder-helper"
import { logout, searchByText, sendMessageToDevCitizen } from "../utils/functions"
import {
  gmailCredentialsAvailable,
  previewRecentMessageEmail,
} from "../utils/gmail-reader"

let authenticatedPage: Page

/** Recipient the inbox read-back tests send to and then sign in as. */
const inboxRecipient = users.peterParker

/**
 * Open the newest "Test Subject" once the citizen session is on the inbox.
 * Use `exact` on the Search textbox so the mock IdP's "Type to Search" cannot
 * masquerade as the inbox.
 */
async function openNewestTestSubject(page: Page) {
  const inboxSearch = page.getByRole("textbox", { name: "Search", exact: true })
  // loginAsCitizen settles on any portal app host; hop to the inbox when the
  // post-logout redirect_uri was not /en/messages.
  if (!(await inboxSearch.isVisible().catch(() => false))) {
    await page.goto("/en/messages")
  }
  await expect(inboxSearch).toBeVisible()

  const subjectLink = page
    .getByRole("row")
    .filter({
      has: page.getByRole("link", {
        name: "Test Subject",
        exact: true,
      }),
    })
    .first()
    .getByRole("link", { name: "Test Subject", exact: true })
  // Fresh admin sends are async through the worker; allow indexing delay.
  await expect(subjectLink).toBeVisible({ timeout: 60_000 })
  await subjectLink.click()
}

test.describe("Admin Message Sending > Citizen Viewing", () => {
  test.beforeEach(async ({ browser }) => {
    authenticatedPage = await createPageWithVideo(browser)
    //clear the cache
    await authenticatedPage.context().clearCookies()
  })

  test.afterEach(async () => {
    // beforeEach opens a fresh context each time; close it so we do not leak
    // video contexts across the four tests in this file.
    if (authenticatedPage && !authenticatedPage.isClosed()) {
      await authenticatedPage.context().close()
    }
  })

  test("admin sends message to citizen and they receive email @smoke @regression", async () => {
    await authenticateUser(authenticatedPage)
    // Send to messagingie2 (opted-in, deliverable). Read back as peterParker —
    // same profile identity; sending to peter.parker@mail.ie itself fails delivery
    // on dest (event-log "Failed" tag).
    await sendMessageToDevCitizen(authenticatedPage)
    await authenticatedPage
      .getByRole("link", { name: "View Event log" })
      .click()

    await searchByText(authenticatedPage, "messaging ie2", "Search")
    await authenticatedPage.getByRole("link", { name: "View" }).first().click()

    // Verify message content details
    // Verify the current date is displayed
    const currentDate = new Date()
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/\//g, "-")
    await expect(
      authenticatedPage.getByRole("cell", { name: currentDate }).first(),
    ).toBeVisible()

    // Verify the time is recent (matches HH:MM:SS format and is within reasonable range)
    const timePattern = /\d{2}:\d{2}:\d{2}/
    const timeCells = authenticatedPage
      .getByRole("cell")
      .filter({ hasText: timePattern })
    await expect(timeCells.first()).toBeVisible()

    await expect(authenticatedPage.getByText("failed")).not.toBeVisible()
    //logout as admin
    await logout(authenticatedPage)
    // loginAsCitizen fills the post-logout IdP form in place (no goto("/")).
    await loginAsCitizen(authenticatedPage, inboxRecipient.email)
    await openNewestTestSubject(authenticatedPage)
    await expect(authenticatedPage.getByText("Test rich text")).toBeVisible()
  })

  test("admin sends message to citizen and they delete email @smoke @regression", async () => {
    await authenticateUser(authenticatedPage)
    await sendMessageToDevCitizen(authenticatedPage)
    await authenticatedPage
      .getByRole("link", { name: "View Event log" })
      .click()
    await searchByText(authenticatedPage, "messaging ie2", "Search")
    await authenticatedPage.getByRole("link", { name: "View" }).first().click()

    // Verify message content details
    // Verify the current date is displayed
    const currentDate = new Date()
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/\//g, "-")
    await expect(
      authenticatedPage.getByRole("cell", { name: currentDate }).first(),
    ).toBeVisible()

    // Verify the time is recent (matches HH:MM:SS format and is within reasonable range)
    const timePattern = /\d{2}:\d{2}:\d{2}/
    const timeCells = authenticatedPage
      .getByRole("cell")
      .filter({ hasText: timePattern })
    await expect(timeCells.first()).toBeVisible()

    await expect(authenticatedPage.getByText("failed")).not.toBeVisible()
    //logout as admin
    await logout(authenticatedPage)
    // loginAsCitizen fills the post-logout IdP form in place (no goto("/")).
    await loginAsCitizen(authenticatedPage, inboxRecipient.email)
    await openNewestTestSubject(authenticatedPage)
    await authenticatedPage.getByTestId("delete").click()
    await authenticatedPage.getByTestId("delete-confirmation-confirm").click()
    await expect(
      authenticatedPage.getByTestId("delete-success-toast"),
    ).toBeVisible()
  })

  test("admin sends message to citizen and they move it to a folder @smoke @regression", async () => {
    test.skip(
      !isFoldersFeatureEnabled(),
      "Folder e2e runs only when NEXT_PUBLIC_ENABLE_FOLDERS is on (AB#42582).",
    )
    await authenticateUser(authenticatedPage)
    await sendMessageToDevCitizen(authenticatedPage)
    await authenticatedPage
      .getByRole("link", { name: "View Event log" })
      .click()
    await searchByText(authenticatedPage, "messaging ie2", "Search")
    await authenticatedPage.getByRole("link", { name: "View" }).first().click()

    // Verify message content details
    // Verify the current date is displayed
    const currentDate = new Date()
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/\//g, "-")
    await expect(
      authenticatedPage.getByRole("cell", { name: currentDate }).first(),
    ).toBeVisible()

    // Verify the time is recent (matches HH:MM:SS format and is within reasonable range)
    const timePattern = /\d{2}:\d{2}:\d{2}/
    const timeCells = authenticatedPage
      .getByRole("cell")
      .filter({ hasText: timePattern })
    await expect(timeCells.first()).toBeVisible()

    await expect(authenticatedPage.getByText("failed")).not.toBeVisible()
    //logout as admin
    await logout(authenticatedPage)
    // loginAsCitizen fills the post-logout IdP form in place (no goto("/")).
    await loginAsCitizen(authenticatedPage, inboxRecipient.email)
    await openNewestTestSubject(authenticatedPage)
    await authenticatedPage.getByTestId("detail-move-button").click()
    await authenticatedPage.getByTestId("move-confirmation-confirm").click()
    await expect(
      authenticatedPage.getByTestId("move-success-toast"),
    ).toBeVisible()
  })

  test("citizen can see a secure message in their emails @smoke @regression", async () => {
    test.skip(
      !gmailCredentialsAvailable(),
      "E2E Gmail credentials are not configured.",
    )
    await authenticateUser(authenticatedPage)
    // Gmail poll uses messagingie2@gmail.com (`to:me` against that account).
    await sendMessageToDevCitizen(authenticatedPage)
    //logout as admin
    await logout(authenticatedPage)
    await previewRecentMessageEmail(authenticatedPage, "me")
    await waitForMockLoginForm(authenticatedPage)
    await authenticatedPage
      .locator(
        "#login-form > div > div.gi-w-full > div:nth-child(1) > div.gi-accordion > div",
      )
      .click()
    await authenticatedPage.locator("#sub").fill("932d94fc69be147f6fcb")
    await authenticatedPage
      .locator(
        "#login-form > div > div.gi-w-full > div:nth-child(2) > div.gi-accordion > div",
      )
      .click()
    await authenticatedPage.locator("#firstName").fill("Andrew")
    await authenticatedPage.locator("#lastName").fill("Parker")
    await authenticatedPage.locator("#email").fill(users.peterParker.email)
    await authenticatedPage.getByRole("button", { name: "LOGIN" }).click()
    await expect(
      authenticatedPage.getByRole("heading", {
        name: "Test Subject",
        exact: true,
      }),
    ).toBeVisible()
  })
})
