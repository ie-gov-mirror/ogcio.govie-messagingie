import type { Page } from "@playwright/test"
import { SignJWT } from "jose"
import { getEnvConfig } from "../utils/env"

const baseURL = process.env.BASE_URL || "http://localhost:1337"

// Same fixture address the citizen and admin suites already log in as.
export const supportProfileEmail =
  process.env.E2E_SUPPORT_PROFILE_EMAIL || "e2e_citizen_1@user.com"

/**
 * The other suites sign in through the MyGovId mock. This console uses MSAL,
 * and those suites leave Entra interactive login unimplemented. After the
 * callback, pages only check the httpOnly `session` JWT (HS256, 1h). Mint
 * that same cookie so tests hit the real gate without a browser IdP.
 */
export async function signInSupportSession(page: Page) {
  const { COOKIE_SECRET } = getEnvConfig()
  const token = await new SignJWT({
    sub: "e2e-support",
    name: "E2E Support",
    email: "e2e-support@example.com",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(COOKIE_SECRET))

  await page.context().addCookies([
    {
      name: "session",
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
      secure: baseURL.startsWith("https://"),
    },
  ])
}
