import { render, screen } from "@testing-library/react"
import { redirect } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import Page from "./page"

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

describe("signed-out page", () => {
  it("does not redirect to sign-in and only offers it as a link", () => {
    render(<Page />)

    expect(
      screen.getByRole("heading", { name: "Signed out" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("You are signed out of Messaging Support."),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/api/auth/signin",
    )
    expect(redirect).not.toHaveBeenCalled()
  })
})
