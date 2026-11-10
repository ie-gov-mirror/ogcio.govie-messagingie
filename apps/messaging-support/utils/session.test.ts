// @vitest-environment node
// jose rejects Uint8Arrays created in jsdom's realm, so this pure-server
// module is tested in the node environment.
import { SignJWT, UnsecuredJWT } from "jose"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const cookieGet = vi.fn()
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}))

vi.mock("@/utils/env", () => ({
  getEnvConfig: () => ({ COOKIE_SECRET: "test-secret" }),
}))

const { getIdentity } = await import("./session")

const claims = { sub: "agent-1", name: "Agent One", email: "agent@gov.ie" }

function signSession(secret: string, expiresAt: string | number = "1h") {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret))
}

beforeEach(() => {
  cookieGet.mockReset()
})

describe("getIdentity", () => {
  it("returns the identity for a validly signed session", async () => {
    cookieGet.mockReturnValue({ value: await signSession("test-secret") })

    expect(await getIdentity()).toEqual(claims)
  })

  it("returns null for an unsigned session", async () => {
    cookieGet.mockReturnValue({ value: new UnsecuredJWT(claims).encode() })

    expect(await getIdentity()).toBeNull()
  })

  it("returns null for a session signed with the wrong secret", async () => {
    cookieGet.mockReturnValue({ value: await signSession("wrong-secret") })

    expect(await getIdentity()).toBeNull()
  })

  it("returns null for an expired session", async () => {
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600
    cookieGet.mockReturnValue({
      value: await signSession("test-secret", anHourAgo),
    })

    expect(await getIdentity()).toBeNull()
  })
})
