import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count: number }) =>
    values ? `${key}:${values.count}` : key,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Button: ({
    children,
    ariaBusy,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ariaBusy?: boolean
  }) => (
    <button type='button' aria-busy={ariaBusy} {...props}>
      {children}
    </button>
  ),
  ModalBody: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ModalFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ModalTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  ModalWrapper: ({
    children,
    isOpen,
    dataTestId,
  }: React.PropsWithChildren<{ isOpen: boolean; dataTestId: string }>) =>
    isOpen ? <div data-testid={dataTestId}>{children}</div> : null,
  Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
}))

import { DeleteConfirmationModal } from "./delete-confirmation-modal"

describe("DeleteConfirmationModal", () => {
  it("pluralises with the count and invokes both actions", () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(
      <DeleteConfirmationModal
        isOpen
        count={3}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByRole("heading")).toHaveTextContent("title:3")
    expect(screen.getByText("body:3")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("delete-confirmation-cancel"))
    fireEvent.click(screen.getByTestId("delete-confirmation-confirm"))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it("disables actions and marks confirmation busy while deleting", () => {
    render(
      <DeleteConfirmationModal
        isOpen
        count={1}
        isDeleting
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByTestId("delete-confirmation-cancel")).toBeDisabled()
    expect(screen.getByTestId("delete-confirmation-confirm")).toBeDisabled()
    expect(screen.getByTestId("delete-confirmation-confirm")).toHaveAttribute(
      "aria-busy",
      "true",
    )
  })
})
