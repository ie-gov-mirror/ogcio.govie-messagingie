import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DashboardPanel } from "./dashboard-panel"

describe("DashboardPanel", () => {
  it("groups its heading, content, and optional action in a section", () => {
    render(
      <DashboardPanel
        title='Recent applications'
        cta={<a href='/applications'>View all</a>}
      >
        <p>Application one</p>
      </DashboardPanel>,
    )
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Recent applications",
    })
    const section = heading.closest("section")
    expect(section).not.toBeNull()
    expect(section).toContainElement(screen.getByText("Application one"))
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/applications",
    )
  })
})
