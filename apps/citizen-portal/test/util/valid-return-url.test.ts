import { describe, expect, it } from "vitest"
import { getValidReturnUrl } from "@/util/valid-return-url"

const TRUSTED_ORIGINS = [
  "https://messaging.dev.services.gov.ie",
  "https://profile.dev.services.gov.ie",
  "https://journey.dev.services.gov.ie",
  "http://messaging.local.test:8080",
]

const validate = (raw: string | null | undefined) =>
  getValidReturnUrl(raw, TRUSTED_ORIGINS)

describe("getValidReturnUrl", () => {
  describe("nullish + empty", () => {
    it.each([
      null,
      undefined,
      "",
      "   ",
      "\t\n",
    ])("returns null for %p", (raw) => {
      expect(validate(raw)).toBeNull()
    })
  })

  describe("malformed inputs", () => {
    it.each([
      "not a url",
      "example.com/path",
      " https://profile.dev.services.gov.ie",
      "https://profile.dev.services.gov.ie ",
    ])("returns null for %s", (raw) => {
      expect(validate(raw)).toBeNull()
    })
  })

  describe("untrusted destinations", () => {
    it.each([
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "about:blank",
      "ftp://example.com/secret",
      "https://example.com",
      "https://profile.dev.services.gov.ie.evil.com",
      "https://user:password@profile.dev.services.gov.ie",
      "//example.com",
      "/\\example.com",
      "%2F%2Fexample.com",
      "%252F%252Fexample.com",
      "https%3A%2F%2Fexample.com",
    ])("rejects %s", (raw) => {
      expect(validate(raw)).toBeNull()
    })
  })

  describe("trusted destinations", () => {
    it.each([
      "/",
      "/en/messages?return=%2Fhome#latest",
      "http://messaging.local.test:8080",
      "https://messaging.dev.services.gov.ie",
      "https://messaging.dev.services.gov.ie/en/messages?id=abc",
      "https://profile.dev.services.gov.ie/en/my-profile",
      "https://journey.dev.services.gov.ie/en/journey/abc",
    ])("returns %s verbatim", (raw) => {
      expect(validate(raw)).toBe(raw)
    })
  })
})
