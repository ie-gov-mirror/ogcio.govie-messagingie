import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MOBILE_MEDIA_QUERY, useIsMobile } from "./use-is-mobile"

describe("useIsMobile", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("stays desktop-first when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined)
    const { result } = renderHook(useIsMobile)
    expect(result.current).toBe(false)
  })

  it("tracks media query changes and removes its listener", () => {
    let onChange: (() => void) | undefined
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn((_event, listener) => {
        onChange = listener
      }),
      removeEventListener: vi.fn(),
    }
    const matchMedia = vi.fn(() => mediaQuery)
    vi.stubGlobal("matchMedia", matchMedia)

    const { result, unmount } = renderHook(useIsMobile)
    expect(MOBILE_MEDIA_QUERY).toBe("(max-width: 1023px)")
    expect(matchMedia).toHaveBeenCalledWith(MOBILE_MEDIA_QUERY)
    expect(result.current).toBe(true)

    mediaQuery.matches = false
    act(() => onChange?.())
    expect(result.current).toBe(false)

    unmount()
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      onChange,
    )
  })
})
