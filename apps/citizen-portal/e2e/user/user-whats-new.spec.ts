import { expect, type Page, test } from "@playwright/test"
import { users } from "../fixtures"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"
import { appNav } from "../utils/navigation-helpers"

/**
 * Backend-shaped announcement (as returned by the Profile API before the
 * `@ogcio/announcements` locale transform). The What's new page renders
 * the same feed the announcement popup uses, so we stub the API to keep
 * the page deterministic regardless of what content exists in the env.
 */
function backendAnnouncement(
  id: string,
  title: string,
  description: string,
  publishDate: string,
) {
  const translation = (language: "en" | "ga") => ({
    id: `${id}-${language}`,
    announcementId: id,
    language,
    title,
    description,
    createdAt: publishDate,
  })
  return {
    id,
    applicationId: "messaging",
    isEnabled: true,
    createdAt: publishDate,
    createdBy: null,
    publishDate,
    translations: { en: translation("en"), ga: translation("ga") },
  }
}

const ANNOUNCEMENTS = [
  backendAnnouncement(
    "ann-data-export",
    "Download your data",
    "Request a copy of your data from **My Profile**.",
    "2026-05-01T10:00:00Z",
  ),
  backendAnnouncement(
    "ann-unified-inbox",
    "A redesigned inbox",
    "All your messages in one place.",
    "2026-06-01T10:00:00Z",
  ),
]

let page: Page

test.describe("What's new page", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createAuthenticatedPage(browser, users.citizen1.email)

    // Serve deterministic changelog content. `newOnly=true` (the popup's
    // request) returns nothing so the modal never opens over the page;
    // the page itself requests the full history (`newOnly=false`).
    await page.route(/\/citizens\/announcements\/\?/, async (route) => {
      const isNewOnly = route.request().url().includes("newOnly=true")
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: isNewOnly ? [] : ANNOUNCEMENTS }),
      })
    })
  })

  test.afterAll(async () => {
    await page.context().clearCookies()
    await page.close()
  })

  test("lists the changelog newest-first @local", async () => {
    await page.goto("/en/whats-new")

    await expect(page.getByTestId("whats-new-heading")).toHaveText("What's new")

    const items = page.getByTestId("whats-new-item")
    await expect(items).toHaveCount(2)
    await expect(
      items.first().getByRole("heading", { name: "A redesigned inbox" }),
    ).toBeVisible()
    await expect(
      items.last().getByRole("heading", { name: "Download your data" }),
    ).toBeVisible()
    await expect(
      page.getByText("All your messages in one place."),
    ).toBeVisible()
  })

  test("shows an empty state when there are no announcements @local", async () => {
    await page.route(
      /\/citizens\/announcements\/\?/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        })
      },
      { times: 1 },
    )
    await page.goto("/en/whats-new")
    await expect(page.getByTestId("whats-new-empty")).toBeVisible()
  })

  test("is not listed in the header menu @local", async () => {
    await page.goto("/en/messages")
    const nav = await appNav(page)
    await expect(nav.getByRole("link", { name: "What's new" })).toHaveCount(0)
  })

  test("is reachable from the footer @local", async () => {
    await page.goto("/en/messages")
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "What's new" })
      .click()
    await expect(page).toHaveURL(/\/en\/whats-new/)
    await expect(page.getByTestId("whats-new-heading")).toBeVisible()
  })
})
