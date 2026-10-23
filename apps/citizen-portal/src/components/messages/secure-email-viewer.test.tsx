import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SecureEmailViewer } from "./secure-email-viewer"

describe("SecureEmailViewer", () => {
  it("renders message HTML in the page", () => {
    render(<SecureEmailViewer content='<p>Account update</p>' />)

    expect(screen.getByText("Account update").tagName).toBe("P")
    expect(document.querySelector("iframe")).toBeNull()
  })

  it("strips script markup before rendering", () => {
    const { container } = render(
      <SecureEmailViewer content='<p>Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>' />,
    )

    expect(screen.getByText("Hi").tagName).toBe("P")
    expect(container.innerHTML).not.toContain("<script")
    expect(container.innerHTML).not.toContain("onerror")
  })

  it("leaves message links to navigate in the page", () => {
    render(
      <SecureEmailViewer content='<a href="https://forms.example/download">Download</a>' />,
    )
    const link = screen.getByRole("link", { name: "Download" })

    expect(link).toHaveAttribute("href", "https://forms.example/download")
    expect(link).not.toHaveAttribute("target")
  })
})
