import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ErrorPage from "@/app/[locale]/error"

const trackEvent = vi.hoisted(() => vi.fn())
const pushLog = vi.hoisted(() => vi.fn())
const chunkError = vi.hoisted(() => ({ isChunk: false, reloads: false }))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      title: "Error",
      message: "Something went wrong",
      retry: "Retry",
    }
    return labels[key] || key
  },
}))

vi.mock("@grafana/faro-web-sdk", () => ({
  faro: { api: { pushLog } },
}))

vi.mock("@/util/chunk-error", () => ({
  isChunkLoadError: () => chunkError.isChunk,
  reloadOnceIfChunkLoadError: () => chunkError.reloads,
}))

vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent }),
  AnalyticsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("@/components/analytics-provider", () => ({
  AnalyticsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

describe("ErrorPage", () => {
  beforeEach(() => {
    pushLog.mockClear()
    chunkError.isChunk = false
    chunkError.reloads = false
  })

  it("renders the error page with heading, message, and retry button", () => {
    const resetFn = vi.fn()
    render(<ErrorPage error={new Error("Test error")} reset={resetFn} />)

    expect(screen.getByText("Error")).toBeInTheDocument()
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })

  it("fires system-error Matomo event on render", () => {
    const resetFn = vi.fn()
    render(<ErrorPage error={new Error("boom")} reset={resetFn} />)

    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "system-error",
        category: "System",
        action: "Application Error",
      },
    })
  })

  it("does not include error message in the Matomo event", () => {
    const resetFn = vi.fn()
    const errorMsg = "Some sensitive error message with PII"
    render(<ErrorPage error={new Error(errorMsg)} reset={resetFn} />)

    // Verify error message does NOT appear in any trackEvent call
    expect(trackEvent).toHaveBeenCalled()
    const calls = trackEvent.mock.calls
    calls.forEach((call) => {
      const eventStr = JSON.stringify(call)
      expect(eventStr).not.toContain(errorMsg)
    })
  })

  it("stays quiet while a recovery reload is scheduled", () => {
    chunkError.isChunk = true
    chunkError.reloads = true
    render(
      <ErrorPage error={new Error("Failed to load chunk")} reset={vi.fn()} />,
    )

    expect(pushLog).not.toHaveBeenCalled()
  })

  it("reports a chunk-load error once recovery is spent", () => {
    chunkError.isChunk = true
    chunkError.reloads = false
    render(
      <ErrorPage error={new Error("Failed to load chunk")} reset={vi.fn()} />,
    )

    expect(pushLog).toHaveBeenCalledWith([
      "ChunkLoadError: Failed to load chunk",
    ])
  })
})
