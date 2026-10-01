import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useOrganizationContext } from "./use-organization-context"

const { selectOrganization, useAuth, useSagClient } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3022"
  process.env.NEXT_PUBLIC_SAG_URL ??= "http://localhost:3030"
  return {
    selectOrganization: vi.fn(),
    useAuth: vi.fn(),
    useSagClient: vi.fn(),
  }
})

vi.mock("@ogcio/sag-client/react", () => ({
  PROFILE_PUBLIC_SERVANT_ROLE_NAME: "profile-role",
  useAuth,
  useSagClient,
}))
vi.mock("@/util/profile-admin/last-selected-org", () => ({
  persistLastSelectedOrganization: vi.fn(),
}))

describe(useOrganizationContext.name, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({
      claims: { organizations: ["org-1"] },
      user: { sub: "user-1" },
    })
    useSagClient.mockReturnValue({
      appName: "profile",
      gatewayUrl: undefined,
      selectOrganization,
    })
    selectOrganization.mockResolvedValue(false)
  })

  it("loads only profile organizations and falls back to the first one", async () => {
    const eligible = {
      id: "org-1",
      name: "Profile",
      roles: ["profile-role"],
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            organizations: [
              eligible,
              { id: "org-2", name: "Other", roles: undefined },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ organizationId: null }),
        }),
    )

    const { result } = renderHook(() => useOrganizationContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.organizations).toEqual([eligible])
    expect(result.current.currentOrganization).toEqual(eligible)
  })

  it("handles unavailable data and rejected selections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    const { result } = renderHook(() => useOrganizationContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(() => result.current.setOrganization(""))
    await act(() => result.current.setOrganization("org-1"))
    await act(() => result.current.setOrganization("org-2"))

    expect(result.current.organizations).toEqual([])
    expect(selectOrganization).toHaveBeenCalledOnce()
    expect(selectOrganization).toHaveBeenCalledWith("org-2")
  })
})
