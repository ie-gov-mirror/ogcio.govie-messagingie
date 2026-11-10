import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LeCard } from "@/components/le-card/le-card"

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/my-dashboard",
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "http://messaging.local.test:8080",
      profile: "http://profile.local.test:8080",
      dashboard: "http://dashboard.local.test:8080",
    },
  }),
}))

describe("LeCard", () => {
  it("renders an application card with tag, title, meta and a footer link", () => {
    render(
      <LeCard
        type='application'
        title='Child Benefit'
        titleHref='/en/my-submissions/1'
        meta='Department of Social Protection'
        metaSecondary='Last update 01/02/2026'
        header={{
          tag: { text: "Submitted", type: "info" },
          icon: "article",
        }}
        footer={{
          kind: "link",
          label: "Latest message",
          text: "We have your application",
          href: "/en/messages/1",
          date: "01/02/2026",
        }}
      />,
    )

    expect(screen.getByText("Submitted")).toHaveClass("gi-tag-size-default")
    const title = screen.getByRole("heading", { name: "Child Benefit" })
    expect(title.tagName).toBe("H2")
    expect(
      screen.getByRole("link", { name: "Child Benefit" }).className,
    ).not.toMatch(/stretch/)
    expect(
      screen.getByText("Department of Social Protection"),
    ).toBeInTheDocument()
    expect(screen.getByText("Last update 01/02/2026")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "We have your application" }),
    ).toHaveAttribute("href", "/en/messages/1")
    expect(screen.getAllByRole("link")).toHaveLength(2)
  })

  it("uses the small tag on a compact application card", () => {
    render(
      <LeCard
        type='application'
        size='compact'
        title='Child Benefit'
        titleHref='/en/my-submissions/1'
        meta='Department of Social Protection'
        header={{ tag: { text: "Submitted", type: "info" } }}
      />,
    )

    expect(screen.getByText("Submitted")).toHaveClass("gi-tag-size-small")
  })

  it("renders text and button footers, and omits header and footer when absent", () => {
    const { rerender } = render(
      <LeCard
        type='application'
        title='Child Benefit'
        titleHref='/en/my-submissions/1'
        meta='Department of Social Protection'
        footer={{
          kind: "text",
          label: "Latest message",
          text: "No messages yet",
        }}
      />,
    )

    expect(screen.getByText("No messages yet")).toBeInTheDocument()
    expect(screen.queryByTestId("le-card-icon")).not.toBeInTheDocument()

    rerender(
      <LeCard
        type='application'
        title='Child Benefit'
        titleHref='/en/my-submissions/1'
        meta='Department of Social Protection'
        footer={{
          kind: "button",
          supportingText: "Expires on",
          date: "01/03/2026",
          href: "/en/journeys/1",
          buttonLabel: "Resume",
        }}
      />,
    )

    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "href",
      "/en/journeys/1",
    )
    expect(screen.getByText("Expires on")).toBeInTheDocument()

    rerender(
      <LeCard
        type='application'
        title='Child Benefit'
        titleHref='/en/my-submissions/1'
        meta='Department of Social Protection'
      />,
    )

    expect(screen.queryByText("Latest message")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Resume" }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })

  it("keeps New beside the footer label", () => {
    render(
      <LeCard
        type='application'
        title='Child Benefit'
        titleHref='/en/my-submissions/1'
        meta='Department of Social Protection'
        footer={{
          kind: "link",
          label: "Latest message",
          text: "We have your application",
          href: "/en/messages/1",
          date: "01/02/2026",
          unread: true,
          newLabel: "New",
        }}
      />,
    )

    const badge = screen.getByText("New")
    expect(badge.previousElementSibling).toHaveTextContent("Latest message")
  })

  it("places the life event icon beside or above the title, and stretches that link", () => {
    const { rerender } = render(
      <LeCard
        type='lifeEvent'
        title='Birth of a Child'
        titleHref='/en/discovery/birth'
        category='Family & Children'
        icon='child_care'
      />,
    )

    const title = screen.getByRole("link", { name: "Birth of a Child" })
    const icon = screen.getByTestId("le-card-icon")
    expect(
      title.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(title.className).toMatch(/stretch/)
    expect(screen.getAllByRole("link")).toHaveLength(1)
    expect(screen.getByText("Family & Children")).toBeInTheDocument()

    rerender(
      <LeCard
        type='lifeEvent'
        title='Birth of a Child'
        titleHref='/en/discovery/birth'
        category='Family & Children'
        icon='child_care'
        iconPosition='above'
      />,
    )

    const aboveTitle = screen.getByRole("link", { name: "Birth of a Child" })
    const aboveIcon = screen.getByTestId("le-card-icon")
    expect(
      aboveIcon.compareDocumentPosition(aboveTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(aboveTitle.className).toMatch(/stretch/)
  })
})
