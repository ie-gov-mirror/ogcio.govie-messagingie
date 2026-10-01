import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

let fetchState: {
  data: { publicName?: string } | undefined
  error?: Error
} = {
  data: undefined,
}
const fetchCalls: Array<string | null> = []

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (path: string | null) => {
    fetchCalls.push(path)
    return fetchState
  },
}))

// Driven explicitly: `useIdleMount`'s `NODE_ENV === "test"` shortcut would
// make these assertions depend on the ambient NODE_ENV.
const idle = vi.hoisted(() => ({ ready: true }))
vi.mock("@/hooks/use-idle-mount", () => ({
  useIdleMount: () => idle.ready,
}))

import type { AuthUser } from "@ogcio/sag-client"
import { usePublicName } from "@/hooks/use-public-name"
import { clearNavSnapshot, readNavName } from "@/util/nav-snapshot"

/**
 * The chain is `profile.publicName -> user.name -> user.email -> ""`, but the
 * tiers below `publicName` must only be reached once the lookup has *settled*
 * — falling back while it is in flight paints one valid name and then swaps
 * to the other.
 */
describe("usePublicName", () => {
  beforeEach(() => {
    fetchState = { data: undefined }
    fetchCalls.length = 0
    idle.ready = true
    clearNavSnapshot()
  })

  const user = (extra: Record<string, unknown> = {}) =>
    ({ sub: "user-1", ...extra }) as unknown as AuthUser

  it("returns profile.publicName when the profile fetch resolves", () => {
    fetchState = { data: { publicName: "Janet Citizen" } }
    const { result } = renderHook(() =>
      usePublicName(user({ name: "Jane Citizen", email: "jane@example.com" })),
    )
    expect(result.current.publicName).toBe("Janet Citizen")
    expect(result.current.isLoading).toBe(false)
  })

  it("reports loading while the profile lookup is still in flight", () => {
    const { result } = renderHook(() =>
      usePublicName(user({ name: "Jane Citizen" })),
    )
    expect(result.current.isLoading).toBe(true)
  })

  it("falls back to user.name once the profile lookup fails", () => {
    fetchState = { data: undefined, error: new Error("403") }
    const { result } = renderHook(() =>
      usePublicName(user({ name: "Jane Citizen", email: "jane@example.com" })),
    )
    expect(result.current.publicName).toBe("Jane Citizen")
    expect(result.current.isLoading).toBe(false)
  })

  it("falls back to user.name when the profile resolves without a publicName", () => {
    fetchState = { data: {} }
    const { result } = renderHook(() =>
      usePublicName(user({ name: "Jane Citizen", email: "jane@example.com" })),
    )
    expect(result.current.publicName).toBe("Jane Citizen")
    expect(result.current.isLoading).toBe(false)
  })

  it("falls back to user.email when the profile settled and user.name is missing", () => {
    fetchState = { data: {} }
    const { result } = renderHook(() =>
      usePublicName(user({ email: "jane@example.com" })),
    )
    expect(result.current.publicName).toBe("jane@example.com")
  })

  it("returns the empty string when the user has no identifiers", () => {
    fetchState = { data: {} }
    const { result } = renderHook(() => usePublicName(user()))
    expect(result.current.publicName).toBe("")
  })

  it("returns the empty string and is not loading when unauthenticated", () => {
    const { result } = renderHook(() => usePublicName(undefined))
    expect(result.current.publicName).toBe("")
    expect(result.current.isLoading).toBe(false)
  })

  it("pauses the gateway fetch (passes null path) until user.sub is available", () => {
    renderHook(() => usePublicName(undefined))
    expect(fetchCalls[0]).toBeNull()
  })

  it("calls the gateway with the profile path keyed on user.sub once auth resolves", () => {
    renderHook(() => usePublicName(user({ sub: "user-42" })))
    expect(fetchCalls[0]).toBe("/profile/api/v1/profiles/user-42")
  })

  it("skips the profile fetch when the display name is already stored", () => {
    document.cookie = "citizen_portal_nav_name=Andrew%20Parker"
    const { result } = renderHook(() =>
      usePublicName(user({ name: "Jane Citizen" })),
    )
    expect(fetchCalls[0]).toBeNull()
    expect(result.current.publicName).toBe("Andrew Parker")
    expect(result.current.isLoading).toBe(false)
  })

  it("stores a resolved public name so the next mount does not fetch", () => {
    fetchState = { data: { publicName: "Janet Citizen" } }
    const first = renderHook(() => usePublicName(user()))
    expect(first.result.current.publicName).toBe("Janet Citizen")
    expect(readNavName()).toBe("Janet Citizen")
    first.unmount()

    fetchCalls.length = 0
    const second = renderHook(() =>
      usePublicName(user({ name: "Jane Citizen" })),
    )
    expect(fetchCalls[0]).toBeNull()
    expect(second.result.current.publicName).toBe("Janet Citizen")
  })

  it("reports loading while the idle gate defers the profile fetch", () => {
    // Known user, name not yet fetched: still a swap risk, so still loading.
    idle.ready = false
    const { result } = renderHook(() =>
      usePublicName(user({ name: "Jane Citizen" })),
    )
    expect(fetchCalls[0]).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })
})
