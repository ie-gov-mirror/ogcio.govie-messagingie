import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const RETURN_URL = "https://journey.uat.services.gov.ie/journey/abc-123"
const BASE_URL = "https://citizen.uat.test"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "https://messages.uat.test",
      profile: "https://profile.uat.test",
      dashboard: "https://dashboard.uat.test",
    },
  }),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams({
      returnUrl: "https://journey.uat.services.gov.ie/journey/abc-123",
    }),
}))

vi.mock("@/env/env.client", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://citizen.uat.test",
    NEXT_PUBLIC_JOURNEY_URL: "https://journey.uat.services.gov.ie",
    NEXT_PUBLIC_SAG_URL: "https://sag.uat.test",
  },
}))

import { WrongAccountErrorClient } from "./wrong-account-error-client"

afterEach(() => {
  vi.clearAllMocks()
})

describe("WrongAccountErrorClient", () => {
  it("links the Log out button to global-signout with citizen role, not the gateway", () => {
    render(<WrongAccountErrorClient />)

    const link = screen.getByRole("link", { name: "logOutBttn" })
    const href = link.getAttribute("href") ?? ""
    const url = new URL(href)

    expect(url.origin).toBe(BASE_URL)
    expect(url.pathname).toBe("/en/global-signout")
    expect(href).not.toContain("/auth/clear-session")
    expect(url.searchParams.get("postRedirectUri")).toBe(RETURN_URL)
    expect(url.searchParams.get("role")).toBe("citizen")
    expect(url.searchParams.get("sagSignout")).toBeNull()
  })
})
