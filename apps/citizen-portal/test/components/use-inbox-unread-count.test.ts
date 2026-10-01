import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/mock/messages", () => ({
  MOCK_MESSAGES_ENABLED: false,
  getMockUnreadCount: () => 7,
}))

const mockUseGatewayFetch = vi.fn()

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (...args: unknown[]) => mockUseGatewayFetch(...args),
}))

import { useInboxUnreadCount } from "@/components/messages/use-inbox-unread-count"

describe("useInboxUnreadCount", () => {
  it("returns loading state until metadata.totalCount is available", () => {
    mockUseGatewayFetch.mockReturnValue({
      metadata: undefined,
      isLoading: true,
    })

    const { result } = renderHook(() => useInboxUnreadCount())

    expect(result.current).toEqual({ count: 0, isLoading: true })
  })

  it("uses metadata.totalCount instead of the limit=1 sample size", () => {
    mockUseGatewayFetch.mockReturnValue({
      metadata: { totalCount: 3 },
      isLoading: false,
    })

    const { result } = renderHook(() => useInboxUnreadCount())

    expect(result.current).toEqual({ count: 3, isLoading: false })
  })

  it("shows the last known count instead of loading after a cross-host load", () => {
    document.cookie = "citizen_portal_nav_unread=5; path=/"
    mockUseGatewayFetch.mockReturnValue({ metadata: undefined, isLoading: true })

    const { result } = renderHook(() => useInboxUnreadCount())

    expect(result.current).toEqual({ count: 5, isLoading: false })
    document.cookie = "citizen_portal_nav_unread=; path=/; max-age=0"
  })

  it("returns zero when the API settles with no unread messages", () => {
    mockUseGatewayFetch.mockReturnValue({
      metadata: { totalCount: 0 },
      isLoading: false,
    })

    const { result } = renderHook(() => useInboxUnreadCount())

    expect(result.current).toEqual({ count: 0, isLoading: false })
  })
})
