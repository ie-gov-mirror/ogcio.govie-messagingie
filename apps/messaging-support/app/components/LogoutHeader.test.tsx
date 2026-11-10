import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LogoutHeader } from "./LogoutHeader"

const assign = vi.fn()
vi.stubGlobal("location", { ...window.location, assign })

afterEach(() => assign.mockClear())

function openDialog() {
  render(<LogoutHeader />)
  fireEvent.click(screen.getByRole("link", { name: "Log out" }))
  return screen.getByText("Sign out of the Super Admin console?")
}

describe("LogoutHeader", () => {
  it("asks for confirmation instead of signing out straight away", () => {
    expect(openDialog()).toBeInTheDocument()
    expect(screen.getByTestId("modal")).toHaveClass("gi-modal-open")
    expect(screen.getByText(/lock your screen instead/)).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it("cancel closes the dialog without signing out", () => {
    openDialog()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByTestId("modal")).toHaveClass("gi-modal-close")
  })

  it("confirm navigates to the signout route", () => {
    openDialog()
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    expect(assign).toHaveBeenCalledWith("/api/auth/signout")
  })
})
