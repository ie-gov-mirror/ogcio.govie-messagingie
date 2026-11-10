import { describe, expect, it, vi } from "vitest"

vi.mock("@/utils/env", () => ({
  getEnvConfig: () => ({
    BASE_URL: "https://support.test",
    MICROSOFT_TENANT_ID: "tenant-123",
  }),
}))

const { GET } = await import("./route")

describe("GET /api/auth/signout", () => {
  it("clears the session cookie and ends the Entra session", async () => {
    const res = await GET()

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location") ?? "")
    expect(location.origin + location.pathname).toBe(
      "https://login.microsoftonline.com/tenant-123/oauth2/v2.0/logout",
    )
    expect(location.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://support.test/api/auth/callback",
    )
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
