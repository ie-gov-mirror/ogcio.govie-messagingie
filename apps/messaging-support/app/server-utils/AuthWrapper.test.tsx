import { redirect } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"

const cookieGet = vi.fn()
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}))

const requireSession = vi.fn()
vi.mock("./session", () => ({
  requireSession: () => requireSession(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

const { default: AuthWrapper } = await import("./AuthWrapper")

describe("AuthWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("starts sign-in when there is no session and no logout marker", async () => {
    requireSession.mockResolvedValue(null)
    cookieGet.mockReturnValue(undefined)

    await expect(AuthWrapper({ children: null })).rejects.toThrow(
      "NEXT_REDIRECT:/api/auth/signin",
    )
    expect(redirect).toHaveBeenCalledWith("/api/auth/signin")
  })

  it("stays signed out when logged_out is set and there is no session", async () => {
    requireSession.mockResolvedValue(null)
    cookieGet.mockImplementation((name: string) =>
      name === "logged_out" ? { value: "1" } : undefined,
    )

    await expect(AuthWrapper({ children: null })).rejects.toThrow(
      "NEXT_REDIRECT:/signed-out",
    )
    expect(redirect).toHaveBeenCalledWith("/signed-out")
    expect(redirect).not.toHaveBeenCalledWith("/api/auth/signin")
  })
})
