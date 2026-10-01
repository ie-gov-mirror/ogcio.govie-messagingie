"use client"

import {
  CitizenSagProvider,
  getEnv,
  useCrossZoneLink,
} from "@citizen-portal/shared"
import { faro, LogLevel } from "@grafana/faro-web-sdk"
import type { ConsentStatementLanguages } from "@ogcio/consent"
import {
  ConsentProvider,
  FORCE_CONSENT_PARAM,
  MESSAGING_CONSENT_SUBJECT,
} from "@ogcio/consent/react"
import {
  Button,
  Heading,
  Paragraph,
  Stack,
  ToastProvider,
} from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import { signIn } from "@ogcio/sag-client"
import {
  CONNECTOR_MYGOVID,
  ROLE_NAME_ONBOARDED_CITIZEN,
  useAuth,
  useOnboardingGuard,
} from "@ogcio/sag-client/react"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { LoginTracker } from "@/components/analytics/login-tracker"
import { AnalyticsProvider } from "@/components/analytics-provider"
import { AnnouncementsFlow } from "@/components/announcements-flow"
import { ConsentBanner } from "@/components/consent-banner"
import { FeatureFlagsProvider } from "@/components/feature-flags-provider"
import { ApplicationFooter } from "@/components/layout/application-footer"
import { AppMainContent } from "@/components/layout/containers"
import { LoadMaterialSymbols } from "@/components/load-material-symbols"
import { AppSideNav } from "@/components/navigation/app-side-nav"
import { PageHeader } from "@/components/navigation/page-header"
import { PageLoading } from "@/components/page-loading"
import { PublicName } from "@/components/public-name"
import { ShellLoadingChrome } from "@/components/shell-loading-chrome"
import { ANALYTICS } from "@/const/analytics"
import { TRACE_MESSAGES } from "@/const/traces"
import { env } from "@/env/env.client"
import { useIdleMount } from "@/hooks/use-idle-mount"
import { useRouter } from "@/i18n/navigation"
import { ZONE_CONFIG } from "@/lib/zone-config"
import {
  clearPersistedForceConsent,
  persistForceConsentFromUrl,
} from "@/util/force-consent"
import { getZoneFromPath, type Zone } from "@/util/get-zone-from-path"
import { suppressAuthRedirectNoise } from "@/util/suppress-auth-redirect-noise"

/**
 * Single authenticated shell used by every zone (messages, profile,
 * dashboard). Unified from the three per-zone ClientShells in Phase
 * B2; per-zone variation now flows through `ZONE_CONFIG` keyed by the
 * zone derived from the current pathname.
 *
 * The zone is captured *at mount time* (`useState` initializer). Within
 * one bundle session the user stays inside one zone — `useCrossZoneLink`
 * hard-navigates between hostnames, which remounts ClientShell with a
 * fresh `appName` for the new zone. Re-deriving every render would let
 * the SAG provider's `appName` change mid-session (no UX path triggers
 * it today, but the guard is cheap).
 *
 * Zone-specific behaviours surfaced via `ZONE_CONFIG`:
 *   - `sagAppName`                — audience for the SAG session
 *   - `publicServantRoleName`     — `useOnboardingGuard` PS bounce list
 *   - `publicServantRedirectEnvKey` → URL the guard bounces PS users to
 *   - `showsConsentAndAnnouncements` → consent banner + announcements
 *     flow only mount for messages (the only zone with messaging-specific
 *     consent obligations and announcements payloads today)
 *   - `runsStaleClaimsGate`       → post-onboarding session refresh, also
 *     messages-only (the most common landing zone after onboarding)
 */

const AUTH_TIMEOUT_MS = 15_000
const LANGUAGE_SWITCHER = {
  translations: { english: "English", irish: "Gaeilge" },
} as const

// One-shot guard against the post-onboarding stale-claims race: when the
// user returns from the profile-service onboarding flow, the SAG session
// can still hold the pre-onboarding ID token (no `Onboarded citizen`
// role). Detect that here, force one fresh sign-in cycle, and bound
// retries with sessionStorage so we never loop. Scoped to the messages
// zone via `ZONE_CONFIG.runsStaleClaimsGate` (the only zone users
// reliably land on after onboarding completes).
const STALE_CLAIMS_REFRESH_KEY = "citizen_portal_stale_claims_refreshed"

function LayoutLoading({ zone }: { zone: Zone }) {
  return <ShellLoadingChrome zone={zone} />
}

function MainLoading() {
  return <PageLoading minHeight='50vh' />
}

function DeferredMaterialSymbols() {
  const ready = useIdleMount()
  return ready ? <LoadMaterialSymbols /> : null
}

function preloadZoneRouteChunk(zone: Zone) {
  switch (zone) {
    case "messages":
      void import("@/components/messages/unified-inbox")
      void import("@/components/secure-messages/secure-message-page")
      break
    case "dashboard":
      void import("@/components/dashboard/my-dashboard")
      void import("@/components/submissions/submissions")
      break
    case "profile":
      void import("@/components/profile/my-profile")
      break
  }
}

function AuthTimeoutError() {
  const t = useTranslations("errors.page")

  return (
    <div
      className='gi-flex gi-items-center gi-justify-center'
      style={{ minHeight: "50vh" }}
      role='alert'
      aria-live='assertive'
      aria-atomic='true'
    >
      <Stack direction='column' gap={4}>
        <Heading as='h2'>{t("title")}</Heading>
        <Paragraph>{t("message")}</Paragraph>
        <div>
          <Button onClick={() => window.location.reload()}>{t("retry")}</Button>
        </div>
      </Stack>
    </div>
  )
}

function useAuthTimeout(resolved: boolean) {
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (resolved) return
    const id = window.setTimeout(() => setTimedOut(true), AUTH_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [resolved])

  return timedOut
}

function ShellContent({ zone, children }: { zone: Zone; children: ReactNode }) {
  const config = ZONE_CONFIG[zone]

  useEffect(() => {
    persistForceConsentFromUrl()
    preloadZoneRouteChunk(zone)
  }, [zone])

  const crossZone = useCrossZoneLink()
  const profileUrl = useMemo(() => crossZone("profile", "/"), [crossZone])
  const publicServantRedirectUrl = env[config.publicServantRedirectEnvKey]

  const { resolved } = useOnboardingGuard({
    profileUrl,
    appBaseUrl: env.NEXT_PUBLIC_BASE_URL,
    connector: CONNECTOR_MYGOVID,
    publicServantRedirectUrl,
    publicServantRoles: [config.publicServantRoleName],
  })

  const timedOut = useAuthTimeout(resolved)

  if (timedOut && !resolved) {
    return <AuthTimeoutError />
  }

  if (!resolved) {
    return <LayoutLoading zone={zone} />
  }

  const authenticated = (
    <AuthenticatedShell zone={zone}>{children}</AuthenticatedShell>
  )

  return config.runsStaleClaimsGate ? (
    <StaleClaimsRefreshGate zone={zone}>{authenticated}</StaleClaimsRefreshGate>
  ) : (
    authenticated
  )
}

function StaleClaimsRefreshGate({
  zone,
  children,
}: {
  zone: Zone
  children: ReactNode
}) {
  const { user, claims, invalidateSession, signOut } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const triggered = useRef(false)

  useEffect(() => {
    if (!user || !claims || triggered.current) return

    // PS users are redirected away by `useOnboardingGuard` before we get
    // here — gating on citizens only is just defense in depth.
    const isCitizen = claims.organization_roles.length === 0
    if (!isCitizen) return

    const isOnboarded = claims.roles?.includes(ROLE_NAME_ONBOARDED_CITIZEN)
    const previousAttemptTs = sessionStorage.getItem(STALE_CLAIMS_REFRESH_KEY)

    if (isOnboarded) {
      if (previousAttemptTs) {
        faro.api?.pushLog([TRACE_MESSAGES.STALE_CLAIMS_REFRESH.RECOVERED], {
          context: {
            previousAttemptTs,
            roleCount: String(claims.roles?.length ?? 0),
            orgCount: String(claims.organizations.length),
          },
        })
      }
      sessionStorage.removeItem(STALE_CLAIMS_REFRESH_KEY)
      return
    }

    if (previousAttemptTs) {
      faro.api?.pushLog(
        [TRACE_MESSAGES.STALE_CLAIMS_REFRESH.SKIPPED_ALREADY_ATTEMPTED],
        {
          level: LogLevel.WARN,
          context: {
            previousAttemptTs,
            roles: (claims.roles ?? []).join(","),
            orgRoleCount: String(claims.organization_roles.length),
          },
        },
      )
      return
    }

    faro.api?.pushLog([TRACE_MESSAGES.STALE_CLAIMS_REFRESH.DETECTED], {
      context: {
        roles: (claims.roles ?? []).join(","),
        orgRoleCount: String(claims.organization_roles.length),
        signinMethod: String(claims.signinMethod),
      },
    })

    triggered.current = true
    sessionStorage.setItem(STALE_CLAIMS_REFRESH_KEY, String(Date.now()))
    setRefreshing(true)
    invalidateSession()
      .catch((error: unknown) => {
        faro.api?.pushLog(
          [TRACE_MESSAGES.STALE_CLAIMS_REFRESH.INVALIDATE_FAILED],
          {
            level: LogLevel.ERROR,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        )
      })
      .finally(() => {
        window.location.reload()
      })
  }, [user, claims, invalidateSession])

  if (refreshing) {
    return user ? (
      <>
        <PageHeader publicName={<PublicName />} onSignOut={signOut} />
        <AppMainContent aside={<AppSideNav />}>
          <MainLoading />
        </AppMainContent>
        <ApplicationFooter />
      </>
    ) : (
      <LayoutLoading zone={zone} />
    )
  }
  return <>{children}</>
}

/**
 * Wraps the shell body in consent + announcements. Extracted out of
 * `AuthenticatedShell` (which renders *above* `AnalyticsProvider`) so
 * `useAnalytics()` is legal here — `ConsentFlow` is only ever rendered
 * from inside `AuthenticatedShell`'s `<AnalyticsProvider>` subtree.
 * Exported for direct testing of the consent-decision analytics event.
 */
export function ConsentFlow({
  locale,
  onLocaleChange,
  children,
}: {
  locale: ConsentStatementLanguages
  onLocaleChange: (locale: ConsentStatementLanguages) => void
  children: ReactNode
}) {
  const analyticsClient = useAnalytics()

  return (
    <ConsentProvider
      subject={MESSAGING_CONSENT_SUBJECT}
      locale={locale}
      isPublicServant={false}
      onLocaleChange={onLocaleChange}
      languageSwitcher={LANGUAGE_SWITCHER}
      events={{
        onConsentDecision: (accepted) => {
          faro.api?.pushLog([
            `Consent decision: ${accepted ? "accepted" : "declined"}`,
          ])
          const decision = accepted
            ? ANALYTICS.consent.accepted
            : ANALYTICS.consent.declined
          analyticsClient.trackEvent({
            event: {
              name: decision.name,
              category: ANALYTICS.consent.category,
              action: decision.action,
            },
          })

          const url = new URL(window.location.href)
          if (url.searchParams.has(FORCE_CONSENT_PARAM)) {
            url.searchParams.delete(FORCE_CONSENT_PARAM)
            window.history.replaceState(history.state, "", url)
          }
          clearPersistedForceConsent()
        },
        onConsentError: (error) => {
          faro.api?.pushLog([`Consent error: ${error}`])
        },
      }}
    >
      <AnnouncementsFlow
        locale={locale}
        onLocaleChange={onLocaleChange}
        languageSwitcher={LANGUAGE_SWITCHER}
      >
        {children}
      </AnnouncementsFlow>
    </ConsentProvider>
  )
}

function AuthenticatedShell({
  zone,
  children,
}: {
  zone: Zone
  children: ReactNode
}) {
  const config = ZONE_CONFIG[zone]
  const { user, loading, signIn: signInHook, signOut } = useAuth()
  const locale = useLocale()
  const router = useRouter()
  const signInTriggered = useRef(false)
  const currentLocale = locale as ConsentStatementLanguages

  useEffect(() => {
    persistForceConsentFromUrl()
  }, [])

  const isReady = !loading && !!user
  const timedOut = useAuthTimeout(isReady)

  const handleLocaleChange = useCallback(
    (newLocale: ConsentStatementLanguages) => {
      router.replace({ pathname: "/messages" }, { locale: newLocale })
    },
    [router],
  )

  useEffect(() => {
    if (!loading && !user && !signInTriggered.current) {
      signInTriggered.current = true
      // The redirect below aborts any in-flight SAG auth fetch; silence the
      // resulting benign "Error checking auth: Load failed" telemetry (AB#39103).
      suppressAuthRedirectNoise()
      // Pass the full current URL (including query string) as the
      // post-login redirect target. Without this, the gateway falls
      // back to the Referer header which — under the
      // "strict-origin-when-cross-origin" policy set in nginx — is
      // stripped to the origin only, dropping the path and query
      // (e.g. the `?id=<messageId>` on /secure-messages).
      signInHook({
        connector: CONNECTOR_MYGOVID,
        redirectUrl: window.location.href,
      })
    }
  }, [loading, user, signInHook])

  if (timedOut && !isReady) {
    return <AuthTimeoutError />
  }

  if (loading || !user) {
    return <LayoutLoading zone={zone} />
  }

  const header = <PageHeader publicName={<PublicName />} onSignOut={signOut} />

  // Static per-zone: keep it off any idle flag so the tree shape around
  // `{children}` stays stable and the content subtree never remounts/refetches.
  const showConsentChrome = config.showsConsentAndAnnouncements

  const shellBody = (
    <>
      <Suspense
        fallback={
          <>
            {header}
            <AppMainContent aside={<AppSideNav />}>
              <MainLoading />
            </AppMainContent>
          </>
        }
      >
        {header}
        <AppMainContent aside={<AppSideNav />}>
          {showConsentChrome ? <ConsentBanner /> : null}
          {children}
        </AppMainContent>
      </Suspense>
      {/* Single footer outside Suspense — fallback must not render another (CLS). */}
      <ApplicationFooter />
    </>
  )

  const withConsent = showConsentChrome ? (
    <ConsentFlow locale={currentLocale} onLocaleChange={handleLocaleChange}>
      {shellBody}
    </ConsentFlow>
  ) : (
    shellBody
  )

  const chrome = (
    <>
      <ToastProvider />
      {withConsent}
    </>
  )

  return (
    <AnalyticsProvider>
      <LoginTracker />
      <FeatureFlagsProvider>{chrome}</FeatureFlagsProvider>
    </AnalyticsProvider>
  )
}

export function ClientShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  // Capture the zone at mount — see file-level comment for why we
  // don't re-derive on every render.
  const [zone] = useState<Zone>(() => getZoneFromPath(path))
  const config = ZONE_CONFIG[zone]

  const handleSessionExpired = useCallback(() => {
    persistForceConsentFromUrl()
    // Same benign aborted-fetch noise as the initial sign-in redirect (AB#39103).
    suppressAuthRedirectNoise()
    const { sagUrl } = getEnv()
    signIn(sagUrl, config.sagAppName, {
      connector: CONNECTOR_MYGOVID,
      redirectUrl: window.location.href,
    })
  }, [config.sagAppName])

  return (
    <CitizenSagProvider
      appName={config.sagAppName}
      onSessionExpired={handleSessionExpired}
    >
      {/*
       * Inject the DS <link rel=stylesheet> to the Material Symbols font
       * so DS `Icon` can render every id in its set as a font glyph.
       * The SSR'd <link> is hoisted by React 19 into <head>, so it's
       * safe to mount deep in the client tree.
       */}
      <DeferredMaterialSymbols />
      <ShellContent zone={zone}>{children}</ShellContent>
    </CitizenSagProvider>
  )
}
