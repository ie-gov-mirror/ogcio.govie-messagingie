"use client"

import { Analytics, ConsoleLogger } from "@ogcio/analytics-sdk"
import { AnalyticsContext } from "@ogcio/nextjs-analytics"
import { usePathname, useSearchParams } from "next/navigation"
import { type ReactNode, useEffect, useMemo } from "react"
import { env } from "@/env/env.client"
import { useIdleMount } from "@/hooks/use-idle-mount"

/**
 * Matomo / @ogcio/analytics-sdk wrapper used by every zone.
 *
 * Same config fallback as before (`NEXT_PUBLIC_ANALYTICS_URL` ||
 * Matomo same-origin proxy). Tracker script (`tr4ck3rj`) is injected only
 * after the main thread is idle so it stays off the Lighthouse TBT path;
 * `useTrack()` still works immediately (events no-op or queue until init).
 *
 * No-ops when URL or website id are unset (e.g. local without analytics env).
 */

type ClientAnalyticsConfig = {
  baseUrl: string
  trackingWebsiteId: string
  organizationId?: string
  dryRun?: boolean
}

let analytics: Analytics | undefined

function getAnalytics(analyticsConfig: ClientAnalyticsConfig): Analytics {
  if (analytics) return analytics
  analytics = new Analytics({
    ...analyticsConfig,
    logger: new ConsoleLogger({ level: "warn" }),
  })
  return analytics
}

function getAnalyticsBaseUrl(): string | undefined {
  if (env.NEXT_PUBLIC_ANALYTICS_URL) {
    return env.NEXT_PUBLIC_ANALYTICS_URL
  }
  const matomo = env.NEXT_PUBLIC_MATOMO_URL
  const protocol = env.NEXT_PUBLIC_MATOMO_PROTOCOL
  if (matomo?.startsWith("//") && protocol) {
    // Same-origin `/_next/analytics-api` is proxied (nginx in Docker,
    // rewrites in `next dev`) to analytics.ogcio.gov.ie so the SDK's
    // GET /api/v1/websites/{id} is not blocked by CORS. Use /_next/…
    // so CDN/WAF allows the path (ad-hoc prefixes can return 403 at
    // the edge).
    const origin = new URL(env.NEXT_PUBLIC_BASE_URL).origin
    return `${origin}/_next/analytics-api`
  }
  return undefined
}

/**
 * The SDK reports `location.href` (`setCustomUrl`) with every page view and
 * event, so query params would reach Matomo verbatim: `search` carries the
 * citizen's search text, `folder`, `id` and `submissionId` the ids of a
 * folder, a message or an application, and `submissionTitle` an application's
 * title. Matomo's tracker strips these from every URL it sends; queued before
 * the tracker script loads, it is applied first (it is in Matomo's
 * `applyFirst` list).
 */
const EXCLUDED_QUERY_PARAMS = [
  "search",
  "folder",
  "id",
  "submissionId",
  "submissionTitle",
]

function excludeSensitiveQueryParams() {
  const queue = globalThis as { _paq?: unknown[] }
  queue._paq ??= []
  queue._paq.push(["setExcludedQueryParams", EXCLUDED_QUERY_PARAMS])
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const idleReady = useIdleMount()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const baseUrl = getAnalyticsBaseUrl()
  const websiteId = env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID

  const context = useMemo(() => {
    if (!baseUrl || !websiteId) {
      return { analyticsInstance: undefined }
    }
    return {
      analyticsInstance: getAnalytics({
        baseUrl,
        trackingWebsiteId: websiteId,
        organizationId: env.NEXT_PUBLIC_ANALYTICS_ORGANIZATION_ID,
        dryRun: env.NEXT_PUBLIC_ANALYTICS_DRY_RUN,
      }),
    }
  }, [baseUrl, websiteId])

  useEffect(() => {
    if (!idleReady || !context.analyticsInstance) return

    const initializeAnalytics = async () => {
      try {
        excludeSensitiveQueryParams()
        await context.analyticsInstance?.initClientTracker({
          trackPageView: false,
        })
      } catch (e) {
        console.error("Analytics: Error during init", e)
      }
    }
    void initializeAnalytics()
  }, [idleReady, context.analyticsInstance])

  useEffect(() => {
    if (!idleReady || !context.analyticsInstance?.isInitialized()) return

    void context.analyticsInstance?.track
      .pageView({
        event: {
          title: window.document.title,
        },
      })
      ?.catch((e: unknown) => {
        console.error("Analytics: Error during route change", e)
      })
  }, [idleReady, context.analyticsInstance, pathname, searchParams])

  if (!baseUrl || !websiteId) {
    return <>{children}</>
  }

  return (
    <AnalyticsContext.Provider value={context}>
      {children}
    </AnalyticsContext.Provider>
  )
}
