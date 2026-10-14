import { afterEach, describe, expect, it, vi } from "vitest"

describe("message mocks", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns no fixtures when mocks are disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "false")
    vi.stubEnv("NEXT_PUBLIC_ENABLE_LEA", "false")
    const {
      findMockMessageById,
      getMockMessagesPage,
      getMockMessagesTotalCount,
      getMockUnreadCount,
    } = await import("./messages")

    expect(
      getMockMessagesPage({ search: null, page: 1, pageSize: 10 }),
    ).toEqual([])
    expect(getMockMessagesTotalCount(null)).toBe(0)
    expect(getMockUnreadCount()).toBe(0)
    expect(findMockMessageById("missing")).toBeNull()
  })

  it("filters, searches, paginates, and finds enabled fixtures", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "true")
    const {
      findMockMessageById,
      getMockMessagesPage,
      getMockMessagesTotalCount,
      getMockUnreadCount,
    } = await import("./messages")

    const unread = getMockMessagesPage({
      search: null,
      page: 1,
      pageSize: 2,
      status: "unread",
    })
    const read = getMockMessagesPage({
      search: null,
      page: 1,
      pageSize: 2,
      status: "read",
    })

    expect(unread.every((message) => !message.isSeen)).toBe(true)
    expect(read.every((message) => message.isSeen)).toBe(true)
    expect(getMockUnreadCount()).toBeGreaterThan(0)
    expect(getMockMessagesTotalCount("payslip")).toBeGreaterThan(0)
    expect(
      getMockMessagesTotalCount("department of education"),
    ).toBeGreaterThan(0)
    expect(getMockMessagesTotalCount("definitely missing")).toBe(0)
    expect(
      findMockMessageById("00000001-0000-4000-8000-000000000001")?.subject,
    ).toContain("payslip")
    expect(findMockMessageById("missing")).toBeNull()
  })

  it("paginates without repeating rows", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "true")
    const { getMockMessagesPage } = await import("./messages")

    const first = getMockMessagesPage({
      search: null,
      page: 1,
      pageSize: 1,
    })
    const second = getMockMessagesPage({
      search: null,
      page: 2,
      pageSize: 1,
    })

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(second[0]?.id).not.toBe(first[0]?.id)
  })
})
