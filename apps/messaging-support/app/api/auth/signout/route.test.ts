import { describe, expect, it, vi } from "vitest"

vi.mock("@/utils/env", () => ({
  getEnvConfig: () => ({ BASE_URL: "https://support.test" }),
}))

const { GET } = await import("./route")

describe("GET /api/auth/signout", () => {
  it("clears the session cookie and lands on the signed-out page", async () => {
    const res = await GET()

    expect(res.status).toBe(307)
    const location = res.headers.get("location")
    expect(location).toBe("https://support.test/signed-out")
    expect(location).not.toContain("login.microsoftonline.com")
    expect(res.headers.get("cache-control")).toBe("no-store")
    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("session=")
    expect(setCookie.toLowerCase()).toContain("expires=thu, 01 jan 1970")

    const cookies = res.headers.getSetCookie()
    const loggedOut = cookies.find((c) => c.startsWith("logged_out=1;"))
    expect(loggedOut).toBeDefined()
    expect(loggedOut?.toLowerCase()).toContain("httponly")
    expect(loggedOut?.toLowerCase()).toContain("samesite=lax")
    expect(loggedOut?.toLowerCase()).toContain("path=/")
  })
})
