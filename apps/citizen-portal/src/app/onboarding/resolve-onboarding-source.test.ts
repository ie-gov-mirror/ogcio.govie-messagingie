import { describe, expect, it } from "vitest"

import { resolveOnboardingSource } from "./resolve-onboarding-source"

const TRUSTED_ORIGINS = [
  "https://profile.dev.services.gov.ie",
  "https://journey.dev.services.gov.ie",
]
const resolve = (source: string | null) =>
  resolveOnboardingSource(source, TRUSTED_ORIGINS)

describe("resolveOnboardingSource", () => {
  it("returns null when source is missing", () => {
    expect(resolve(null)).toBeNull()
  })

  it("accepts journey preLogin URLs that mention onboarding only in query params", () => {
    const source =
      "https://journey.dev.services.gov.ie/en/preLogin?loginUrl=%2Fen%2Flogin&postLoginRedirectUrl=https%3A%2F%2Fjourney.dev.services.gov.ie%2Fen%2Fjourney%2Fabc&authMethods=social%3Amygovid&origin=validate-account-onboarding"

    expect(resolve(source)).toBe(source)
  })

  it("rejects sources whose pathname is the onboarding page", () => {
    expect(
      resolve(
        "https://profile.dev.services.gov.ie/onboarding?source=https%3A%2F%2Fapp.example",
      ),
    ).toBeNull()
  })

  it.each([
    "/onboarding",
    "/en/onboarding",
    "/%6fnboarding",
    "https://profile.dev.services.gov.ie/onboarding",
  ])("rejects onboarding loops at %s", (source) => {
    expect(resolve(source)).toBeNull()
  })

  it("rejects an external HTTPS source", () => {
    expect(
      resolve("https://journey.dev.services.gov.ie.evil.com"),
    ).toBeNull()
  })
})
