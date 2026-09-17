import { expect, type Page, test } from "@playwright/test"
import { authenticateUser } from "../helpers/auth"
import { createPageWithVideo } from "../helpers/browser-context"
import { waitForMockLoginForm } from "../helpers/user-auth.helper"
import { giveConsent } from "../utils/consent-helper"
import {
  clickButton,
  logout,
  sendMessageToNewEmailAddress,
} from "../utils/functions"
import {
  gmailCredentialsAvailable,
  previewRecentMessageEmail,
} from "../utils/gmail-reader"

let authenticatedPage: Page

/**
 * Both tests sign in without filling the mock-IdP form. That is deliberate:
 * the form pre-populates a random identity on load, which is exactly the
 * brand-new, unlinked user these flows need. Filling in a seeded fixture user
 * would link an already-known account and defeat the test.
 *
 * These two tests are the only e2e that depend on a real mailbox: they send a
 * secure message to a fresh `messagingie2+<uuid>@gmail.com` alias and then
 * read it back over the Gmail API (`utils/gmail-reader.ts`). So they fail for
 * environmental reasons the portal cannot cause, and `expect(email).not
 * .toBeNull()` in the reader is where that surfaces. Before touching this
 * spec, rule those out in order:
 *   1. The Gmail OAuth refresh token in `utils/gmail-reader.ts` expires every
 *      ~30 days; once stale, `checkInbox` polls out and finds nothing. The
 *      regeneration steps are in that file.
 *   2. Dev mail delivery lag — the send can succeed while the notification
 *      lands after the poll window.
 * The send path itself (template select -> add recipient -> send) and the
 * notification subject (`secureMessageSubject`, "You have received a new
 * secure message from ...", which the reader's `subject:secure message`
 * query matches) were both verified intact for AB#42515.
 *
 * The already-owned Confirm 400 UX (AB#42525) is covered hermetically in
 * `user-link-account-already-owned.spec.ts` — do not bolt that onto this
 * Gmail-backed suite.
 */
test.describe("User can link a new email address to an account", () => {
  test.skip(
    !gmailCredentialsAvailable(),
    "E2E Gmail credentials are not configured.",
  )

  test.beforeEach(async ({ browser }) => {
    authenticatedPage = await createPageWithVideo(browser)
    //clear the cache
    await authenticatedPage.context().clearCookies()
  })

  test.afterEach(async () => {
    if (authenticatedPage && !authenticatedPage.isClosed()) {
      await authenticatedPage.context().close()
    }
  })

  test("citizen can link a new email address to an account @smoke @regression", async () => {
    await authenticateUser(authenticatedPage)
    const email = await sendMessageToNewEmailAddress(authenticatedPage)
    //logout as admin
    await logout(authenticatedPage)
    // Click link from email
    await previewRecentMessageEmail(authenticatedPage, email)
    // Login as a new user
    await waitForMockLoginForm(authenticatedPage)
    await authenticatedPage.getByRole("button", { name: "LOGIN" }).click()
    //Confirm consent
    await giveConsent(authenticatedPage)
    // Confirm link account
    await clickButton(authenticatedPage, "Confirm")
    await expect(
      authenticatedPage.getByRole("heading", { name: "Test Subject" }),
    ).toBeVisible()
  })

  test("citizen can report receiving an email to an address not linked to their account @smoke @regression", async () => {
    await authenticateUser(authenticatedPage)
    const email = await sendMessageToNewEmailAddress(authenticatedPage)
    //logout as admin
    await logout(authenticatedPage)
    await previewRecentMessageEmail(authenticatedPage, email)
    // Login as a new user
    await waitForMockLoginForm(authenticatedPage)
    await authenticatedPage.getByRole("button", { name: "LOGIN" }).click()
    //Confirm consent
    await giveConsent(authenticatedPage)
    // Confirm link account
    await clickButton(authenticatedPage, "Report an Issue")
    //Disabled as forms url is not configured in dev
    //const url = await authenticatedPage.url()
    //await expect(url).toContain("forms")
  })
})
