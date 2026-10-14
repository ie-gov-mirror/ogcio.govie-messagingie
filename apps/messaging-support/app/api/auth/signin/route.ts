import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { buildMsalClient, msalScopes } from "@/msal"
import {
  cookieNameAuthNonce,
  cookieNameAuthState,
  cookieNameLoggedOut,
} from "@/utils/cookies"
import { getEnvConfig } from "@/utils/env"

export async function GET() {
  const state = randomUUID()
  const nonce = randomUUID()
  const { BASE_URL } = getEnvConfig()

  const redirectUri = new URL("/api/auth/callback", BASE_URL).toString()

  const msalClient = buildMsalClient()
  const authUrl = await msalClient.getAuthCodeUrl({
    redirectUri,
    scopes: msalScopes,
    state,
    nonce,
  })

  const res = NextResponse.redirect(authUrl)

  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10,
  }

  res.cookies.set(cookieNameAuthState, state, cookieOptions)
  res.cookies.set(cookieNameAuthNonce, nonce, cookieOptions)
  res.cookies.set(cookieNameLoggedOut, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  })

  return res
}
