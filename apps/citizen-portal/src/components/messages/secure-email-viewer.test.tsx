import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SecureEmailViewer } from "./secure-email-viewer"

describe("SecureEmailViewer", () => {
  it("isolates email HTML in a sandboxed, no-referrer document", () => {
    render(<SecureEmailViewer content='<p>Account update</p>' />)
    const iframe = screen.getByTitle("Secure email content viewer")
    const srcDoc = iframe.getAttribute("srcdoc")

    expect(iframe).toHaveAttribute("sandbox", "")
    expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer")
    expect((iframe as HTMLIFrameElement).style.height).toBe("min(30rem, 50vh)")
    expect(srcDoc).toContain("<p>Account update</p>")
    expect(srcDoc).toContain("default-src 'none'")
    expect(srcDoc).toContain("form-action 'none'")
    expect(srcDoc).not.toContain("<script")
  })
})
