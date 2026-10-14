import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"
import { after, type NextRequest, NextResponse } from "next/server"
import { getSupportSdk } from "@/data/sdk"
import { buildMsalClient, msalScopes } from "@/msal"
import type { AuthErrorKey } from "@/utils/auth"
import {
  cookieNameAuthNonce,
  cookieNameAuthState,
  cookieNameLoggedOut,
  cookieNameSession,
} from "@/utils/cookies"
import { getEnvConfig } from "@/utils/env"

function buildBaseErrorUrl(reason: AuthErrorKey): URL {
  const { BASE_URL } = getEnvConfig()
  const url = new URL("/auth/error", BASE_URL)
  url.searchParams.append("reason", reason)
  return url
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(buildBaseErrorUrl("missing_code_or_state"))
  }
  const cookieStore = await cookies()
  const savedState = cookieStore.get(cookieNameAuthState)?.value
  const savedNonce = cookieStore.get(cookieNameAuthNonce)?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(buildBaseErrorUrl("invalid_state"))
  }

  if (!savedNonce) {
    return NextResponse.redirect(buildBaseErrorUrl("missing_nonce_cookie"))
  }

  const { BASE_URL, MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, COOKIE_SECRET } =
    getEnvConfig()

  try {
    const redirectUri = new URL("/api/auth/callback", BASE_URL).toString()
    const msalClient = buildMsalClient()
    const tokenResponse = await msalClient.acquireTokenByCode({
      code,
      redirectUri,
      scopes: msalScopes,
      // msal-node 7 rejects the id_token nonce unless this matches the authorize request.
      nonce: savedNonce,
    })

    const jwks = createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/discovery/v2.0/keys`,
      ),
    )

    const { payload: idTokenPayload } = await jwtVerify(
      tokenResponse.idToken,
      jwks,
      {
        issuer: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0`,
        audience: MICROSOFT_CLIENT_ID,
      },
    )

    if (!idTokenPayload.nonce || savedNonce !== idTokenPayload.nonce) {
      return NextResponse.redirect(buildBaseErrorUrl("invalid_nonce"))
    }

    const sessionPayload = {
      sub: idTokenPayload.sub,
      name: idTokenPayload.name,
      email: idTokenPayload.preferred_username || idTokenPayload.email,
    }

    const secret = new TextEncoder().encode(COOKIE_SECRET)

    const sessionJwt = await new SignJWT(sessionPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret)

    after(async () => {
      try {
        const auditSdk = getSupportSdk(getEnvConfig()).auditCollector
        const auditResult = await auditSdk.sendLogs([
          {
            action_type: "create",
            application_id: "messaging-support",
            client_timestamp: new Date().toISOString(),
            resource_type: "users",
            successful: true,
            user_id: sessionPayload.sub || "unknown",
            metadata: {
              userName: String(sessionPayload.name) || "unknown",
              email: String(sessionPayload.email) || "unknown",
            },
          },
        ])
        if (auditResult.error) {
          console.error(auditResult.error)
        }
      } catch (err) {
        console.error("failed to post audit in auth callback", err)
      }
    })

    const res = NextResponse.redirect(new URL("/", BASE_URL))

    res.cookies.set(cookieNameSession, sessionJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    const expiredOptions = {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
    }
    res.cookies.set(cookieNameAuthNonce, "", expiredOptions)
    res.cookies.set(cookieNameAuthState, "", expiredOptions)
    res.cookies.set(cookieNameLoggedOut, "", expiredOptions)

    return res
  } catch (err) {
    console.error("auth callback failed", err)
    return NextResponse.redirect(buildBaseErrorUrl("token_exchange_failed"))
  }
}
