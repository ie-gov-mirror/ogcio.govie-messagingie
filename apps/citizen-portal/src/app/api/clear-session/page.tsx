"use client"

import { useEnv } from "@citizen-portal/shared"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"
import { env } from "@/env/env.client"
import { getTrustedRedirectOrigins } from "@/util/trusted-redirect-origins"
import { getValidReturnUrl } from "@/util/valid-return-url"

/**
 * Static-export-compatible "clear-session" redirect target.
 *
 * Hit by error/auth flows that need to wipe the gateway session before
 * sending the browser onward. Because the bundle is a static export
 * (no Next.js handler), the actual httpOnly cookie scrub has to happen
 * via a POST to the gateway — this page issues that POST best-effort
 * then performs the redirect.
 *
 * When `globalSignout=true`, hand off to /{locale}/global-signout
 * instead so the full iframe fan-out runs across all apps.
 */
function ClearSessionRedirect() {
  const searchParams = useSearchParams()
  const { hosts, sagUrl } = useEnv()
  const redirectTo = getValidReturnUrl(
    searchParams.get("redirect"),
    getTrustedRedirectOrigins(hosts),
  )
  const globalSignout = searchParams.get("globalSignout") === "true"
  // Forwarded by SAG's /post-sign-out for MyGovID citizens so the
  // global-signout page also terminates the upstream MyGovID (Azure B2C)
  // session — without it the IdP session survives and silently re-auths.
  const role = searchParams.get("role")

  useEffect(() => {
    if (!redirectTo) return

    const redirect = () => {
      window.location.href = redirectTo
    }

    if (globalSignout) {
      const globalSignoutUrl = new URL(
        "/en/global-signout",
        env.NEXT_PUBLIC_BASE_URL,
      )
      globalSignoutUrl.searchParams.set("postRedirectUri", redirectTo)
      globalSignoutUrl.searchParams.set("sagSignout", "true")
      if (role) {
        globalSignoutUrl.searchParams.set("role", role)
      }
      window.location.href = globalSignoutUrl.toString()
      return
    }

    fetch(`${sagUrl}/auth/invalidate-session`, {
      method: "POST",
      credentials: "include",
    })
      .catch(() => undefined)
      .finally(redirect)
  }, [redirectTo, globalSignout, role, sagUrl])

  return null
}

export default function ClearSessionPage() {
  return (
    <Suspense>
      <ClearSessionRedirect />
    </Suspense>
  )
}
