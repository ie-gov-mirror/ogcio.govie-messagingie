import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const trackEvent = vi.hoisted(() => vi.fn())

vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent }),
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (_namespace: string) => {
    const t = (key: string) => {
      const byKey: Record<string, string> = {
        title: "Consent",
        description: "Manage your consent",
        "currentStatus.unset": "not set",
        "currentStatus.enabled": "enabled",
        "currentStatus.disabled": "disabled",
        "actions.update.title": "Update your consent",
        "actions.update.action": "Update consent",
      }
      return byKey[key] ?? key
    }
    t.rich = (
      key: string,
      values?: {
        status?: string
        count?: number
        bold?: (ch: string) => unknown
      },
    ) => {
      values?.bold?.("important")
      return key === "currentStatus.description"
        ? `Status: ${values?.status}`
        : `Linked accounts: ${values?.count}`
    }
    return t
  },
}))

import { ConsentSection } from "@/components/consent/consent-section"

describe("ConsentSection", () => {
  const messagingUrl = "https://messaging.example.test"

  beforeEach(() => {
    trackEvent.mockClear()
  })

  it("keeps the update link's href pointing at the force-consent flow", () => {
    render(<ConsentSection messagingUrl={messagingUrl} />)

    const link = screen.getByRole("link", { name: "Update consent" })
    const heading = screen.getByRole("heading", { name: "Consent" })
    expect(heading).toHaveClass("gi-text-lg", "xl:gi-text-xl")
    expect(heading.className).not.toContain("xl:gi-text-2xl")
    expect(link).toHaveAttribute(
      "href",
      `${messagingUrl}/en/messages?force-consent=1`,
    )
  })

  it("fires profile-consent-change when the update link is clicked", () => {
    render(<ConsentSection messagingUrl={messagingUrl} />)

    fireEvent.click(screen.getByRole("link", { name: "Update consent" }))

    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "profile-consent-change",
        category: "Profile",
        action: "Consent Change Initiated",
      },
    })
  })

  it.each(["opted-in", "pre-approved"])(
    "shows enabled for %s consent",
    (status) => {
      render(
        <ConsentSection
          messagingUrl={messagingUrl}
          consentStatuses={{ messaging: { status } }}
        />,
      )

      expect(screen.getByText("Status: enabled")).toBeInTheDocument()
    },
  )

  it.each(["opted-out", "pending", "undefined"])(
    "shows disabled for %s consent",
    (status) => {
      render(
        <ConsentSection
          messagingUrl={messagingUrl}
          consentStatuses={{ messaging: { status } }}
        />,
      )

      expect(screen.getByText("Status: disabled")).toBeInTheDocument()
    },
  )

  it("keeps the unset label for an unknown status", () => {
    render(
      <ConsentSection
        messagingUrl={messagingUrl}
        consentStatuses={{ messaging: { status: "unexpected" } }}
      />,
    )

    expect(screen.getByText("Status: not set")).toBeInTheDocument()
  })

  it("shows the number of linked profiles", () => {
    render(
      <ConsentSection messagingUrl={messagingUrl} linkedProfilesCount={2} />,
    )

    expect(screen.getByText("Linked accounts: 2")).toBeInTheDocument()
  })
})
