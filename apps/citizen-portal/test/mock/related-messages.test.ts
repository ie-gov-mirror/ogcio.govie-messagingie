import { afterEach, describe, expect, it, vi } from "vitest"

describe("related message mocks", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns related messages for a submission when mocks are enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "true")
    const { getMockRelatedMessages } = await import("@/mock/related-messages")

    const messages = getMockRelatedMessages("SCH-2025-073296")
    expect(messages).toHaveLength(1)
    expect(messages[0]?.id).toBe("rel-sch-073296-completed")
  })

  it("returns local journey seed related messages when LEA is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "false")
    vi.stubEnv("NEXT_PUBLIC_ENABLE_LEA", "true")
    const { getMockRelatedMessages } = await import("@/mock/related-messages")

    const messages = getMockRelatedMessages("PPMG0004")
    expect(messages).toHaveLength(2)
    expect(messages[0]?.id).toBe("rel-ppm-g004-received")
  })

  it("resolves related message ids through findMockMessageById when mocks are enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "true")
    const { findMockMessageById } = await import("@/mock/messages")

    const message = findMockMessageById("rel-sch-084321-approved")
    expect(message).toMatchObject({
      id: "rel-sch-084321-approved",
      subject: "School placement registration approved",
      plainText: expect.stringContaining("approved"),
    })
  })

  it("resolves related message ids when only LEA fixtures are enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "false")
    vi.stubEnv("NEXT_PUBLIC_ENABLE_LEA", "true")
    const { findMockMessageById } = await import("@/mock/messages")

    const message = findMockMessageById("rel-ppm-g004-received")
    expect(message).toMatchObject({
      id: "rel-ppm-g004-received",
      subject: "Driving licence renewal application received",
    })
  })

  it("resolves the parent submission for a related message id", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "true")
    const { findMockSubmissionIdForRelatedMessage } = await import(
      "@/mock/related-messages"
    )

    expect(
      findMockSubmissionIdForRelatedMessage("rel-sch-073296-completed"),
    ).toBe("SCH-2025-073296")
  })

  it("returns null when mocks and LEA fixtures are disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCK_MESSAGES", "false")
    vi.stubEnv("NEXT_PUBLIC_ENABLE_LEA", "false")
    const { findMockMessageById } = await import("@/mock/messages")
    const { findMockSubmissionIdForRelatedMessage } = await import(
      "@/mock/related-messages"
    )

    expect(findMockMessageById("rel-sch-073296-completed")).toBeNull()
    expect(
      findMockSubmissionIdForRelatedMessage("rel-sch-073296-completed"),
    ).toBeNull()
  })
})
