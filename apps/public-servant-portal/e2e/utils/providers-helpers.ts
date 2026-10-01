import { expect, type Page } from "@playwright/test"
import { urls } from "../fixtures"
import { TEST_DATA } from "./consts"
import { generateTestData } from "./functions"

const ADMIN_URL = urls.admin
const PROVIDERS_LIST_URL = `${ADMIN_URL}/en/providers`

export async function createProvider(page: Page) {
  await page.goto(`${ADMIN_URL}/en/providers/email`)

  const { timestamp } = generateTestData()
  const providerName = `Playwright Provider name ${timestamp}`
  const providerEmail = `playwright-provider-${crypto.randomUUID()}@example.com`

  await page.getByRole("textbox", { name: "Provider name" }).fill(providerName)
  await page.getByRole("textbox", { name: "From address" }).fill(providerEmail)
  await page.getByRole("textbox", { name: "Host" }).fill(TEST_DATA.providerHost)
  await page.getByRole("textbox", { name: "Port" }).fill("1234")
  await page.getByRole("textbox", { name: "Username" }).fill(providerName)
  await page
    .getByRole("textbox", { name: "Password" })
    .fill(TEST_DATA.providerTestValue)
  await page.getByRole("button", { name: "Create" }).click()

  // The form redirects to the providers list on success and stays on the form
  // (rendering an error banner) on failure. Assert the redirect so a failed
  // create fails *here* — otherwise it silently surfaces much later as a
  // missing row inside `deleteProvider`, which points the blame at deletion.
  await expect(page).toHaveURL(PROVIDERS_LIST_URL)

  return { providerName, providerEmail }
}

export async function deleteProvider(page: Page, providerName: string) {
  // Navigate explicitly rather than depending on the redirect left behind by
  // `createProvider`. This used to be commented out because `createProvider`
  // ended with a `networkidle` wait; that wait was removed in AB#42306 and the
  // navigation was never restored, leaving the row lookup unsynchronised.
  await page.goto(PROVIDERS_LIST_URL)
  await page
    .getByRole("row", { name: providerName })
    .getByRole("button", { name: "Delete" })
    .click()
  await page.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByRole("cell", { name: providerName })).not.toBeVisible()
}

/**
 * Best-effort cleanup for `afterEach`.
 *
 * The providers list is neither searchable nor pageable in the UI and the API
 * returns only the first 20 rows, so every provider a failed run leaves behind
 * pushes the newest one further out of view until no test can find its own row
 * again. Deleting unconditionally — including when the test body already failed
 * — is what stops that from accumulating. Never throws: a cleanup failure must
 * not mask the real assertion failure.
 */
export async function deleteProviderIfPresent(
  page: Page,
  providerName: string,
) {
  try {
    if (page.isClosed()) return
    await page.goto(PROVIDERS_LIST_URL)
    const row = page.getByRole("row", { name: providerName })
    if ((await row.count()) === 0) return
    await row.getByRole("button", { name: "Delete" }).click()
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(
      page.getByRole("cell", { name: providerName }),
    ).not.toBeVisible()
  } catch {
    // Swallow: cleanup is opportunistic and must not fail the suite.
  }
}
