import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type AuthState = {
  user: { sub?: string } | undefined
  claims: { roles?: string[] } | undefined
  loading: boolean
}

type FetchState = {
  data: { safeLevel?: number } | undefined
  isLoading: boolean
  isValidating: boolean
}

let authState: AuthState = {
  user: undefined,
  claims: undefined,
  loading: false,
}
let fetchState: FetchState = {
  data: undefined,
  isLoading: false,
  isValidating: false,
}
let onboarded = true

vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => authState,
  isCitizenOnboarded: () => onboarded,
  useGatewayFetch: () => fetchState,
}))

import { useShowApplicationLinks } from "@/hooks/use-show-application-links"

/**
 * `useShowApplicationLinks` gates the cross-application drawer links
 * (Dashboard, MessagingIE, view-my-profile). The regression this suite
 * protects against (no ticket — reported flicker): SWR revalidates the
 * profile fetch on window focus, and gating visibility on `isValidating`
 * made the links vanish and reappear every time the menu regained focus.
 * The contract is now: show links optimistically for onboarded citizens,
 * keep them painted through background revalidations, and only drop them if
 * the resolved profile genuinely reports a SAFE level below 2.
 */
describe("useShowApplicationLinks", () => {
  beforeEach(() => {
    authState = {
      user: { sub: "user-1" },
      claims: { roles: [] },
      loading: false,
    }
    fetchState = { data: undefined, isLoading: false, isValidating: false }
    onboarded = true
  })

  it("hides links while auth is still loading", () => {
    authState = { ...authState, loading: true }
    const { result } = renderHook(() => useShowApplicationLinks())
    expect(result.current).toBe(false)
  })

  it("hides links when there is no authenticated user", () => {
    authState = { ...authState, user: undefined }
    const { result } = renderHook(() => useShowApplicationLinks())
    expect(result.current).toBe(false)
  })

  it("hides links when the citizen is not onboarded", () => {
    onboarded = false
    const { result } = renderHook(() => useShowApplicationLinks())
    expect(result.current).toBe(false)
  })

  it("shows links optimistically during the initial profile load (no cached data yet)", () => {
    fetchState = { data: undefined, isLoading: true, isValidating: true }
    const { result } = renderHook(() => useShowApplicationLinks())
    expect(result.current).toBe(true)
  })

  it("shows links once the profile has resolved even if safeLevel is absent", () => {
    // Local/dev profiles often omit safeLevel; the links must still show.
    fetchState = { data: {}, isLoading: false, isValidating: false }
    const { result } = renderHook(() => useShowApplicationLinks())
    expect(result.current).toBe(true)
  })

  it("keeps links painted through a background revalidation (focus flicker fix)", () => {
    // The regression: on window focus SWR sets isValidating=true while
    // keeping cached data. Because safeLevel is undefined in dev, gating
    // on isValidating dropped the links. isLoading is false here, so they
    // must stay visible.
    fetchState = { data: {}, isLoading: false, isValidating: true }
    const { result } = renderHook(() => useShowApplicationLinks())
    expect(result.current).toBe(true)
  })

  it("hides links when the resolved profile is below the required SAFE level", () => {
    fetchState = {
      data: { safeLevel: 1 },
      isLoading: false,
      isValidating: false,
    }
    const { result } = renderHook(() => useShowApplicationLinks())
    expect(result.current).toBe(false)
  })

  it("shows links when the profile meets the required SAFE level", () => {
    fetchState = {
      data: { safeLevel: 2 },
      isLoading: false,
      isValidating: false,
    }
    const { result } = renderHook(() => useShowApplicationLinks())
    expect(result.current).toBe(true)
  })
})
