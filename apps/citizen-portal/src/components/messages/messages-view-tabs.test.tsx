import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

let searchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/messages",
}))

vi.mock("@/hooks/use-url-search-params", () => ({
  useUrlSearchParams: () => searchParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

import { fakeAnalytics } from "../../../test/utils/analytics"
import { MessagesViewTabs } from "./messages-view-tabs"

describe("MessagesViewTabs", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams()
  })

  it("renders Inbox and Deleted as links, not ARIA tabs", () => {
    const analytics = fakeAnalytics()
    analytics.render(<MessagesViewTabs />)

    const nav = screen.getByRole("navigation", { name: "heading" })
    expect(nav).toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()

    const inbox = screen.getByRole("link", { name: "inbox" })
    const deleted = screen.getByRole("link", { name: "deleted" })
    expect(inbox).toHaveAttribute("aria-current", "page")
    expect(deleted).not.toHaveAttribute("aria-current")
  })

  it("marks Deleted current when the folder param is deleted", () => {
    searchParams = new URLSearchParams("folder=deleted")
    const analytics = fakeAnalytics()
    analytics.render(<MessagesViewTabs />)

    expect(screen.getByRole("link", { name: "inbox" })).not.toHaveAttribute(
      "aria-current",
    )
    expect(screen.getByRole("link", { name: "deleted" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  it("links to the other view, preserving search and dropping page/id", () => {
    searchParams = new URLSearchParams("search=tax&page=2&id=msg-1")
    const analytics = fakeAnalytics()
    analytics.render(<MessagesViewTabs />)

    expect(screen.getByRole("link", { name: "inbox" })).toHaveAttribute(
      "href",
      "/en/messages?search=tax",
    )
    expect(screen.getByRole("link", { name: "deleted" })).toHaveAttribute(
      "href",
      "/en/messages?search=tax&folder=deleted",
    )
  })

  it("tracks opening the Deleted view", () => {
    const analytics = fakeAnalytics()
    analytics.render(<MessagesViewTabs />)

    screen.getByRole("link", { name: "deleted" }).click()

    expect(analytics.event).toHaveBeenCalledWith({
      event: {
        name: "deleted-messages-open",
        category: "Message",
        action: "Deleted Messages Opened",
      },
    })
  })
})
