import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SubmissionStatusTag } from "./submission-status-tag"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `status:${key}`,
}))

vi.mock("@ogcio/design-system-react", () => ({
  TagTypeEnum: {
    Info: "info",
    Warning: "warning",
    Success: "success",
    Error: "error",
  },
  Tag: ({ text, type }: { text: string; type: string }) => (
    <span data-type={type}>{text}</span>
  ),
}))

describe("SubmissionStatusTag", () => {
  it.each([
    ["initiated", "info"],
    ["submitted", "info"],
    ["processing", "warning"],
    ["completed", "success"],
    ["cancelled", "error"],
  ] as const)("renders %s with its semantic tag type", (status, type) => {
    render(<SubmissionStatusTag status={status} />)
    expect(screen.getByText(`status:${status}`)).toHaveAttribute(
      "data-type",
      type,
    )
  })
})
