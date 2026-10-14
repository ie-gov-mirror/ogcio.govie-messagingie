import { expect, type Page, test } from "@playwright/test"
import { signInSupportSession, supportProfileEmail } from "./auth"

async function searchForFixture(page: Page) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Select" }).click()
  await page.getByRole("option", { name: "Email", exact: true }).click()
  await page.getByPlaceholder("Value").fill(supportProfileEmail)
  await page.getByRole("button", { name: "Add Filter" }).click()
  await expect(page).toHaveURL(/[?&]email=/)
  await expect(
    page.getByRole("cell", { name: supportProfileEmail }),
  ).toBeVisible()
}

async function openRowLink(page: Page, name: string) {
  const row = page.getByRole("row").filter({ hasText: supportProfileEmail })
  await row.getByRole("button").click()
  await page.getByRole("link", { name, exact: true }).click()
}

test("signed-out visitors are sent to Entra sign-in", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/login\.microsoftonline\.com/)
  await expect(
    page.getByRole("heading", { level: 1, name: "Messaging Support" }),
  ).toHaveCount(0)
})

test.describe("signed-in console", () => {
  test.beforeEach(async ({ page }) => {
    await signInSupportSession(page)
  })

  test("search starts empty, then lists a matching profile", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(
      page.getByRole("heading", { level: 1, name: "Messaging Support" }),
    ).toBeVisible()
    await expect(page.getByText("No search performed")).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: "Profile ID" }),
    ).toBeVisible()

    await searchForFixture(page)
    await expect(page.getByText("No search performed")).toHaveCount(0)
  })

  test("profile, messaging, and account linking open from a search row", async ({
    page,
  }) => {
    await searchForFixture(page)

    await openRowLink(page, "Profile")
    await expect(page).toHaveURL(/\/profile/)
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Consent Management" }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Data Export" }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Delete Account" }),
    ).toBeVisible()
    await page.getByRole("link", { name: "Back" }).click()
    await expect(
      page.getByRole("cell", { name: supportProfileEmail }),
    ).toBeVisible()

    await openRowLink(page, "Messaging")
    await expect(page).toHaveURL(/\/messaging/)
    await expect(page.getByRole("heading", { name: "Messaging" })).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: "Scheduled for delivery" }),
    ).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: "Subject" }),
    ).toBeVisible()
    await page.getByRole("link", { name: "Back" }).click()

    await openRowLink(page, "Accounts Linking")
    await expect(page).toHaveURL(/\/account-linking/)
    await expect(
      page.getByRole("heading", { name: "Account", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: /Parent Account|Child Account/ }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", {
        name: "Search for an account to link as child",
      }),
    ).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible()
  })
})
