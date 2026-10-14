import { describe, expect, it, vi } from "vitest"

vi.mock("@/utils/env", () => ({
  getEnvConfig: () => ({ BASE_URL: "https://support.test" }),
}))

const getAuthCodeUrl = vi.fn()
vi.mock("@/msal", () => ({
  buildMsalClient: () => ({ getAuthCodeUrl }),
  msalScopes: ["openid"],
}))

const { GET } = await import("./route")

describe("GET /api/auth/signin", () => {
  it("redirects to the msal auth url and sets state and nonce cookies", async () => {
    getAuthCodeUrl.mockResolvedValue("https://login.microsoftonline.com/auth")

    const res = await GET()

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://login.microsoftonline.com/auth",
    )

    const args = getAuthCodeUrl.mock.calls[0][0]
    expect(args.redirectUri).toBe("https://support.test/api/auth/callback")
    expect(args.state).toBeTruthy()
    expect(args.nonce).toBeTruthy()

    const cookies = res.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith(`auth_state=${args.state}`))).toBe(
      true,
    )
    expect(cookies.some((c) => c.startsWith(`auth_nonce=${args.nonce}`))).toBe(
      true,
    )
    for (const c of cookies) {
      expect(c.toLowerCase()).toContain("httponly")
    }
    expect(
      cookies.some(
        (c) => c.startsWith("logged_out=") && c.includes("Max-Age=0"),
      ),
    ).toBe(true)
  })
})
