"use client"

import { getEnv } from "@citizen-portal/shared"
import { Paragraph, Stack } from "@ogcio/design-system-react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Suspense, useEffect, useRef, useState } from "react"
import { CssSpinner } from "@/components/css-spinner"
import { env } from "@/env/env.client"
import {
  isFormsIntegrationEnabled,
  isJourneyIntegrationEnabled,
  isPaymentsIntegrationEnabled,
} from "@/lib/feature-config"
import { ZONE_CONFIG } from "@/lib/zone-config"
import { getZoneFromOrigin } from "@/util/get-zone-from-origin"
import { getTrustedRedirectOrigins } from "@/util/trusted-redirect-origins"
import { getValidReturnUrl } from "@/util/valid-return-url"

const IFRAME_TIMEOUT_MS = 20_000
const MIN_DELAY_MS = 3000
const POST_GLOBAL_SIGNOUT_COOKIE = "postGlobalSignoutUrl"
const POST_GLOBAL_SIGNOUT_PATH = "/post-global-signout"
// Signals to /post-global-signout that the upstream MyGovID (Azure B2C) session
// still needs to be ended via a top-level navigation. See AB#39676.
const POST_GLOBAL_SIGNOUT_MYGOVID_COOKIE = "postGlobalSignoutMyGovId"
const LOGTO_SOCIAL_CONNECTOR_ID_COOKIE_NAME = "connectorsToShow"
const GLOBAL_SIGNOUT_ROLE_CITIZEN = "citizen"

function trimTrailingSlash(url: string) {
  return url.replace(/\/$/, "")
}

function buildLegacyApplicationSignoutUrl(baseUrl: string) {
  return `${trimTrailingSlash(baseUrl)}/application-signout`
}

function buildNewApplicationSignoutUrl(baseUrl: string) {
  return `${trimTrailingSlash(baseUrl)}/api/application-signout`
}

function setPostGlobalSignoutCookie(postRedirectUri: string) {
  document.cookie = `${POST_GLOBAL_SIGNOUT_COOKIE}=${encodeURIComponent(postRedirectUri)}; path=/; max-age=300`
}

// Flag citizen sign-outs so /post-global-signout ends the upstream MyGovID
// (Azure B2C) session via a top-level navigation. A hidden cross-site iframe
// cannot carry the B2C cookies, so the session must be ended by a real
// navigation. See AB#39676.
function setMyGovIdEndSessionFlagCookie() {
  document.cookie = `${POST_GLOBAL_SIGNOUT_MYGOVID_COOKIE}=1; path=/; max-age=300`
}

function clearConnectorsToShowCookie() {
  const hostname = window.location.hostname
  const parts = hostname.split(".")
  const sharedDomain =
    parts.length >= 3 ? `.${parts.slice(1).join(".")}` : undefined

  document.cookie = `${LOGTO_SOCIAL_CONNECTOR_ID_COOKIE_NAME}=; Max-Age=0; path=/`
  if (sharedDomain) {
    document.cookie = `${LOGTO_SOCIAL_CONNECTOR_ID_COOKIE_NAME}=; Max-Age=0; path=/; domain=${sharedDomain}`
  }
}

/** Consolidated citizen-portal env identifier — not registered in SAG. */
const CONSOLIDATED_SAG_APP_NAME = "citizen-portal"

/**
 * Standalone zone apps (messaging-next, legacy profile-next, …) identify
 * themselves via `NEXT_PUBLIC_SAG_APP_NAME`. The consolidated
 * citizen-portal image uses the shared `citizen-portal` env marker instead;
 * map that to a zone-specific SAG app.
 *
 * `?app=` is always required on the sign-out POST: the form is a
 * cross-origin POST to the gateway and sameSite:"lax" cookies (including
 * `logto_app`) are not sent, so SAG cannot resolve the app from cookies.
 */
function resolveConsolidatedSignOutAppName(): string {
  const { hosts } = getEnv()
  try {
    const baseOrigin = new URL(env.NEXT_PUBLIC_BASE_URL).origin
    for (const zone of ["messages", "profile", "dashboard"] as const) {
      if (new URL(hosts[zone]).origin === baseOrigin) {
        return ZONE_CONFIG[zone].sagAppName
      }
    }
  } catch {
    // Malformed env — fall through to hostname.
  }
  return ZONE_CONFIG[getZoneFromOrigin()].sagAppName
}

export function resolveGatewaySignOutAppName(): string {
  const { sagAppName } = getEnv()
  if (sagAppName === CONSOLIDATED_SAG_APP_NAME) {
    return resolveConsolidatedSignOutAppName()
  }
  return sagAppName
}

function postGatewaySignOut(
  gatewayUrl: string,
  app: string,
  postLogoutRedirectUri?: string,
) {
  const params = new URLSearchParams({ app })
  if (postLogoutRedirectUri) {
    params.set("postLogoutRedirectUri", postLogoutRedirectUri)
  }
  const form = document.createElement("form")
  form.method = "POST"
  form.action = `${trimTrailingSlash(gatewayUrl)}/auth/sign-out?${params.toString()}`
  document.body.appendChild(form)
  form.submit()
}

export function buildIframeUrlList(role: string | null) {
  const urls: string[] = []

  const isCitizen = role === "citizen"

  // NOTE: MyGovID citizens DO have an upstream Azure B2C session to terminate,
  // but it is a cross-site logout that CANNOT be cleared from a hidden iframe
  // (third-party cookies are not sent). It is performed as a top-level
  // navigation in the completion handler below instead. See AB#39676.

  const { sagUrl } = getEnv()

  // The consolidated citizen-portal zones (messages / profile / dashboard)
  // all ride the single shared SAG session, so the /auth/clear-session call
  // below logs the user out of every zone at once — no per-zone iframe is
  // needed. Only apps that keep their OWN session cookies must be cleared
  // per-origin here. payments and journey-builder still own independent
  // sessions for every user until they migrate behind the SAG. Each is
  // gated by its deployment-topology flag (AB#39580) so a standalone
  // deployment that ships without that building block never references it.
  if (isPaymentsIntegrationEnabled()) {
    urls.push(buildLegacyApplicationSignoutUrl(env.NEXT_PUBLIC_PAYMENTS_URL))
  }
  if (isJourneyIntegrationEnabled()) {
    urls.push(buildLegacyApplicationSignoutUrl(env.NEXT_PUBLIC_JOURNEY_URL))
  }

  if (isFormsIntegrationEnabled()) {
    urls.push(buildNewApplicationSignoutUrl(env.NEXT_PUBLIC_FORMS_URL))
  }

  // Admin apps also keep their own sessions, but only public servants ever
  // have one — skip them entirely for citizens.
  if (!isCitizen) {
    urls.push(
      buildLegacyApplicationSignoutUrl(env.NEXT_PUBLIC_DASHBOARD_ADMIN_URL),
    )
    urls.push(buildNewApplicationSignoutUrl(env.NEXT_PUBLIC_PROFILE_ADMIN_URL))
    urls.push(
      buildNewApplicationSignoutUrl(env.NEXT_PUBLIC_MESSAGING_ADMIN_URL),
    )
  }

  urls.push(`${trimTrailingSlash(sagUrl)}/auth/clear-session`)

  const seen = new Set<string>()
  return urls.filter((u) => {
    if (seen.has(u)) {
      return false
    }
    seen.add(u)
    return true
  })
}

function GlobalSignoutInner() {
  const t = useTranslations("globalSignout")
  const searchParams = useSearchParams()
  const { hosts } = getEnv()
  const postRedirectUri = getValidReturnUrl(
    searchParams.get("postRedirectUri") ??
      searchParams.get("post_logout_redirect_uri"),
    getTrustedRedirectOrigins(hosts),
  )
  const sagSignout = searchParams.get("sagSignout") === "true"
  const role = searchParams.get("role")

  const [iframesDone, setIframesDone] = useState(false)
  const [minDelayDone, setMinDelayDone] = useState(false)
  const finishedRef = useRef(false)

  useEffect(() => {
    clearConnectorsToShowCookie()
    if (!sagSignout && postRedirectUri) {
      setPostGlobalSignoutCookie(postRedirectUri)
    }
  }, [postRedirectUri, sagSignout])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMinDelayDone(true)
    }, MIN_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const iframeUrls = buildIframeUrlList(role)
    const container = document.createElement("div")
    container.setAttribute("aria-hidden", "true")
    container.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden"
    document.body.appendChild(container)

    if (iframeUrls.length === 0) {
      setIframesDone(true)
      return () => {
        container.remove()
      }
    }

    let loaded = 0
    const total = iframeUrls.length
    const markOne = () => {
      loaded += 1
      if (loaded >= total) {
        setIframesDone(true)
      }
    }

    for (const src of iframeUrls) {
      const iframe = document.createElement("iframe")
      iframe.title = "sign-out"
      iframe.style.cssText = "width:0;height:0;border:0"
      iframe.onload = () => {
        markOne()
      }
      iframe.onerror = () => {
        markOne()
      }
      iframe.src = src
      container.appendChild(iframe)
    }

    const timeoutId = window.setTimeout(() => {
      setIframesDone(true)
    }, IFRAME_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
      container.remove()
    }
  }, [role])

  useEffect(() => {
    if (!iframesDone || !minDelayDone || finishedRef.current) {
      return
    }
    finishedRef.current = true

    // Both branches converge on /post-global-signout, which is the single place
    // that ends the upstream MyGovID (Azure B2C) session for citizens via a
    // top-level navigation. The flag cookie tells it whether that step is
    // required. See AB#39676.
    const isCitizen =
      role === GLOBAL_SIGNOUT_ROLE_CITIZEN &&
      Boolean(env.NEXT_PUBLIC_MYGOVID_END_SESSION_URL)

    if (sagSignout && postRedirectUri) {
      // SAG (and thus Logto) is already terminated by the time we reach here.
      if (isCitizen) {
        setPostGlobalSignoutCookie(postRedirectUri)
        setMyGovIdEndSessionFlagCookie()
        window.location.href = new URL(
          POST_GLOBAL_SIGNOUT_PATH,
          env.NEXT_PUBLIC_BASE_URL,
        ).toString()
        return
      }
      window.location.href = postRedirectUri
      return
    }

    const fallbackRedirect = postRedirectUri ?? env.NEXT_PUBLIC_BASE_URL
    setPostGlobalSignoutCookie(fallbackRedirect)
    if (isCitizen) {
      setMyGovIdEndSessionFlagCookie()
    }

    const postGlobalSignoutUrl = new URL(
      POST_GLOBAL_SIGNOUT_PATH,
      env.NEXT_PUBLIC_BASE_URL,
    ).toString()

    const { sagUrl } = getEnv()
    postGatewaySignOut(
      sagUrl,
      resolveGatewaySignOutAppName(),
      postGlobalSignoutUrl,
    )
  }, [iframesDone, minDelayDone, postRedirectUri, sagSignout, role])

  return (
    <output
      aria-label={t("loggingOut")}
      className='gi-flex gi-flex-col gi-items-center gi-justify-center gi-gap-6'
      style={{ minHeight: "50vh" }}
    >
      <CssSpinner size='xl' />
      <Stack direction='column' gap={2} itemsAlignment='center'>
        <Paragraph>{t("loggingOut")}</Paragraph>
        <Paragraph>{t("pleaseWait")}</Paragraph>
      </Stack>
    </output>
  )
}

export function GlobalSignout() {
  return (
    <Suspense
      fallback={
        <output
          aria-label='Loading'
          className='gi-flex gi-items-center gi-justify-center'
          style={{ minHeight: "50vh" }}
        >
          <CssSpinner size='xl' />
        </output>
      }
    >
      <GlobalSignoutInner />
    </Suspense>
  )
}
