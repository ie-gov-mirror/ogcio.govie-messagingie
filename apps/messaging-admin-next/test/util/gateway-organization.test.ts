import { afterEach, describe, expect, it, vi } from "vitest"
import { selectOrganization } from "@/util/gateway-organization"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("selectOrganization", () => {
  it("scopes organization selection to the requesting application", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      selectOrganization("http://localhost:3333", "messaging-admin", "org-1"),
    ).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3333/auth/select-organization?app=messaging-admin",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ organizationId: "org-1" }),
      }),
    )
  })
})
