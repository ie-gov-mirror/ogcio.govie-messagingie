import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildSslConfig,
  getCaCertCandidates,
  isSslEnabled,
  resolveCaCertPath,
} from "./ssl"

describe("isSslEnabled", () => {
  it("returns true only for the exact string 'true'", () => {
    expect(isSslEnabled("true")).toBe(true)
  })

  it("returns false for the string 'false' (regression: was truthy)", () => {
    expect(isSslEnabled("false")).toBe(false)
  })

  it("returns false for an empty string", () => {
    expect(isSslEnabled("")).toBe(false)
  })

  it("returns false for other truthy-looking strings", () => {
    expect(isSslEnabled("TRUE")).toBe(false)
    expect(isSslEnabled("1")).toBe(false)
  })
})

describe("getCaCertCandidates", () => {
  it("returns the container path first, then the app-relative path", () => {
    const candidates = getCaCertCandidates("/app")
    expect(candidates).toStrictEqual([
      "/app/data/certificates/global-bundle.pem",
    ])
  })
})

describe("resolveCaCertPath", () => {
  it("returns an existing cert path when run from the app directory", () => {
    // Vitest runs with cwd at the app directory, where the committed
    // global-bundle.pem exists under data/certificates/.
    const resolved = resolveCaCertPath(process.cwd())
    expect(
      resolved.endsWith(path.join("data", "certificates", "global-bundle.pem")),
    ).toBe(true)
    expect(existsSync(resolved)).toBe(true)
  })

  it("throws a clear error naming the candidates when none exist", () => {
    expect(() => resolveCaCertPath("/nonexistent-root")).toThrowError(
      /CA bundle was not found.*global-bundle\.pem/,
    )
  })
})

describe("buildSslConfig", () => {
  it("returns false when SSL is disabled", () => {
    expect(buildSslConfig(false, Buffer.from("ignored"))).toBe(false)
  })

  it("returns a config that verifies the server certificate when enabled", () => {
    const ca = Buffer.from("ca-bytes")
    expect(buildSslConfig(true, ca)).toStrictEqual({
      rejectUnauthorized: true,
      ca,
    })
  })
})
