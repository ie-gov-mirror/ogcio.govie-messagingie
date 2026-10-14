import { readFileSync } from "node:fs"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ListCard } from "@/components/list-card/list-card"

describe("ListCard", () => {
  it("renders title, date, and preview", () => {
    render(
      <ListCard
        title='Department of Education'
        date={<time dateTime='2026-07-02'>2 Jul 2026</time>}
        preview='Please find attached your payslip for the month of August.'
      />,
    )

    expect(screen.getByText("Department of Education")).toBeInTheDocument()
    expect(screen.getByText("2 Jul 2026")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Please find attached your payslip for the month of August.",
      ),
    ).toBeInTheDocument()
  })

  it("shows the checkbox indicator in selection mode", () => {
    render(
      <ListCard
        title='Sender'
        date='2 Jul 2026'
        preview='Preview'
        showCheckbox
        isChecked
        checkboxTestId='list-card-checkbox'
      />,
    )

    const button = screen.getByRole("button")
    expect(button).toHaveAttribute("aria-pressed", "true")
    const indicator = screen.getByTestId("list-card-checkbox")
    expect(indicator).toBeInTheDocument()
    // Must match the 24px DS select-all checkbox in the list header.
    expect(indicator.querySelector("svg")).toHaveAttribute("width", "24")
  })

  it("hides the attachment icon when hasAttachment is false", () => {
    render(<ListCard title='Sender' date='2 Jul 2026' preview='Preview' />)

    expect(screen.queryByLabelText("Has attachment")).not.toBeInTheDocument()
  })

  it("shows the attachment icon when hasAttachment is true", () => {
    render(
      <ListCard
        title='Sender'
        date='2 Jul 2026'
        preview='Preview'
        hasAttachment
        attachmentAriaLabel='1 attachment'
      />,
    )

    expect(screen.getByLabelText("1 attachment")).toBeInTheDocument()
  })

  it("calls onClick when activated", () => {
    const onClick = vi.fn()
    render(
      <ListCard
        title='Sender'
        date='2 Jul 2026'
        preview='Preview'
        onClick={onClick}
      />,
    )

    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // The card height is fixed, so raising a font size, a line-height or the
  // preview line-clamp clips text with no other symptom. jsdom does no
  // layout, so re-derive the budget from the stylesheet instead.
  it("keeps the text stack inside the fixed card height", () => {
    const css = readFileSync(
      "src/components/list-card/list-card.module.css",
      "utf8",
    )
    // Reads the px fallback out of `var(--token, 0.75rem)`, or a bare number.
    const value = (selector: string, property: string) => {
      const block = css.match(new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`))?.[0]
      const raw =
        block?.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1] ?? ""
      const rem = raw.match(/([\d.]+)rem/)
      return rem ? Number(rem[1]) * 16 : Number(raw)
    }

    const contentBox = value("card", "height") - 2 * value("card", "padding")
    const textStack =
      value("title", "font-size") * value("title", "line-height") +
      value("content", "gap") +
      value("preview", "-webkit-line-clamp") *
        value("preview", "font-size") *
        value("preview", "line-height")

    expect(contentBox).toBe(72)
    expect(textStack).toBeLessThanOrEqual(contentBox)
  })
})
