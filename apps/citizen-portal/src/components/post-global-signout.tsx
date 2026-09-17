"use client"

import { getEnv } from "@citizen-portal/shared"
import { useEffect, useRef } from "react"
import { CssSpinner } from "@/components/css-spinner"
import { env } from "@/env/env.client"
import { getTrustedRedirectOrigins } from "@/util/trusted-redirect-origins"
import { getValidReturnUrl } from "@/util/valid-return-url"

const POST_GLOBAL_SIGNOUT_COOKIE = "postGlobalSignoutUrl"
const POST_GLOBAL_SIGNOUT_MYGOVID_COOKIE = "postGlobalSignoutMyGovId"
const POST_GLOBAL_SIGNOUT_PATH = "/post-global-signout"

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length))
    }
  }
  return null
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; path=/`
  const hostname = window.location.hostname
  const parts = hostname.split(".")
  const sharedDomain =
    parts.length >= 3 ? `.${parts.slice(1).join(".")}` : undefined
  if (sharedDomain) {
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${sharedDomain}`
  }
}

// End the upstream MyGovID (Azure B2C) session. It MUST be a top-level
// navigation — the B2C cookies are cross-site, so a hidden iframe cannot carry
// them and the logout silently no-ops, leaving the SSO session alive to
// re-authenticate the user. See AB#39676.
function buildMyGovIdEndSessionUrl(
  endSessionUrl: string,
  continuation: string,
) {
  const url = new URL(endSessionUrl)
  url.searchParams.set("post_logout_redirect_uri", continuation)
  return url.toString()
}

export function PostGlobalSignout() {
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) {
      return
    }
    startedRef.current = true

    // Single convergence point for both sign-out branches. If the sign-out was
    // for a MyGovID citizen we still need to end the Azure B2C session before
    // forwarding. The flag cookie is cleared first so the return trip from B2C
    // cannot loop. See AB#39676.
    const needsMyGovIdEndSession =
      readCookie(POST_GLOBAL_SIGNOUT_MYGOVID_COOKIE) === "1"
    const endSessionUrl = env.NEXT_PUBLIC_MYGOVID_END_SESSION_URL

    if (needsMyGovIdEndSession && endSessionUrl) {
      clearCookie(POST_GLOBAL_SIGNOUT_MYGOVID_COOKIE)
      const continuation = new URL(
        POST_GLOBAL_SIGNOUT_PATH,
        env.NEXT_PUBLIC_BASE_URL,
      ).toString()
      window.location.replace(
        buildMyGovIdEndSessionUrl(endSessionUrl, continuation),
      )
      return
    }

    const destination =
      getValidReturnUrl(
        readCookie(POST_GLOBAL_SIGNOUT_COOKIE),
        getTrustedRedirectOrigins(getEnv().hosts),
      ) ?? env.NEXT_PUBLIC_BASE_URL
    clearCookie(POST_GLOBAL_SIGNOUT_COOKIE)
    window.location.replace(destination)
  }, [])

  return (
    <output
      aria-label='Redirecting'
      className='gi-flex gi-items-center gi-justify-center'
      style={{ minHeight: "50vh" }}
    >
      <CssSpinner size='xl' />
    </output>
  )
}
