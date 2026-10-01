import { type Browser, expect, type Page } from "@playwright/test"
import { getUserByEmail, urls } from "../fixtures"
import { createPageWithVideo } from "./browser-context"

/** Matches `expect.timeout` in playwright.config.ts. */
const SIGN_IN_STEP_TIMEOUT = 25_000

/** How long a URL must hold still before we call the page settled. */
const URL_SETTLE_WINDOW = 3_000

/** Budget for the IdP to consume a submitted login and hand back control. */
const SIGN_IN_CALLBACK_TIMEOUT = 30_000

/**
 * True when `page` stays on `url` for the whole window. A page in the middle
 * of a redirect chain moves on within it; a genuinely-landed page does not.
 */
async function urlIsSettled(page: Page, url: string): Promise<boolean> {
  const moved = await page
    .waitForURL((next) => next.toString() !== url, {
      timeout: URL_SETTLE_WINDOW,
    })
    .then(
      () => true,
      () => false,
    )
  return !moved
}

/**
 * Resolves true when either sign-in step renders — the SAG interstitial's
 * "Continue with MyGovId" button or the mock IdP form itself.
 *
 * Reports rather than throws, so callers that have a fallback (see
 * `confirmSignout`) can branch on it instead of catching.
 */
export async function signInStepVisible(
  page: Page,
  timeout = SIGN_IN_STEP_TIMEOUT,
): Promise<boolean> {
  return page
    .getByRole("button", { name: "Continue with MyGovId" })
    .or(page.locator("#login-form"))
    .first()
    .waitFor({ state: "visible", timeout })
    .then(
      () => true,
      () => false,
    )
}

/**
 * Waits until the MyGovId mock-IdP form is ready to be filled, and reports
 * whether a sign-in is needed at all.
 *
 * Callers arrive here mid-redirect (portal -> Logto -> mock IdP), so
 * branching on `page.url()` races the redirect chain: on CI the URL is
 * still the portal's when the check runs, the MyGovId step gets skipped,
 * and every later locator waits out the test timeout. Wait on whichever
 * of the two sign-in steps actually renders instead, which also means we
 * no longer care which auth host (dev cluster vs local-auth) we redirect
 * through.
 *
 * That wait lives in here rather than in the callers, so calling this
 * straight after a `goto` cannot race the navigation: every `page.url()`
 * below is read only once `signInStepVisible` has given up waiting.
 *
 * A still-valid SSO session skips the IdP entirely. Only loginAsCitizen
 * accepts that outcome; callers that need a fresh identity get an error
 * naming the unexpected destination instead of a later locator timeout.
 *
 * The mock-IdP form itself is identical between hosted dev and local
 * (`@ogcio/logto-utils/apps/mygovid-mock-service` is the upstream for
 * both), so its locators stay unchanged either way.
 */
export async function waitForMockLoginForm(
  page: Page,
  allowExistingSession = false,
  timeout = SIGN_IN_STEP_TIMEOUT,
): Promise<boolean> {
  const myGovId = page.getByRole("button", { name: "Continue with MyGovId" })
  const loginForm = page.locator("#login-form")

  if (!(await signInStepVisible(page, timeout))) {
    const currentUrl = page.url()
    const onLocalizedApp = /\/en(?:\/|$)/.test(new URL(currentUrl).pathname)

    if (allowExistingSession && onLocalizedApp) {
      // An `/en/…` URL is ambiguous: it is where a live SSO session lands us,
      // but it is also what we see when the check happens to run mid-redirect.
      // Only the former holds still, so require the URL to stop moving before
      // accepting it as an existing session, and fail loudly when it does not
      // rather than silently skipping the identity fill.
      if (await urlIsSettled(page, currentUrl)) {
        return false
      }
      throw new Error(
        `Expected either a mock login form or a settled authenticated page, but ${currentUrl} was still mid-navigation (now ${page.url()}).`,
      )
    }

    // Callers that need a fresh IdP identity hit this when a live SSO session
    // skipped the form, when Logto stuck on oidc/auth?prompt=consent with no
    // mock form (build 117050 new-users), or when the portal's client-side
    // locale redirect had not landed yet and we were still sitting on "/"
    // (build 121358 a11y). That last case is the first test of a run hitting a
    // cold app: it is neither `/en/…` nor an auth bounce, so it used to skip
    // the recovery below and fail outright on a slow load. Recover whenever a
    // fresh identity is required — kill cookies and re-open so the bounce
    // actually renders. One attempt only.
    if (!allowExistingSession) {
      await page.context().clearCookies()
      await page.goto(onLocalizedApp ? currentUrl : "/")
      if (!(await signInStepVisible(page, timeout))) {
        throw new Error(
          `Mock login form did not appear; page settled on ${currentUrl}, ` +
            `and still on ${page.url()} after clearing cookies and re-opening.`,
        )
      }
    } else {
      throw new Error(
        `Mock login form did not appear; page settled on ${currentUrl}`,
      )
    }
  }

  if (await myGovId.isVisible()) {
    await myGovId.click()
  }

  await page.waitForURL(`${urls.mock}/**`)
  await expect(loginForm).toBeVisible()
  return true
}

export async function loginAsCitizen(
  page: Page,
  citizenName: string,
): Promise<void> {
  // After logout/confirmSignout the mock IdP form is live with a valid OIDC
  // interaction. Fill it in place — goto("/") would abandon it (117050
  // messaging-variable). clearCookies() leaves the form HTML painted but
  // kills the interaction (117077/117096 global-signout re-login); cookies
  // empty ⇒ force a fresh goto even when still on the mock host.
  const cookies = await page.context().cookies()
  const onLiveMockForm =
    cookies.length > 0 &&
    page.url().startsWith(urls.mock) &&
    (await page
      .locator("#login-form")
      .isVisible()
      .catch(() => false))
  if (!onLiveMockForm) {
    await page.goto("/")
  }

  // No mock form means the SSO session is still live and the portal landed
  // us on an authenticated page already — there is nothing to fill in.
  if (await waitForMockLoginForm(page, true)) {
    await page
      .locator(
        "#login-form > div > div.gi-w-full > div:nth-child(1) > div.gi-accordion > div",
      )
      .click()

    await page
      .locator(
        "#login-form > div > div.gi-w-full > div:nth-child(2) > div.gi-accordion > div",
      )
      .click()

    const user = getUserByEmail(citizenName)
    if (user) {
      // No `#sub` fill: the mock IdP (ogcio/mock-login-service) reads it from
      // the top level of `currentUser`, but its change handler writes anything
      // outside a 12-key OAuth allowlist into `providerData`, so a typed `sub`
      // reverts and the issued token carries a random one. Identity resolves by
      // email instead. If a fixed `sub` is ever needed, it can be set through
      // the mock's Monaco "Form JSON" tab — at the cost of coupling these
      // helpers to the mock's editor internals.
      await page.locator("#firstName").fill(user.firstName)
      await page.locator("#lastName").fill(user.lastName)
      await page.locator("#email").fill(user.email)
    }

    await page.getByRole("button", { name: "LOGIN" }).click()
  }

  await waitForPostLoginSettle(page)
}

export async function createAuthenticatedPage(
  browser: Browser,
  citizenName: string,
): Promise<Page> {
  const page = await createPageWithVideo(browser)
  await page.context().clearCookies()
  await loginAsCitizen(page, citizenName)
  return page
}

/**
 * Portal hosts a citizen can land on after LOGIN. Auth and SAG are
 * deliberately excluded — leaving the mock IdP only gets us onto that chain,
 * not through it.
 */
const POST_LOGIN_APP_ORIGINS = [
  urls.messaging,
  urls.profile,
  urls.dashboard,
] as const

function isPostLoginAppUrl(url: URL): boolean {
  return POST_LOGIN_APP_ORIGINS.some((origin) => url.href.startsWith(origin))
}

/**
 * Drain until the post-LOGIN redirect chain stops moving on a portal app
 * host. Bare `/en/` assertions return mid-hop and the next goto aborts it.
 */
async function waitForPostLoginSettle(page: Page): Promise<void> {
  await page.waitForURL((url) => isPostLoginAppUrl(url), {
    timeout: SIGN_IN_CALLBACK_TIMEOUT,
  })
  const deadline = Date.now() + SIGN_IN_CALLBACK_TIMEOUT
  while (Date.now() < deadline) {
    const current = page.url()
    if (await urlIsSettled(page, current)) {
      return
    }
    if (!isPostLoginAppUrl(new URL(page.url()))) {
      await page.waitForURL((url) => isPostLoginAppUrl(url), {
        timeout: Math.max(deadline - Date.now(), 1),
      })
    }
  }
}

/**
 * Sets the citizen's DSP safe level on the mock IdP form and submits it.
 *
 * Returns once LOGIN has landed on a portal app host (messaging / profile /
 * dashboard). That is the first point where the authorization callback has
 * actually been consumed and the Logto session cookie is in place, so the
 * caller can hop zones without aborting a redirect that is still in flight.
 *
 * Leaving the mock IdP alone is not enough: the chain still runs through
 * authorization → SAG → app, and returning mid-chain aborts it. The next
 * `goto(DASHBOARD_URL|PROFILE_URL)` then forces a fresh MyGovId sign-in
 * (build 116906 call logs: dashboard → SAG `/auth/sign-in` →
 * `/direct/social/MyGovId`), which is what the six dashboard/profile access
 * tests were timing out on.
 *
 * Do not turn this back into a `/en/` assertion. Where LOGIN lands is a
 * function of the level just set — an admitted citizen reaches `/en/…`, while
 * a gated one (level 0 or 1) stops on profile `/onboarding?source=…`, whose
 * only `en` is percent-encoded inside a query param. Waiting for any of the
 * three app origins covers both without naming the destination.
 */
export async function setSafeLevel(
  page: Page,
  safeLevel: string,
): Promise<void> {
  await page
    .locator(
      "#login-form > div > div.gi-w-full > div:nth-child(3) > div.gi-accordion > div",
    )
    .click()
  await page.locator("#DSPOnlineLevel").fill(safeLevel)
  await page.locator("#DSPOnlineLevelStatic").fill(safeLevel)
  await page.getByRole("button", { name: "LOGIN" }).click()
  // First hit on an app host is not necessarily final: messaging can still
  // bounce a brand-new citizen onto profile /onboarding. Returning mid-hop
  // lets the caller's next goto abort that navigation (ERR_ABORTED). Drain
  // until the URL holds still.
  await waitForPostLoginSettle(page)
}

export async function setSafeLevelAndUser(
  page: Page,
  safeLevel: string,
  user: string,
): Promise<void> {
  await page
    .locator(
      "#login-form > div > div.gi-w-full > div:nth-child(2) > div.gi-accordion > div",
    )
    .click()
  await page.locator("#email").fill(user)
  await setSafeLevel(page, safeLevel)
}
