import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "@/types"

const { gateway, mockTotalCount, useGatewayFetch } = vi.hoisted(() => ({
  gateway: {
    data: [] as Message[],
    metadata: undefined as { totalCount?: number } | undefined,
    isLoading: false,
    refresh: vi.fn(),
  },
  mockTotalCount: vi.fn(() => 7),
  useGatewayFetch: vi.fn(),
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch,
}))
vi.mock("@/mock/messages", () => ({
  MOCK_MESSAGES_ENABLED: false,
  getMockMessagesPage: () => [],
  getMockMessagesTotalCount: mockTotalCount,
}))

import { messagesApi } from "@/api/messages"
import { useInboxMessages } from "./use-inbox-messages"

const message = (id: string): Message =>
  ({
    id,
    subject: id,
    createdAt: "2025-01-01T00:00:00Z",
    threadName: id,
    organisationId: "org-1",
    recipientUserId: "user-1",
    excerpt: id,
    isSeen: false,
    attachmentsCount: 0,
  }) as Message

const defaults = {
  isMobile: false,
  search: null,
  status: "all",
  folderId: null,
  page: 1,
  pageSize: 10,
}

describe("messagesApi.listKey", () => {
  it.each([
    [
      { ...defaults, status: "unread", search: "hello", folderId: "folder-1" },
      "limit=10&offset=0&isSeen=false&search=hello&tagId=folder-1",
    ],
    [
      { ...defaults, status: "read", page: 2, folderId: "deleted" },
      "limit=10&offset=10&isSeen=true&deletedAfterDateTime=1970-01-01T00%3A00%3A00.000Z",
    ],
    [{ ...defaults, folderId: "inbox" }, "limit=10&offset=0&untagged=true"],
  ])("builds the expected query", (params, query) => {
    expect(messagesApi.listKey(params)).toBe(
      `/messaging/api/v1/messages?${query}`,
    )
  })
})

describe("useInboxMessages", () => {
  beforeEach(() => {
    gateway.data = []
    gateway.metadata = undefined
    gateway.isLoading = false
    gateway.refresh.mockReset()
    mockTotalCount.mockClear()
    useGatewayFetch.mockImplementation(() => gateway)
  })

  it("uses metadata, then returned rows, then mock count as totals", () => {
    gateway.data = [message("one")]
    gateway.metadata = { totalCount: 12 }
    const { result, rerender } = renderHook(
      (props) => useInboxMessages(props),
      { initialProps: defaults },
    )
    expect(result.current.totalCount).toBe(12)

    gateway.metadata = undefined
    rerender({ ...defaults, page: 2 })
    expect(result.current.totalCount).toBe(1)

    gateway.data = []
    rerender({ ...defaults, page: 3 })
    expect(result.current.totalCount).toBe(7)
    expect(mockTotalCount).toHaveBeenCalledWith(null, null)
  })

  it("returns zero for filtered or non-inbox empty results", () => {
    const { result, rerender } = renderHook(
      (props) => useInboxMessages(props),
      { initialProps: { ...defaults, search: "missing" } },
    )
    expect(result.current.totalCount).toBe(0)

    rerender({ ...defaults, search: null, folderId: "folder-1" })
    expect(result.current.totalCount).toBe(0)
  })

  it("keeps the previous desktop page while the next page loads", () => {
    gateway.data = [message("one")]
    const { result, rerender } = renderHook(
      (props) => useInboxMessages(props),
      { initialProps: defaults },
    )
    expect(result.current.messages).toHaveLength(1)

    gateway.data = []
    gateway.isLoading = true
    rerender({ ...defaults, page: 2 })

    expect(result.current.messages[0]?.id).toBe("one")
    expect(result.current.isLoading).toBe(true)
    act(() => result.current.refresh())
    expect(gateway.refresh).toHaveBeenCalledOnce()
  })

  it("accumulates mobile pages and refreshes from page one", async () => {
    gateway.data = [message("one")]
    gateway.metadata = { totalCount: 2 }
    const { result, rerender } = renderHook(
      (props) => useInboxMessages(props),
      { initialProps: { ...defaults, isMobile: true } },
    )

    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    gateway.data = [message("two")]
    rerender({ ...defaults, isMobile: true })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.isLoadingMore).toBe(false)

    act(() => result.current.refresh())
    await waitFor(() => expect(gateway.refresh).toHaveBeenCalledOnce())
  })

  it("does not advance mobile pages before the current page settles", () => {
    gateway.isLoading = true
    const { result } = renderHook(() =>
      useInboxMessages({ ...defaults, isMobile: true }),
    )

    act(() => result.current.loadMore())
    expect(useGatewayFetch).toHaveBeenLastCalledWith(
      expect.stringContaining("offset=0"),
    )
    expect(result.current.isLoading).toBe(true)
  })
})
