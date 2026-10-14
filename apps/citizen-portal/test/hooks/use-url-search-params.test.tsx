import { act, render, renderHook, screen } from "@testing-library/react"
import { useInsertionEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
}))

describe("useUrlSearchParams", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams("search=payslip")
    window.history.replaceState({}, "", "/en/messages?search=payslip")
    vi.resetModules()
  })

  it("stays in sync with history.replaceState after a clear (AB#40679)", async () => {
    // Force the production path so we exercise the history-backed store
    // instead of the NODE_ENV=test shortcut that returns Next's params.
    vi.stubEnv("NODE_ENV", "production")
    const { useUrlSearchParams } = await import("@/hooks/use-url-search-params")

    const { result } = renderHook(() => useUrlSearchParams())
    expect(result.current.get("search")).toBe("payslip")

    // Listener notification is deferred to a microtask, so flush it via an
    // async act to let the store-backed re-render commit.
    await act(async () => {
      window.history.replaceState({}, "", "/en/messages")
    })

    expect(result.current.get("search")).toBeNull()
    expect(window.location.pathname + window.location.search).toBe(
      "/en/messages",
    )

    vi.unstubAllEnvs()
  })

  it("does not follow a stale Next useSearchParams value after replaceState", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { useUrlSearchParams } = await import("@/hooks/use-url-search-params")

    const { result } = renderHook(() => useUrlSearchParams())

    await act(async () => {
      // Simulate the AB#40679 clear: address bar is cleaned while Next's
      // useSearchParams() still reports the pre-reload search term.
      window.history.replaceState({}, "", "/en/messages")
      currentSearchParams = new URLSearchParams("search=payslip")
    })

    expect(result.current.get("search")).toBeNull()

    vi.unstubAllEnvs()
  })

  it("survives a history push from an insertion effect", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { useUrlSearchParams } = await import("@/hooks/use-url-search-params")

    // Stands in for Next's App Router, which pushes history state from a
    // `useInsertionEffect` — a phase React forbids scheduling updates from.
    function Pusher() {
      useInsertionEffect(() => {
        window.history.pushState({}, "", "/en/messages?search=pushed")
      }, [])
      return null
    }

    function Harness({ pushing }: { pushing: boolean }) {
      const params = useUrlSearchParams()
      return (
        <>
          <span data-testid='search'>{params.get("search") ?? ""}</span>
          {pushing ? <Pusher /> : null}
        </>
      )
    }

    const errors: string[] = []
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "))
    })

    // The store must be subscribed before the push, or it schedules nothing.
    const { rerender } = render(<Harness pushing={false} />)
    await act(async () => {
      rerender(<Harness pushing />)
    })

    expect(errors.join("\n")).not.toContain(
      "useInsertionEffect must not schedule updates",
    )
    expect(screen.getByTestId("search").textContent).toBe("pushed")

    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
})
