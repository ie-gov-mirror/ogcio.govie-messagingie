import { render, screen } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { analytics, Analytics, env, idle } = vi.hoisted(() => ({
  analytics: {
    initClientTracker: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn(() => false),
    track: { pageView: vi.fn() },
  },
  Analytics: vi.fn(),
  env: {
    NEXT_PUBLIC_ANALYTICS_URL: undefined as string | undefined,
    NEXT_PUBLIC_MATOMO_URL: undefined as string | undefined,
    NEXT_PUBLIC_MATOMO_PROTOCOL: undefined as string | undefined,
    NEXT_PUBLIC_BASE_URL: "https://messaging.test/path",
    NEXT_PUBLIC_ANALYTICS_WEBSITE_ID: undefined as string | undefined,
    NEXT_PUBLIC_ANALYTICS_ORGANIZATION_ID: "ogcio",
    NEXT_PUBLIC_ANALYTICS_DRY_RUN: true,
  },
  idle: { ready: false },
}))

vi.mock("@/env/env.client", () => ({ env }))
vi.mock("@/hooks/use-idle-mount", () => ({
  useIdleMount: () => idle.ready,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/messages",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@ogcio/analytics-sdk", () => ({
  Analytics,
  ConsoleLogger: vi.fn(),
}))
vi.mock("@ogcio/nextjs-analytics", () => ({
  AnalyticsContext: { Provider: ({ children }: PropsWithChildren) => children },
}))

import { AnalyticsProvider } from "./analytics-provider"

describe("AnalyticsProvider", () => {
  beforeEach(() => {
    env.NEXT_PUBLIC_ANALYTICS_URL = undefined
    env.NEXT_PUBLIC_MATOMO_URL = undefined
    env.NEXT_PUBLIC_MATOMO_PROTOCOL = undefined
    env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID = undefined
    idle.ready = false
    Analytics.mockReset()
    Analytics.mockImplementation(
      class {
        constructor() {
          return analytics
        }
      },
    )
    analytics.initClientTracker.mockReset()
    analytics.initClientTracker.mockResolvedValue(undefined)
    analytics.isInitialized.mockReset()
    analytics.isInitialized.mockReturnValue(false)
    analytics.track.pageView.mockReset()
  })

  it("renders children when analytics is not configured", () => {
    render(
      <AnalyticsProvider>
        <span>content</span>
      </AnalyticsProvider>,
    )

    expect(screen.getByText("content")).toBeInTheDocument()
  })

  it("creates analytics from the direct URL", () => {
    env.NEXT_PUBLIC_ANALYTICS_URL = "https://analytics.test"
    env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID = "site-1"

    render(
      <AnalyticsProvider>
        <span>content</span>
      </AnalyticsProvider>,
    )

    expect(Analytics).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://analytics.test",
        trackingWebsiteId: "site-1",
        organizationId: "ogcio",
        dryRun: true,
      }),
    )
    expect(analytics.initClientTracker).not.toHaveBeenCalled()
  })

  it("uses the same-origin Matomo proxy and initialises when idle", async () => {
    env.NEXT_PUBLIC_MATOMO_URL = "//analytics.test"
    env.NEXT_PUBLIC_MATOMO_PROTOCOL = "https"
    env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID = "site-1"
    idle.ready = true

    render(
      <AnalyticsProvider>
        <span>content</span>
      </AnalyticsProvider>,
    )

    await vi.waitFor(() =>
      expect(analytics.initClientTracker).toHaveBeenCalledWith({
        trackPageView: false,
      }),
    )
  })

  it("excludes the params carrying search text, ids and titles from tracked URLs before the tracker starts", async () => {
    env.NEXT_PUBLIC_ANALYTICS_URL = "https://analytics.test"
    env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID = "site-1"
    idle.ready = true
    const paq = globalThis as { _paq?: unknown[] }
    paq._paq = undefined
    let queuedAtInit: unknown[] = []
    analytics.initClientTracker.mockImplementation(async () => {
      queuedAtInit = [...(paq._paq ?? [])]
    })

    render(
      <AnalyticsProvider>
        <span>content</span>
      </AnalyticsProvider>,
    )

    await vi.waitFor(() =>
      expect(analytics.initClientTracker).toHaveBeenCalled(),
    )
    expect(queuedAtInit).toContainEqual([
      "setExcludedQueryParams",
      ["search", "folder", "id", "submissionId", "submissionTitle"],
    ])
    paq._paq = undefined
  })

  it("tracks a page view after analytics initialises", async () => {
    env.NEXT_PUBLIC_ANALYTICS_URL = "https://analytics.test"
    env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID = "site-1"
    idle.ready = true
    analytics.isInitialized.mockReturnValue(true)
    document.title = "Messages"

    render(
      <AnalyticsProvider>
        <span>content</span>
      </AnalyticsProvider>,
    )

    await vi.waitFor(() =>
      expect(analytics.track.pageView).toHaveBeenCalledWith({
        event: { title: "Messages" },
      }),
    )
  })

  it("reports analytics initialisation failures", async () => {
    const error = new Error("init failed")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    env.NEXT_PUBLIC_ANALYTICS_URL = "https://analytics.test"
    env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID = "site-1"
    idle.ready = true
    analytics.initClientTracker.mockRejectedValueOnce(error)

    render(
      <AnalyticsProvider>
        <span>content</span>
      </AnalyticsProvider>,
    )

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "Analytics: Error during init",
        error,
      ),
    )
    consoleError.mockRestore()
  })

  it("reports page-view failures", async () => {
    const error = new Error("track failed")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    env.NEXT_PUBLIC_ANALYTICS_URL = "https://analytics.test"
    env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID = "site-1"
    idle.ready = true
    analytics.isInitialized.mockReturnValue(true)
    analytics.track.pageView.mockRejectedValueOnce(error)

    render(
      <AnalyticsProvider>
        <span>content</span>
      </AnalyticsProvider>,
    )

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "Analytics: Error during route change",
        error,
      ),
    )
    consoleError.mockRestore()
  })
})
