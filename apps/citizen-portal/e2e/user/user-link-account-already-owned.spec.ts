import { expect, type Page, test } from "@playwright/test"
import { users } from "../fixtures"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"

/**
 * Hermetic coverage for AB#42525 Option 1: when Confirm hits the
 * profile-api "already logged in" 400, the citizen sees actionable copy
 * and Confirm is not a silent retry trap.
 *
 * Stubs the secure-messages linking funnel (user message 404 → M2M
 * message + profiles → Confirm PATCH 400) so this does not depend on
 * Gmail or a real already-owned mailbox.
 */

const MESSAGE_ID = "e2e-link-already-owned-msg"
const LINKED_PROFILE_ID = "e2e-linked-mailbox-id"
const CURRENT_PROFILE_ID = users.peterParker.logtoId

const LINKED_PROFILE = {
  id: LINKED_PROFILE_ID,
  email: "already.owned@mail.ie",
  primaryUserId: LINKED_PROFILE_ID,
  preferredLanguage: "en",
}

const CURRENT_PROFILE = {
  id: CURRENT_PROFILE_ID,
  email: users.peterParker.email,
  primaryUserId: CURRENT_PROFILE_ID,
  preferredLanguage: "en",
}

async function stubAlreadyOwnedLinkingFlow(page: Page) {
  await page.route(/\/messaging\/api\/v1\/messages\//, async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue()
      return
    }
    const isM2M =
      request.headers()["x-request-actor-type"]?.toLowerCase() === "m2m"
    if (isM2M) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { recipientUserId: LINKED_PROFILE_ID },
          error: null,
        }),
      })
      return
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        data: null,
        error: { statusCode: 404, message: "Message not found" },
      }),
    })
  })

  await page.route(/\/profile\/api\/v1\/profiles\//, async (route, request) => {
    const url = request.url()
    if (request.method() === "PATCH" && url.includes(LINKED_PROFILE_ID)) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        // sag-client prefers `details`; include Fastify-shaped fields too.
        body: JSON.stringify({
          statusCode: 400,
          error: "Bad Request",
          message: "Cannot update data for a profile that already logged in",
          details: "Cannot update data for a profile that already logged in",
        }),
      })
      return
    }
    if (request.method() === "GET" && url.includes(LINKED_PROFILE_ID)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: LINKED_PROFILE, error: null }),
      })
      return
    }
    if (request.method() === "GET" && url.includes(CURRENT_PROFILE_ID)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: CURRENT_PROFILE, error: null }),
      })
      return
    }
    await route.continue()
  })
}

test.describe("Account linking already-owned 400 @local @regression", () => {
  test("shows actionable toast and disables Confirm after linking 400", async ({
    browser,
  }) => {
    const page = await createAuthenticatedPage(browser, users.peterParker.email)
    await stubAlreadyOwnedLinkingFlow(page)

    await page.goto(`/en/secure-messages?id=${MESSAGE_ID}`)

    await expect(
      page.getByRole("heading", { name: "Is this you?" }),
    ).toBeVisible()

    const confirm = page.getByRole("button", { name: "Confirm" })
    await expect(confirm).toBeEnabled()
    await confirm.click()

    await expect(
      page.getByRole("alert", { name: "This mailbox already has an owner" }),
    ).toBeVisible()
    await expect(
      page.getByText(
        /This mailbox already belongs to an account that has signed in/,
      ),
    ).toBeVisible()
    await expect(
      page.getByText(/Failed to load account information/),
    ).toHaveCount(0)

    await expect(confirm).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Report an Issue" }),
    ).toBeEnabled()

    await page.close()
  })
})
