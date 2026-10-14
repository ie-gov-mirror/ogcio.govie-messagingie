// @vitest-environment node
// jose signs the session cookie in this route; jsdom-realm Uint8Arrays are
// rejected by jose, so this pure-server route is tested in the node env.
import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/utils/env", () => ({
  getEnvConfig: () => ({
    BASE_URL: "https://support.test",
    MICROSOFT_TENANT_ID: "tenant-1",
    MICROSOFT_CLIENT_ID: "client-1",
    COOKIE_SECRET: "cookie-secret",
  }),
}))

const cookieGet = vi.fn()
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}))

const acquireTokenByCode = vi.fn()
vi.mock("@/msal", () => ({
  buildMsalClient: () => ({ acquireTokenByCode }),
  msalScopes: ["openid"],
}))

const jwtVerifyMock = vi.fn()
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>()
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => "jwks"),
    jwtVerify: (...args: unknown[]) => jwtVerifyMock(...args),
  }
})

const sendLogs = vi.fn(async (_logs: unknown) => ({
  data: [{ id: "log-1" }],
}))
vi.mock("@/data/sdk", () => ({
  getSupportSdk: () => ({
    auditCollector: { sendLogs: (logs: unknown) => sendLogs(logs) },
  }),
}))

// next's `after` needs a request scope; run the callback inline instead.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return { ...actual, after: (fn: () => unknown) => void fn() }
})

const { GET } = await import("./route")

function request(params: Record<string, string>): NextRequest {
  const url = new URL("https://support.test/api/auth/callback")
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return { url: url.toString() } as NextRequest
}

function stubCookies(values: Record<string, string>) {
  cookieGet.mockImplementation((name: string) =>
    values[name] !== undefined ? { value: values[name] } : undefined,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/auth/callback", () => {
  it("redirects with missing_code_or_state when params are absent", async () => {
    const res = await GET(request({}))

    expect(res.headers.get("location")).toBe(
      "https://support.test/auth/error?reason=missing_code_or_state",
    )
  })

  it("redirects with invalid_state when the state cookie mismatches", async () => {
    stubCookies({ auth_state: "other-state", auth_nonce: "n-1" })

    const res = await GET(request({ code: "c-1", state: "state-1" }))

    expect(res.headers.get("location")).toBe(
      "https://support.test/auth/error?reason=invalid_state",
    )
  })

  it("redirects with missing_nonce_cookie when the nonce cookie is absent", async () => {
    stubCookies({ auth_state: "state-1" })

    const res = await GET(request({ code: "c-1", state: "state-1" }))

    expect(res.headers.get("location")).toBe(
      "https://support.test/auth/error?reason=missing_nonce_cookie",
    )
  })

  it("redirects with invalid_nonce when the id token nonce mismatches", async () => {
    stubCookies({ auth_state: "state-1", auth_nonce: "nonce-1" })
    acquireTokenByCode.mockResolvedValue({ idToken: "id-token" })
    jwtVerifyMock.mockResolvedValue({ payload: { nonce: "other-nonce" } })

    const res = await GET(request({ code: "c-1", state: "state-1" }))

    expect(res.headers.get("location")).toBe(
      "https://support.test/auth/error?reason=invalid_nonce",
    )
  })

  it("redirects with token_exchange_failed when msal throws", async () => {
    stubCookies({ auth_state: "state-1", auth_nonce: "nonce-1" })
    acquireTokenByCode.mockRejectedValue(new Error("msal down"))

    const res = await GET(request({ code: "c-1", state: "state-1" }))

    expect(res.headers.get("location")).toBe(
      "https://support.test/auth/error?reason=token_exchange_failed",
    )
  })

  it("sets the session cookie, expires the auth cookies and redirects home", async () => {
    stubCookies({ auth_state: "state-1", auth_nonce: "nonce-1" })
    acquireTokenByCode.mockResolvedValue({ idToken: "id-token" })
    jwtVerifyMock.mockResolvedValue({
      payload: {
        nonce: "nonce-1",
        sub: "user-1",
        name: "Agent",
        preferred_username: "agent@gov.ie",
      },
    })

    const res = await GET(request({ code: "c-1", state: "state-1" }))

    expect(acquireTokenByCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "c-1",
        nonce: "nonce-1",
        scopes: ["openid"],
      }),
    )

    expect(res.headers.get("location")).toBe("https://support.test/")
    const cookies = res.headers.getSetCookie()
    expect(cookies.some((c) => /^session=[^;]+;/.test(c))).toBe(true)
    expect(
      cookies.some(
        (c) => c.startsWith("auth_state=") && c.includes("Max-Age=0"),
      ),
    ).toBe(true)
    expect(
      cookies.some(
        (c) => c.startsWith("auth_nonce=") && c.includes("Max-Age=0"),
      ),
    ).toBe(true)
    expect(
      cookies.some(
        (c) => c.startsWith("logged_out=") && c.includes("Max-Age=0"),
      ),
    ).toBe(true)

    // audit posted via after()
    expect(sendLogs).toHaveBeenCalledTimes(1)
    const [logs] = sendLogs.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
    ]
    expect(logs[0].user_id).toBe("user-1")
    expect(logs[0].action_type).toBe("create")
  })
})
