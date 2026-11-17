import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  useEraseMessages,
  useRestoreMessages,
} from "@/components/messages/use-restore-erase-messages"
import { fakeAnalytics } from "../../../test/utils/analytics"

const trigger = vi.fn()
const useGatewayMutation = vi.fn(() => ({ trigger, isLoading: false }))

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayMutation: (...args: unknown[]) =>
    // @ts-expect-error forwarding the call arguments to the spy
    useGatewayMutation(...args),
}))

describe.each([
  {
    name: "useRestoreMessages",
    useHook: useRestoreMessages,
    path: "/messaging/api/v1/messages/restore",
    event: { name: "message-restore", action: "Messages Restored" },
  },
  {
    name: "useEraseMessages",
    useHook: useEraseMessages,
    path: "/messaging/api/v1/messages/erase",
    event: { name: "message-erase", action: "Messages Erased" },
  },
])("$name", ({ useHook, path, event }) => {
  beforeEach(() => {
    trigger.mockReset()
    trigger.mockResolvedValue({})
    useGatewayMutation.mockClear()
  })

  it("POSTs the de-duplicated ids and reports the result", async () => {
    const analytics = fakeAnalytics()
    const onSettled = vi.fn()
    const { result } = renderHook(() => useHook({ onSettled }), {
      wrapper: analytics.wrapper,
    })

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.run(["a", "b", "a"])
    })

    expect(useGatewayMutation).toHaveBeenCalledWith(path, { method: "POST" })
    expect(trigger).toHaveBeenCalledWith({ ids: ["a", "b"] })
    expect(outcome).toEqual({ ok: true, ids: ["a", "b"] })
    expect(result.current.lastResult).toEqual({ ok: true, ids: ["a", "b"] })
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(analytics.event).toHaveBeenCalledWith({
      event: { ...event, category: "Message", value: 2 },
    })
  })

  it("reports a failure and tracks nothing", async () => {
    trigger.mockRejectedValueOnce(new Error("boom"))
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useHook(), {
      wrapper: analytics.wrapper,
    })

    await act(async () => {
      await result.current.run(["a"])
    })

    expect(result.current.lastResult).toEqual({ ok: false, ids: ["a"] })
    expect(analytics.event).not.toHaveBeenCalled()
  })
})
