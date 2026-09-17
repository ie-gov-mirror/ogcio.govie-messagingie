import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const BASE_URL = "https://citizen.uat.test"
const SAG_URL = "https://sag.uat.test"
const RETURN_URL = "https://journey.uat.services.gov.ie/journey/abc-123"

const { searchParamsHolder } = vi.hoisted(() => ({
  searchParamsHolder: { value: new URLSearchParams() },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsHolder.value,
}))

vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "https://messages.uat.test",
      profile: "https://profile.uat.test",
      dashboard: "https://dashboard.uat.test",
    },
    sagUrl: "https://sag.uat.test",
    sagAppName: "profile",
  }),
}))

vi.mock("@/env/env.client", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://citizen.uat.test",
    NEXT_PUBLIC_JOURNEY_URL: "https://journey.uat.services.gov.ie",
    NEXT_PUBLIC_SAG_URL: "https://sag.uat.test",
  },
}))

import ClearSessionPage from "./page"

let hrefValue = ""

beforeEach(() => {
  hrefValue = ""
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return hrefValue
      },
      set href(value: string) {
        hrefValue = value
      },
      hostname: "citizen.uat.test",
    },
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("ClearSessionPage redirect handling", () => {
  it("forwards the redirect URI into the global-signout handoff", () => {
    searchParamsHolder.value = new URLSearchParams({
      redirect: RETURN_URL,
      globalSignout: "true",
    })

    render(<ClearSessionPage />)

    const target = new URL(hrefValue)
    expect(target.origin).toBe(BASE_URL)
    expect(target.pathname).toBe("/en/global-signout")
    expect(target.searchParams.get("postRedirectUri")).toBe(RETURN_URL)
    expect(target.searchParams.get("sagSignout")).toBe("true")
  })

  it("navigates straight to the redirect URI when not a global signout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({})
    vi.stubGlobal("fetch", fetchMock)

    searchParamsHolder.value = new URLSearchParams({ redirect: RETURN_URL })

    render(<ClearSessionPage />)

    await waitFor(() => {
      expect(hrefValue).toBe(RETURN_URL)
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `${SAG_URL}/auth/invalidate-session`,
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("does not navigate when no redirect URI is provided", () => {
    searchParamsHolder.value = new URLSearchParams({ globalSignout: "true" })

    render(<ClearSessionPage />)

    expect(hrefValue).toBe("")
  })

  it("does not clear the session or navigate to an external origin", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    searchParamsHolder.value = new URLSearchParams({
      redirect: "https://journey.uat.services.gov.ie.evil.com",
    })

    render(<ClearSessionPage />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(hrefValue).toBe("")
  })
})
