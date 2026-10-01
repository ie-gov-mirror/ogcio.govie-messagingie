import { type Page, test } from "@playwright/test"
import { authenticateUser } from "../helpers/auth"
import { createPageWithVideo } from "../helpers/browser-context"
import {
  createProvider,
  deleteProvider,
  deleteProviderIfPresent,
} from "../utils/providers-helpers"

let authenticatedPage: Page

test.describe("Admin Provider Management", () => {
  // Tracks the provider created by the test body so `afterEach` can remove it
  // even when the test failed partway through.
  let createdProviderName: string | undefined

  test.beforeAll(async ({ browser }) => {
    authenticatedPage = await createPageWithVideo(browser)
    await authenticateUser(authenticatedPage)
  })

  test.afterEach(async () => {
    if (!createdProviderName) return
    await deleteProviderIfPresent(authenticatedPage, createdProviderName)
    createdProviderName = undefined
  })

  test.afterAll(async () => {
    // Close the whole context, not just the page: `createPageWithVideo` opens a
    // context per spec file and closing only the page leaks it for the rest of
    // the run.
    await authenticatedPage.context().close()
  })

  test("an admin can add a new provider and then delete them @regression", async () => {
    const { providerName } = await createProvider(authenticatedPage)
    createdProviderName = providerName

    await deleteProvider(authenticatedPage, providerName)
    createdProviderName = undefined
  })
})
