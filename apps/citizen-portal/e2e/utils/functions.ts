import { expect, type Page } from "@playwright/test"
import { templates, urls } from "../fixtures"
import { signInStepVisible } from "../helpers/user-auth.helper"
import { sendMessageAndVerify } from "./message-helpers"
import { navigateAndVerifyHeading } from "./navigation-helpers"
import { addNewRecipient } from "./recipient-helpers"

const ADMIN_URL = urls.admin
const AUTH_URL = urls.auth
const PROFILE_URL = urls.profile

export const generateTestData = () => ({
  uuid: crypto.randomUUID(),
  timestamp: `${Date.now()}-${crypto.randomUUID()}`,
})

export async function sendE2ETemplateMessage(page: Page, nonSecure = false) {
  await navigateAndVerifyHeading(
    page,
    `${ADMIN_URL}/en/send-a-message`,
    "Send a message",
  )
  await page.selectOption("select#template-select", templates.e2e)
  //if nonsecure message click button
  if (nonSecure) {
    await page.getByRole("radio", { name: "Non-secured" }).click()
  }
  await clickButton(page, "Continue to recipients")
}

export async function searchByText(
  page: Page,
  searchText: string,
  searchButtonName = "Search",
) {
  await page.getByRole("textbox", { name: "Search" }).fill(searchText)
  await page.getByRole("button", { name: searchButtonName }).click()
}

export async function clickButton(page: Page, buttonName: string) {
  await page.getByRole("button", { name: buttonName }).click()
}

export async function logout(page: Page) {
  if (page.url().includes("-admin")) {
    await page.context().clearCookies()
  } else {
    // Desktop LEA puts Logout in the header. Menu is mobile-only there,
    // and the only way to reach Logout when LEA is off.
    const logoutButton = page.getByRole("button", {
      name: "Logout",
      exact: true,
    })
    const menu = page.getByRole("button", { name: "Menu", exact: true })
    await expect(logoutButton.or(menu)).toBeVisible()
    if (!(await logoutButton.isVisible())) {
      await menu.click()
    }
    await logoutButton.click()
  }
  await confirmSignout(page)
}

/**
 * How long to let the sign-out chain finish on its own. The profile
 * global-signout orchestrator reserves `MIN_DELAY_MS` (3s) plus up to
 * `IFRAME_TIMEOUT_MS` (20s) for its iframe fan-out, so 30s covers its own worst
 * case. A warm dev run reaches the IdP in ~13s and we return as soon as it
 * does, so this is a ceiling rather than a delay we pay every sign-out.
 */
const SIGNOUT_CHAIN_TIMEOUT = 30_000

/**
 * Where the probe below knocks. It has to be a route that is genuinely behind
 * auth: `/` is a poor witness because it redirects for reasons of its own, so a
 * bounce from it does not isolate the session. The inbox is unambiguous — it
 * renders for a live session and bounces to the IdP without one.
 */
const PROTECTED_PROBE_PATH = "/en/messages"

/**
 * Confirms the sign-out both finished and actually ended the session.
 *
 * Traced end to end on dev, the chain runs profile `/global-signout` ->
 * `/en/global-signout` -> Logto `/oidc/session/end` -> `/post-global-signout`
 * -> the post-redirect URI -> a fresh mock IdP sign-in, reaching the IdP around
 * 13s. So the happy path really does end on a sign-in step, and waiting for one
 * is right.
 *
 * What broke was treating a waypoint as the end. The post-redirect URI —
 * `/en/messages`, or `/en/my-profile` in the profile zone — is on that path for
 * roughly two seconds before the app re-initiates sign-in, and it is exactly
 * where CI reported the chain "settling". Widening the wait does not help when
 * the chain stops there for good: `a2240bbb` tripled it to 45s and changed
 * nothing.
 *
 * So when no sign-in step arrives, do not accept wherever we ended up — those
 * URLs render whether or not the session died. Probe instead: navigating to a
 * protected route forces a fresh request through SAG, and an unauthenticated
 * one bounces to the IdP. Keep both halves; the probe is the assertion, and
 * neither half may be replaced by a check on the settle URL.
 *
 * Both halves stop at the sign-in step and go no further. Advancing into it is
 * not this function's job: callers that want a fillable form call
 * `waitForMockLoginForm` themselves, and clicking through here would leave an
 * authorization request in flight at the IdP — a sign-out helper that starts a
 * sign-in.
 */
export async function confirmSignout(page: Page) {
  if (await signInStepVisible(page, SIGNOUT_CHAIN_TIMEOUT)) {
    return
  }

  const stoppedOn = page.url()
  await page.goto(PROTECTED_PROBE_PATH)

  // Judge the probe only once it has run out: `signInStepVisible` waits for
  // the bounce to render a sign-in step, so this cannot read a URL that is
  // still in flight. Landing anywhere else means the route served us its
  // authenticated content, i.e. the session outlived the sign-out.
  if (!(await signInStepVisible(page))) {
    throw new Error(
      `Sign-out did not clear the session. The chain stopped on ${stoppedOn}; ` +
        `navigating to ${PROTECTED_PROBE_PATH} was then not redirected to ` +
        `authentication and settled on ${page.url()} with no sign-in form.`,
    )
  }
}

/**
 * Waits for the JB/Payments-style global signout redirect chain to finish.
 * The flow fans out via iframes, posts to SAG, and can take ~30s+.
 */
export async function confirmGlobalSignout(page: Page) {
  await page.waitForURL(
    /sign-in|oidc\/session\/end|global-signout|post-global-signout/,
    { timeout: 90_000 },
  )

  if (
    page.url().includes("global-signout") ||
    page.url().includes("post-global-signout")
  ) {
    await page.waitForURL(/sign-in|oidc\/session\/end/, { timeout: 90_000 })
  }

  await confirmSignout(page)
}

/**
 * Sends the E2E template to an opted-in recipient.
 *
 * Default `messagingie2@gmail.com` is deliverable on dest and is the Gmail
 * inbox the deep-link tests poll. Optional `recipientEmail` overrides the
 * search; callers that read the inbox back must sign in as the profile that
 * owns that contact (for messagingie2 that is `users.peterParker`).
 */
export async function sendMessageToDevCitizen(
  page: Page,
  nonSecure = false,
  recipientEmail = "messagingie2@gmail.com",
) {
  await navigateAndVerifyHeading(
    page,
    `${ADMIN_URL}/en/send-a-message`,
    "Send a message",
  )
  await page.selectOption("select#template-select", templates.e2e)
  //if nonsecure message click button
  if (nonSecure) {
    await page.getByRole("radio", { name: "Non-secured" }).click()
  }

  await clickButton(page, "Continue to recipients")

  await page.waitForLoadState("domcontentloaded")
  await expect(
    page.getByLabel("Search").getByRole("cell", { name: "List is empty" }),
  ).toBeHidden()

  await page
    .getByRole("tabpanel", { name: "Search" })
    .locator('input[name="email"]')
    .fill(recipientEmail)
  await page.getByRole("button", { name: "Search" }).click()
  await expect(
    page.getByLabel("Search").getByRole("cell", { name: "List is empty" }),
  ).toBeHidden()

  const recipientRow = page
    .getByRole("row")
    .filter({ hasText: recipientEmail })
    .first()
  await expect(recipientRow).toBeVisible()
  const addRecipient = recipientRow.getByRole("button", {
    name: "Add recipient",
  })
  // Both the desktop and mobile row variants carry this same aria-label, and an
  // opted-out recipient renders them disabled. Without this check `.click()`
  // spends the entire test timeout in actionability polling and reports only
  // "target closed", which says nothing about why.
  await expect(addRecipient).toBeEnabled({ timeout: 10_000 })
  await addRecipient.click()
  await clickButton(page, "Continue to Attachments")
  await clickButton(page, "Skip")
  await sendMessageAndVerify(page)
}

export async function sendMessageToNewEmailAddress(
  page: Page,
  nonSecure = false,
) {
  await navigateAndVerifyHeading(
    page,
    `${ADMIN_URL}/en/send-a-message`,
    "Send a message",
  )
  await page.selectOption("select#template-select", templates.e2e)
  //if nonsecure message click button
  if (nonSecure) {
    await page.getByRole("radio", { name: "Non-secured" }).click()
  }

  await clickButton(page, "Continue to recipients")

  await page.waitForLoadState("domcontentloaded")
  await expect(
    page.getByLabel("Search").getByRole("cell", { name: "List is empty" }),
  ).toBeHidden()

  const email = await addNewRecipient(page)

  await clickButton(page, "Continue to Attachments")
  await clickButton(page, "Skip")
  await sendMessageAndVerify(page)
  return email.recipientEmail
}
