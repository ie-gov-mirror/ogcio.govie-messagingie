import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ANALYTICS } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"
import { fakeAnalytics } from "../../test/utils/analytics"

describe("useTrack", () => {
  it("sends a catalogue event to Matomo", () => {
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useTrack(), {
      wrapper: analytics.wrapper,
    })

    result.current.event(ANALYTICS.message.back)

    expect(analytics.event).toHaveBeenCalledWith({
      event: {
        name: "message-back-click",
        category: "Message",
        action: "Return to List",
      },
    })
  })

  it("sends a value with the event when given one", () => {
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useTrack(), {
      wrapper: analytics.wrapper,
    })

    result.current.event(ANALYTICS.message.back, 3)

    expect(analytics.event).toHaveBeenCalledWith({
      event: {
        name: "message-back-click",
        category: "Message",
        action: "Return to List",
        value: 3,
      },
    })
  })

  it("never lets an analytics failure reach the caller", () => {
    const analytics = fakeAnalytics()
    analytics.event.mockRejectedValueOnce(new Error("matomo down"))
    analytics.event.mockImplementationOnce(() => {
      throw new Error("matomo down")
    })
    const { result } = renderHook(() => useTrack(), {
      wrapper: analytics.wrapper,
    })

    expect(() => result.current.event(ANALYTICS.message.back)).not.toThrow()
    expect(() => result.current.event(ANALYTICS.message.back)).not.toThrow()
  })

  it("does nothing outside an analytics provider", () => {
    const { result } = renderHook(() => useTrack())

    expect(() => result.current.event(ANALYTICS.message.back)).not.toThrow()
  })
})
