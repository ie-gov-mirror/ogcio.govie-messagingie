import { NextResponse } from "next/server"
import { cookieNameLoggedOut, cookieNameSession } from "@/utils/cookies"
import { getEnvConfig } from "@/utils/env"

export async function GET() {
  const { BASE_URL, MICROSOFT_TENANT_ID } = getEnvConfig()
  const logoutUrl = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(MICROSOFT_TENANT_ID)}/oauth2/v2.0/logout`,
  )
  // Entra only honors post_logout_redirect_uri if it is a redirect URI already
  // registered on the app. Reuse the sign-in callback URL (already registered)
  // instead of /signed-out, so logout doesn't need a new Entra registration.
  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    new URL("/api/auth/callback", BASE_URL).toString(),
  )
  const res = NextResponse.redirect(logoutUrl)
  res.cookies.delete({ name: cookieNameSession, path: "/" })
  // UX marker only. No user identity. Stops AuthWrapper from starting Entra SSO.
  res.cookies.set(cookieNameLoggedOut, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  })
  res.headers.set("Cache-Control", "no-store")
  return res
}
