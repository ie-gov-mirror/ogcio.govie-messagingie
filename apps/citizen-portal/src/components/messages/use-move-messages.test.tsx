import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useMoveMessages } from "@/components/messages/use-move-messages"
import { fakeAnalytics } from "../../../test/utils/analytics"

const trigger = vi.fn()

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayMutation: () => ({ trigger, isLoading: false }),
}))

describe("useMoveMessages", () => {
  beforeEach(() => {
    trigger.mockReset()
    trigger.mockResolvedValue({ tagId: "tag-ehic", messageIds: ["msg-1"] })
  })

  it("assigns the tag and returns a deduped success result", async () => {
    const onSettled = vi.fn()
    const { result } = renderHook(() => useMoveMessages({ onSettled }))

    let moveResult: Awaited<ReturnType<typeof result.current.moveIds>>
    await act(async () => {
      moveResult = await result.current.moveIds(["msg-1", "msg-1"], "tag-ehic")
    })

    expect(trigger).toHaveBeenCalledWith({
      tagId: "tag-ehic",
      messageIds: ["msg-1"],
    })
    expect(moveResult!).toEqual({
      ok: true,
      ids: ["msg-1"],
      folderId: "tag-ehic",
    })
    expect(result.current.lastResult).toEqual(moveResult!)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it("returns a failure result when the gateway rejects", async () => {
    trigger.mockRejectedValueOnce(new Error("boom"))
    const { result } = renderHook(() => useMoveMessages())

    let moveResult: Awaited<ReturnType<typeof result.current.moveIds>>
    await act(async () => {
      moveResult = await result.current.moveIds(["msg-1"], null)
    })

    expect(moveResult!).toEqual({ ok: false, ids: ["msg-1"], folderId: null })
  })

  it("clears lastResult when dismissResult is called", async () => {
    const { result } = renderHook(() => useMoveMessages())

    await act(async () => {
      await result.current.moveIds(["msg-1"], null)
    })
    expect(result.current.lastResult).not.toBeNull()

    act(() => {
      result.current.dismissResult()
    })
    expect(result.current.lastResult).toBeNull()
  })

  it("tracks a successful move with the number of messages moved", async () => {
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useMoveMessages(), {
      wrapper: analytics.wrapper,
    })

    await act(async () => {
      await result.current.moveIds(["msg-1", "msg-2"], "tag-ehic")
    })

    expect(analytics.event).toHaveBeenCalledWith({
      event: {
        name: "message-move",
        category: "Message",
        action: "Messages Moved",
        value: 2,
      },
    })
  })

  it("sends nothing when the move fails", async () => {
    trigger.mockRejectedValueOnce(new Error("boom"))
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useMoveMessages(), {
      wrapper: analytics.wrapper,
    })

    await act(async () => {
      await result.current.moveIds(["msg-1"], null)
    })

    expect(analytics.event).not.toHaveBeenCalled()
  })
})
