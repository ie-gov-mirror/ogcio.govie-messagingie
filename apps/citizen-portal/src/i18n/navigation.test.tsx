import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LinkWithoutPrefetch } from "./navigation"

vi.mock("next-intl/navigation", () => ({
  createNavigation: () => ({
    Link: ({
      children,
      prefetch,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      prefetch?: boolean
    }) => (
      <a data-prefetch={String(prefetch)} {...props}>
        {children}
      </a>
    ),
  }),
}))

describe("LinkWithoutPrefetch", () => {
  it("renders a link with prefetching disabled", () => {
    render(<LinkWithoutPrefetch href='/messages'>Messages</LinkWithoutPrefetch>)

    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute(
      "data-prefetch",
      "false",
    )
  })
})
