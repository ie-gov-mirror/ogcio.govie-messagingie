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
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME: "messaging-role",
  useAuth,
  useSagClient,
}))
vi.mock("@/util/last-selected-org", () => ({
  persistLastSelectedOrganization: vi.fn(),
}))

const organization = {
  id: "org-1",
  name: "Messaging",
  roles: ["messaging-role"],
}

describe(useOrganizationContext.name, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({
      claims: { organizations: ["org-1"] },
      user: { sub: "user-1" },
    })
    useSagClient.mockReturnValue({
      appName: "messaging",
      gatewayUrl: "http://gateway.test",
      selectOrganization,
    })
    selectOrganization.mockResolvedValue(false)
  })

  it("loads eligible organizations and the selected organization", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            organizations: [
              organization,
              { id: "org-2", name: "Other", roles: ["other-role"] },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ organizationId: "org-1" }),
        }),
    )

    const { result } = renderHook(() => useOrganizationContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.organizations).toEqual([organization])
    expect(result.current.currentOrganization).toEqual(organization)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("handles failed responses and no-op organization selections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    const { result } = renderHook(() => useOrganizationContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(() => result.current.setOrganization(""))
    await act(() => result.current.setOrganization("org-1"))
    await act(() => result.current.setOrganization("org-2"))

    expect(result.current.organizations).toEqual([])
    expect(result.current.currentOrganization).toBeUndefined()
    expect(selectOrganization).toHaveBeenCalledOnce()
    expect(selectOrganization).toHaveBeenCalledWith("org-2")
  })
})
