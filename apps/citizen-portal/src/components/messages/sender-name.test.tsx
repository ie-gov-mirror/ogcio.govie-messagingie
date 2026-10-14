import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SenderName } from "@/components/messages/sender-name"

/**
 * Captures every URL `<SenderName>` hands to `useGatewayFetch` so each
 * test can assert *both* the rendered label and whether the profile-API
 * lookup was scheduled — the AB#37866 short-circuit must skip the call
 * entirely for known system slugs (the slug isn't a UUID, so the call
 * always 403s and contributes pure observability noise).
 */
const fetchedPaths: Array<string | null> = []

const ORG_FIXTURES: Record<
  string,
  {
    id: string
    translations: {
      en: { name: string; shortName: string }
      ga: { name: string; shortName: string }
    }
  }
> = {
  "org-dsp": {
    id: "org-dsp",
    translations: {
      en: { name: "Department of Social Protection", shortName: "DSP" },
      ga: { name: "An Roinn Coimirce Sóisialaí", shortName: "RCS" },
    },
  },
}

/** Holds the org lookup in flight so the loading branch can be asserted. */
let lookupPending = false

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (path: string | null) => {
    fetchedPaths.push(path)
    if (!path) {
      return {
        data: undefined,
        metadata: undefined,
        error: null,
        isLoading: false,
        refresh: vi.fn(),
      }
    }
    const orgMatch = path.match(/^\/profile\/api\/v1\/organisations\/(.+)$/)
    const data =
      orgMatch && !lookupPending ? ORG_FIXTURES[orgMatch[1]] : undefined
    return {
      data,
      metadata: undefined,
      error: null,
      isLoading: lookupPending,
      refresh: vi.fn(),
    }
  },
}))

let currentLocale: "en" | "ga" = "en"

vi.mock("next-intl", () => ({
  useLocale: () => currentLocale,
  useTranslations:
    (namespace: string) =>
    (key: string): string => {
      const tableEn: Record<string, string> = {
        unknownSender: "Unknown sender",
        "systemSender.support": "MessagingIE",
      }
      const tableGa: Record<string, string> = {
        unknownSender: "Seoltóir anaithnid",
        "systemSender.support": "MessagingIE",
      }
      const dict = currentLocale === "ga" ? tableGa : tableEn
      if (namespace === "home.table") {
        return dict[key] ?? `${namespace}.${key}`
      }
      return `${namespace}.${key}`
    },
}))

describe("<SenderName>", () => {
  beforeEach(() => {
    fetchedPaths.length = 0
    currentLocale = "en"
    lookupPending = false
  })

  it("short-circuits the profile lookup for the support system slug and renders the localized brand label", () => {
    render(<SenderName organisationId='support' />)

    expect(screen.getByText("MessagingIE")).toBeInTheDocument()
    /*
     * The whole point of the short-circuit is that the profile API is
     * never asked about a non-UUID slug. `useGatewayFetch(null)` is the
     * documented opt-out, so the only path passed in must be `null`.
     */
    expect(fetchedPaths).toEqual([null])
  })

  it("renders the Irish system label when the locale is `ga`", () => {
    currentLocale = "ga"
    /*
     * The label is currently the same brand string in both locales, but
     * the lookup MUST go through `home.table.systemSender.support` in
     * the `ga.json` namespace (not the English one) so a future
     * translator change picks up automatically.
     */
    render(<SenderName organisationId='support' />)
    expect(screen.getByText("MessagingIE")).toBeInTheDocument()
    expect(fetchedPaths).toEqual([null])
  })

  it("falls through to the profile-API lookup for real organisation UUIDs", () => {
    render(<SenderName organisationId='org-dsp' />)

    expect(
      screen.getByText("Department of Social Protection"),
    ).toBeInTheDocument()
    expect(fetchedPaths).toEqual(["/profile/api/v1/organisations/org-dsp"])
  })

  it("renders the localized 'Unknown sender' fallback when the org lookup misses", () => {
    render(<SenderName organisationId='org-not-seeded' />)

    expect(screen.getByText("Unknown sender")).toBeInTheDocument()
    expect(fetchedPaths).toEqual([
      "/profile/api/v1/organisations/org-not-seeded",
    ])
  })

  it("shows a skeleton, not the fallback, while the org lookup is in flight", () => {
    lookupPending = true
    render(<SenderName organisationId='org-dsp' />)

    expect(screen.getByTestId("sender-name-skeleton")).toBeInTheDocument()
    expect(screen.queryByText("Unknown sender")).not.toBeInTheDocument()
  })

  it("does not call the profile API when no organisationId is supplied", () => {
    render(<SenderName organisationId={null} />)

    expect(screen.getByText("Unknown sender")).toBeInTheDocument()
    expect(fetchedPaths).toEqual([null])
  })
})
