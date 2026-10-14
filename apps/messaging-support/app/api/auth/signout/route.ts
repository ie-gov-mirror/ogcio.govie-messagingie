import { NextResponse } from "next/server"
import { cookieNameLoggedOut, cookieNameSession } from "@/utils/cookies"
import { getEnvConfig } from "@/utils/env"

export async function GET() {
  const { BASE_URL } = getEnvConfig()
  const res = NextResponse.redirect(new URL("/signed-out", BASE_URL))
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
