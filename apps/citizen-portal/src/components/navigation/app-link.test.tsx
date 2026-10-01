import { fireEvent, render, screen } from "@testing-library/react"
import type { MouseEvent, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/discovery",
  useRouter: () => ({ push }),
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

vi.mock("@ogcio/design-system-react", () => ({
  Link: ({
    href,
    onClick,
    children,
  }: {
    href: string
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
    children: ReactNode
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))

import { AppLink } from "./app-link"

describe("AppLink", () => {
  beforeEach(() => {
    push.mockClear()
  })

  it("client-navigates a path on the current host", () => {
    render(
      <AppLink href='http://dashboard.local.test:8080/en/discovery/child'>
        School
      </AppLink>,
    )
    fireEvent.click(screen.getByRole("link", { name: "School" }))
    expect(push).toHaveBeenCalledWith("/en/discovery/child")
  })

  it("leaves a different host as a document load", () => {
    render(
      <AppLink href='http://messaging.local.test:8080/en/messages'>
        Messages
      </AppLink>,
    )
    const link = screen.getByRole("link", { name: "Messages" })
    link.addEventListener("click", (event) => event.preventDefault())
    fireEvent.click(link)
    expect(push).not.toHaveBeenCalled()
  })
})
