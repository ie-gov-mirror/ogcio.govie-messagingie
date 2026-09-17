import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@citizen-portal/shared", () => ({
  getEnv: () => ({
    hosts: {
      messages: "https://messages.uat.test",
      profile: "https://profile.uat.test",
      dashboard: "https://dashboard.uat.test",
    },
  }),
}))

const envHolder = vi.hoisted(() => ({
  value: {
    NEXT_PUBLIC_BASE_URL: "https://citizen.uat.test",
    NEXT_PUBLIC_JOURNEY_URL: "https://journey.uat.services.gov.ie",
    NEXT_PUBLIC_MYGOVID_END_SESSION_URL: undefined as string | undefined,
  },
}))

vi.mock("@/env/env.client", () => ({
  get env() {
    return envHolder.value
  },
}))

vi.mock("@ogcio/design-system-react", () => ({
  Spinner: () => <div />,
}))

const MYGOVID_END_SESSION_URL =
  "https://nonprod-account.mygovid-nonprod.ie/policy/oauth2/v2.0/logout"
const DESTINATION = "https://journey.uat.services.gov.ie/journey/abc-123"

import { PostGlobalSignout } from "./post-global-signout"

let replaced = ""

beforeEach(() => {
  replaced = ""
  envHolder.value.NEXT_PUBLIC_MYGOVID_END_SESSION_URL = undefined
  for (const name of ["postGlobalSignoutUrl", "postGlobalSignoutMyGovId"]) {
    // biome-ignore lint/suspicious/noDocumentCookie: reset between tests
    document.cookie = `${name}=; Max-Age=0; path=/`
  }
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      replace: (value: string) => {
        replaced = value
      },
      hostname: "citizen.uat.test",
    },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("PostGlobalSignout (AB#39676)", () => {
  // The convergence point: a flagged citizen must be sent through a TOP-LEVEL
  // MyGovID (Azure B2C) end-session before being forwarded to the destination.
  it("ends the MyGovID session when the flag cookie is set", () => {
    envHolder.value.NEXT_PUBLIC_MYGOVID_END_SESSION_URL =
      MYGOVID_END_SESSION_URL
    // biome-ignore lint/suspicious/noDocumentCookie: test setup
    document.cookie = `postGlobalSignoutMyGovId=1; path=/`
    // biome-ignore lint/suspicious/noDocumentCookie: test setup
    document.cookie = `postGlobalSignoutUrl=${encodeURIComponent(DESTINATION)}; path=/`

    render(<PostGlobalSignout />)

    const target = new URL(replaced)
    expect(target.origin + target.pathname).toBe(
      "https://nonprod-account.mygovid-nonprod.ie/policy/oauth2/v2.0/logout",
    )
    expect(target.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://citizen.uat.test/post-global-signout",
    )
    expect(document.cookie).not.toContain("postGlobalSignoutMyGovId=1")
    expect(document.cookie).toContain("postGlobalSignoutUrl=")
  })

  it("forwards to the destination when no MyGovID step is pending", () => {
    envHolder.value.NEXT_PUBLIC_MYGOVID_END_SESSION_URL =
      MYGOVID_END_SESSION_URL
    // biome-ignore lint/suspicious/noDocumentCookie: test setup
    document.cookie = `postGlobalSignoutUrl=${encodeURIComponent(DESTINATION)}; path=/`

    render(<PostGlobalSignout />)

    expect(replaced).toBe(DESTINATION)
  })

  it("falls back to the base URL when nothing is stashed", () => {
    render(<PostGlobalSignout />)

    expect(replaced).toBe("https://citizen.uat.test")
  })
})
