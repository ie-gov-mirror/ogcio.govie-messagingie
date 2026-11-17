import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { forwardRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AttachmentsForm from "./AttachmentsForm"
import { SendMessageContext, SendMessageSteps } from "./SendMessageContext"

const { onStep, setPendingFiles, toasterCreate } = vi.hoisted(() => ({
  onStep: vi.fn(),
  setPendingFiles: vi.fn(),
  toasterCreate: vi.fn(),
}))
let pendingFileState: File[] = []

vi.mock("@ogcio/sag-client/react", () => ({}))
vi.mock("@ogcio/sag-client", () => ({}))
vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ id: "user-1" }),
  useUserRoles: () => ({ canCreateProfiles: false, canUploadFiles: true }),
}))
vi.mock("@/hooks/use-organization-id", () => ({
  useOrganizationId: () => "org-1",
}))
vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent: vi.fn() }),
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/components/BackButton", () => ({
  BackButton: ({ children, onClick }: React.ComponentProps<"button">) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}))
vi.mock("@/components/icons/delete", () => ({ DeleteIcon: () => null }))
vi.mock("@/components/tables/TanStackTable", () => ({
  TanStackTable: ({
    table,
  }: {
    table: {
      options: {
        data: { id: string; fileName: string; fileSize: number }[]
        columns: {
          id?: string
          accessorFn?: (row: {
            id: string
            fileName: string
            fileSize: number
          }) => React.ReactNode
          cell?: (context: {
            row: {
              original: { id: string; fileName: string; fileSize: number }
            }
          }) => React.ReactNode
        }[]
      }
    }
  }) => (
    <div>
      {table.options.data.map((row) => (
        <div key={row.id}>
          {row.fileName}
          {table.options.columns.map((column) => (
            <span key={column.id}>
              {column.accessorFn?.(row)}
              {column.cell?.({ row: { original: row } })}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}))
vi.mock("@ogcio/design-system-react", () => ({
  Button: ({
    ariaLabel,
    children,
    onClick,
    type = "button",
  }: React.ComponentProps<"button"> & { ariaLabel?: string }) => (
    <button type={type} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Heading: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
  InputFile: forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
    (props, ref) => (
      <input ref={ref} type='file' aria-label='attachment' {...props} />
    ),
  ),
  Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  Stack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  toaster: { create: toasterCreate },
}))

function renderForm(canUploadFiles = true, pendingFiles: File[] = []) {
  pendingFileState = pendingFiles
  render(
    <SendMessageContext.Provider
      value={{
        userId: "user-1",
        canCreateProfiles: false,
        canUploadFiles,
        searchParams: {},
        message: { templateMetaId: "template-1" },
        pendingFiles,
        step: SendMessageSteps.attachments,
        errors: {},
        setMessage: vi.fn(),
        setPendingFiles,
        setSearchParams: vi.fn(),
        onStep,
        setErrors: vi.fn(),
        setStep: vi.fn(),
      }}
    >
      <AttachmentsForm />
    </SendMessageContext.Provider>,
  )
}

describe(AttachmentsForm.name, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendingFileState = []
    setPendingFiles.mockImplementation(
      (update: React.SetStateAction<File[]>) => {
        pendingFileState =
          typeof update === "function" ? update(pendingFileState) : update
      },
    )
  })

  it("blocks uploads when the user lacks permission", async () => {
    renderForm(false)

    await userEvent.upload(
      screen.getByLabelText("attachment"),
      new File(["content"], "letter.pdf", { type: "application/pdf" }),
    )

    expect(toasterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "paragraph.permission",
        variant: "danger",
      }),
    )
    expect(setPendingFiles).not.toHaveBeenCalled()
  })

  it("skips attachments and advances", async () => {
    renderForm()

    await userEvent.click(screen.getByRole("button", { name: "button.skip" }))

    expect(setPendingFiles).toHaveBeenCalledWith([])
    expect(onStep).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
      "next",
    )
  })

  it("adds, formats, removes, and submits attachments", async () => {
    const existingFiles = [
      new File(["a"], "tiny.pdf", { type: "application/pdf" }),
      new File([new Uint8Array(2048)], "medium.pdf", {
        type: "application/pdf",
      }),
      new File([new Uint8Array(2 * 1024 * 1024)], "large.pdf", {
        type: "application/pdf",
      }),
    ]
    renderForm(true, existingFiles)

    expect(screen.getByText("1B")).toBeInTheDocument()
    expect(screen.getByText("2KB")).toBeInTheDocument()
    expect(screen.getByText("2MB")).toBeInTheDocument()

    await userEvent.click(
      screen.getAllByRole("button", {
        name: "button.arialabel.remove",
      })[0],
    )
    expect(setPendingFiles).toHaveBeenCalled()
    expect(screen.queryByText("tiny.pdf")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "button.next" }))
    expect(onStep).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { fileName: "medium.pdf", fileSize: 2048 },
          { fileName: "large.pdf", fileSize: 2 * 1024 * 1024 },
        ],
      }),
      "next",
    )
  })

  it("uploads a valid attachment", async () => {
    renderForm()
    const file = new File(["content"], "letter.pdf", {
      type: "application/pdf",
    })

    await userEvent.upload(screen.getByLabelText("attachment"), file)

    expect(screen.getByText("letter.pdf")).toBeInTheDocument()
    expect(setPendingFiles).toHaveBeenCalled()
  })

  // Browsers expose crypto.randomUUID only on https or localhost, so a
  // plain-http host such as the local stack has none
  it("lists attachments outside a secure context", async () => {
    // Shadows the prototype method; deleting the own property restores it
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    })

    try {
      renderForm(true, [new File(["1"], "kept.pdf")])

      await userEvent.upload(
        screen.getByLabelText("attachment"),
        new File(["2"], "added.pdf", { type: "application/pdf" }),
      )

      expect(screen.getByText("kept.pdf")).toBeInTheDocument()
      expect(screen.getByText("added.pdf")).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(globalThis.crypto, "randomUUID")
    }
  })

  it("rejects attachments over the size limit", async () => {
    renderForm()
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    })

    await userEvent.upload(screen.getByLabelText("attachment"), file)

    expect(toasterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "toast.error.maxSize" }),
    )
    expect(screen.queryByText("large.pdf")).not.toBeInTheDocument()
  })

  it("rejects more than three attachments", async () => {
    renderForm(true, [
      new File(["1"], "one.pdf"),
      new File(["2"], "two.pdf"),
      new File(["3"], "three.pdf"),
    ])

    await userEvent.upload(
      screen.getByLabelText("attachment"),
      new File(["4"], "four.pdf", { type: "application/pdf" }),
    )

    expect(toasterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "toast.error.maxCount" }),
    )
  })

  it("returns to the previous step", async () => {
    renderForm()

    await userEvent.click(screen.getByRole("button", { name: "button.back" }))

    expect(onStep).toHaveBeenCalledWith(
      expect.objectContaining({ templateMetaId: "template-1" }),
      "previous",
    )
  })
})
