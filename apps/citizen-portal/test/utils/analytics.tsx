import type { Analytics } from "@ogcio/analytics-sdk"
import { AnalyticsContext } from "@ogcio/nextjs-analytics"
import { type RenderOptions, render } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { vi } from "vitest"

/**
 * Fake Matomo client for component tests. Renders through the real
 * `AnalyticsContext`, so components are exercised exactly as in the app;
 * assert on `event` to see what Matomo would receive.
 *
 *   const analytics = fakeAnalytics()
 *   analytics.render(<Thing />) // or { wrapper: analytics.wrapper }
 *   expect(analytics.event).toHaveBeenCalledWith({ event: { ... } })
 */
export function fakeAnalytics() {
  const event = vi.fn().mockResolvedValue({})
  const instance = { track: { event } } as unknown as Analytics

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <AnalyticsContext.Provider value={{ analyticsInstance: instance }}>
        {children}
      </AnalyticsContext.Provider>
    )
  }

  /** `render` with this fake as the analytics provider. */
  function renderWithAnalytics(
    ui: ReactElement,
    options?: Omit<RenderOptions, "wrapper">,
  ) {
    return render(ui, { ...options, wrapper })
  }

  return { event, wrapper, render: renderWithAnalytics }
}
