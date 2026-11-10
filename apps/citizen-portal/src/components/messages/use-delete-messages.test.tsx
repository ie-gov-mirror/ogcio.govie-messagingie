import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDeleteMessages } from "@/components/messages/use-delete-messages"
import { fakeAnalytics } from "../../../test/utils/analytics"

const trigger = vi.fn()

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayMutation: () => ({ trigger, isLoading: false }),
}))

describe("useDeleteMessages", () => {
  beforeEach(() => {
    trigger.mockReset()
    trigger.mockResolvedValue({})
  })

  it("tracks a successful delete with the number of messages deleted", async () => {
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useDeleteMessages(), {
      wrapper: analytics.wrapper,
    })

    await act(async () => {
      await result.current.deleteIds(["msg-1", "msg-2", "msg-3"])
    })

    expect(analytics.event).toHaveBeenCalledWith({
      event: {
        name: "message-delete",
        category: "Message",
        action: "Messages Deleted",
        value: 3,
      },
    })
  })

  it("sends nothing when the delete fails", async () => {
    trigger.mockRejectedValueOnce(new Error("boom"))
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useDeleteMessages(), {
      wrapper: analytics.wrapper,
    })

    await act(async () => {
      await result.current.deleteIds(["msg-1"])
    })

    expect(analytics.event).not.toHaveBeenCalled()
  })
})
