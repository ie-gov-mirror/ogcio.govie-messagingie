import { describe, expect, it, vi } from "vitest"
import {
  hasActiveInboxListFilters,
  resolveInboxMessages,
} from "@/components/messages/resolve-inbox-messages"
import type { Message } from "@/types"

const sampleMessages: Message[] = [
  {
    id: "msg-1",
    subject: "Hello",
    createdAt: "2025-01-01T00:00:00Z",
    threadName: "Hello",
    organisationId: "org-1",
    recipientUserId: "user-1",
    excerpt: "Hi",
    isSeen: false,
    attachmentsCount: 0,
  },
]

describe("resolveInboxMessages", () => {
  it.each([
    [{ search: " query ", status: "all" }, true],
    [{ search: " ", status: "unread" }, true],
    [{ search: null, status: "read" }, true],
    [{ search: null, status: "all" }, false],
  ])("detects active filters", (filters, expected) => {
    expect(hasActiveInboxListFilters(filters)).toBe(expected)
  })

  it("keeps the list empty while the initial request is loading", () => {
    expect(
      resolveInboxMessages({
        apiMessages: [],
        isLoading: true,
        isInboxView: true,
        search: null,
        status: "all",
        page: 1,
        pageSize: 10,
      }),
    ).toEqual([])
  })

  it("does not use inbox fixtures outside the inbox view", () => {
    expect(
      resolveInboxMessages({
        apiMessages: [],
        isLoading: false,
        isInboxView: false,
        search: null,
        status: "all",
        page: 1,
        pageSize: 10,
      }),
    ).toEqual([])
  })

  it("returns API messages when the backend has data", () => {
    expect(
      resolveInboxMessages({
        apiMessages: sampleMessages,
        isLoading: false,
        isInboxView: true,
        search: null,
        status: "all",
        page: 1,
        pageSize: 10,
      }),
    ).toEqual(sampleMessages)
  })

  it("falls back to fixtures when the API is empty and no list filters are active", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "true")
    vi.resetModules()

    const { resolveInboxMessages: resolveWithMocks } = await import(
      "@/components/messages/resolve-inbox-messages"
    )

    const messages = resolveWithMocks({
      apiMessages: [],
      isLoading: false,
      isInboxView: true,
      search: null,
      status: "all",
      page: 1,
      pageSize: 10,
    })

    expect(messages.length).toBeGreaterThan(0)
    vi.unstubAllEnvs()
  })

  it("uses fixtures for filtered views when mocks are enabled and the API is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "true")
    vi.resetModules()

    const { resolveInboxMessages: resolveWithMocks } = await import(
      "@/components/messages/resolve-inbox-messages"
    )

    const messages = resolveWithMocks({
      apiMessages: [],
      isLoading: false,
      isInboxView: true,
      search: null,
      status: "unread",
      page: 1,
      pageSize: 10,
    })

    expect(messages.length).toBeGreaterThan(0)
    expect(messages.every((message) => !message.isSeen)).toBe(true)
    vi.unstubAllEnvs()
  })

  it("keeps an empty API result when filters are active and mocks are disabled", () => {
    expect(
      resolveInboxMessages({
        apiMessages: [],
        isLoading: false,
        isInboxView: true,
        search: null,
        status: "unread",
        page: 1,
        pageSize: 10,
      }),
    ).toEqual([])
  })
})
