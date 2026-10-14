import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { InboxLayout } from "./inbox-layout"

describe("InboxLayout", () => {
  it("renders the sidebar and main content in their landmarks", () => {
    render(
      <InboxLayout sidebar={<nav>Folders</nav>}>
        <h1>Messages</h1>
      </InboxLayout>,
    )

    expect(screen.getByRole("complementary")).toHaveTextContent("Folders")
    expect(
      screen.getByRole("heading", { name: "Messages" }),
    ).toBeInTheDocument()
  })

  it("omits the sidebar landmark when no sidebar is provided", () => {
    render(
      <InboxLayout>
        <h1>Messages</h1>
      </InboxLayout>,
    )

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Messages" }),
    ).toBeInTheDocument()
  })
})
