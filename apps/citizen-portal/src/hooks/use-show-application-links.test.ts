import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  useApplicationLinksState,
  useShowApplicationLinks,
} from "./use-show-application-links"

vi.mock("@ogcio/sag-client/react", () => ({
  isCitizenOnboarded: vi.fn(),
  useAuth: vi.fn(),
  useGatewayFetch: vi.fn(),
}))

import {
  isCitizenOnboarded,
  useAuth,
  useGatewayFetch,
} from "@ogcio/sag-client/react"

const mockUseAuth = vi.mocked(useAuth)
const mockUseGatewayFetch = vi.mocked(useGatewayFetch)
const mockIsCitizenOnboarded = vi.mocked(isCitizenOnboarded)

afterEach(() => {
  vi.clearAllMocks()
})

describe("useShowApplicationLinks", () => {
  it("returns false for citizens who are not onboarded", () => {
    mockUseAuth.mockReturnValue({
      user: { sub: "u1" },
      claims: { roles: ["citizen"], organizations: [], organization_roles: [] },
      loading: false,
    } as ReturnType<typeof useAuth>)
    mockIsCitizenOnboarded.mockReturnValue(false)
    mockUseGatewayFetch.mockReturnValue({
      data: undefined,
      isLoading: false,
      isValidating: false,
    } as ReturnType<typeof useGatewayFetch>)

    const { result } = renderHook(() => useShowApplicationLinks())

    expect(result.current).toBe(false)
    expect(mockUseGatewayFetch).toHaveBeenCalledWith(null)
  })

  it("returns false for onboarded citizens with SAFE level below 2", () => {
    mockUseAuth.mockReturnValue({
      user: { sub: "u1" },
      claims: {
        roles: ["Onboarded citizen"],
        organizations: [],
        organization_roles: [],
      },
      loading: false,
    } as ReturnType<typeof useAuth>)
    mockIsCitizenOnboarded.mockReturnValue(true)
    mockUseGatewayFetch.mockReturnValue({
      data: { safeLevel: 1 },
      isLoading: false,
      isValidating: false,
    } as ReturnType<typeof useGatewayFetch>)

    const { result } = renderHook(() => useShowApplicationLinks())

    expect(result.current).toBe(false)
  })

  it("returns true for onboarded citizens with SAFE level 2 or higher", () => {
    mockUseAuth.mockReturnValue({
      user: { sub: "u1" },
      claims: {
        roles: ["Onboarded citizen"],
        organizations: [],
        organization_roles: [],
      },
      loading: false,
    } as ReturnType<typeof useAuth>)
    mockIsCitizenOnboarded.mockReturnValue(true)
    mockUseGatewayFetch.mockReturnValue({
      data: { safeLevel: 2 },
      isLoading: false,
      isValidating: false,
    } as ReturnType<typeof useGatewayFetch>)

    const { result } = renderHook(() => useShowApplicationLinks())

    expect(result.current).toBe(true)
  })

  it("reports unknown while its auth check is still running", () => {
    mockUseAuth.mockReturnValue({
      user: undefined,
      claims: undefined,
      loading: true,
    } as ReturnType<typeof useAuth>)
    mockIsCitizenOnboarded.mockReturnValue(false)
    mockUseGatewayFetch.mockReturnValue({
      data: undefined,
      isLoading: false,
      isValidating: false,
    } as ReturnType<typeof useGatewayFetch>)

    expect(renderHook(() => useApplicationLinksState()).result.current).toBe(
      undefined,
    )
    expect(renderHook(() => useShowApplicationLinks()).result.current).toBe(
      false,
    )
  })
})
