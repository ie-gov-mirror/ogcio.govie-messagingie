import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPush = vi.fn()
const createFolder = vi.fn()
const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/messages",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const folders: Record<string, string> = {
      deleted: "Deleted",
      createFolder: "Create new folder",
      placeholder: "Folder name",
      save: "Save",
      cancel: "Cancel",
      "panel.title": "Folders",
      "panel.close": "Close",
      "toast.created": "Folder successfully added",
      "error.duplicate": "A folder with this name already exists",
      "error.generic": "Something went wrong. Please try again.",
    }
    if (namespace === "home.move.modal" && key === "inbox") return "Inbox"
    return folders[key] ?? key
  },
}))

vi.mock("@ogcio/design-system-react", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  } & Record<string, unknown>) => (
    <button type='button' onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
  Icon: () => null,
  InputText: ({
    value,
    onChange,
    ...rest
  }: {
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  } & Record<string, unknown>) => (
    <input value={value} onChange={onChange} {...rest} />
  ),
}))

vi.mock("@/components/messages/use-folders", () => ({
  useFolders: () => ({
    folders: [
      { id: "tag-ehic", label: "EHIC" },
      { id: "tag-payslips", label: "Payslips" },
    ],
    isLoading: false,
    error: null,
    refresh,
  }),
}))

vi.mock("@/components/messages/use-create-folder", () => ({
  useCreateFolder: () => ({ createFolder, isLoading: false }),
}))

vi.mock("@/components/messages/inbox-unread-badge", () => ({
  InboxUnreadBadge: () => null,
}))

vi.mock("@/components/messages/message-folders-sidebar", () => ({
  INBOX_FOLDER_ID: "inbox",
  DELETED_FOLDER_ID: "deleted",
}))

vi.mock("@/components/messages/folder-form-modal", () => ({
  FOLDER_NAME_MAX_LENGTH: 100,
}))

import { MobileFolderPanel } from "@/components/messages/mobile-folder-panel"
import { fakeAnalytics } from "../../../test/utils/analytics"

describe("MobileFolderPanel", () => {
  beforeEach(() => {
    mockPush.mockReset()
    createFolder.mockReset()
    refresh.mockReset()
  })

  it("renders inbox, folders, deleted and the create button", () => {
    render(<MobileFolderPanel isOpen onClose={vi.fn()} />)

    expect(screen.getByText("Inbox")).toBeInTheDocument()
    expect(screen.getByTestId("mobile-folder-tag-ehic")).toBeInTheDocument()
    expect(screen.getByTestId("mobile-folder-tag-payslips")).toBeInTheDocument()
    expect(screen.getByText("Deleted")).toBeInTheDocument()
    expect(
      screen.getByTestId("mobile-create-folder-button"),
    ).toBeInTheDocument()
  })

  it("navigates to a folder and closes the panel", () => {
    const onClose = vi.fn()
    render(<MobileFolderPanel isOpen onClose={onClose} />)

    fireEvent.click(screen.getByTestId("mobile-folder-tag-ehic"))

    expect(mockPush).toHaveBeenCalledWith("/en/messages?folder=tag-ehic", {
      scroll: false,
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("renders nothing when closed", () => {
    const { container } = render(
      <MobileFolderPanel isOpen={false} onClose={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("opens the inline create form with Save disabled until typed", () => {
    render(<MobileFolderPanel isOpen onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId("mobile-create-folder-button"))

    const save = screen.getByTestId("mobile-folder-save") as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.change(screen.getByTestId("mobile-folder-name-input"), {
      target: { value: "Bills" },
    })
    expect(save.disabled).toBe(false)
  })

  it("creates a folder, shows an in-panel toast and collapses the form", async () => {
    createFolder.mockResolvedValue({ ok: true, id: "tag-bills" })
    render(<MobileFolderPanel isOpen onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId("mobile-create-folder-button"))
    fireEvent.change(screen.getByTestId("mobile-folder-name-input"), {
      target: { value: "Bills" },
    })
    fireEvent.click(screen.getByTestId("mobile-folder-save"))

    await waitFor(() => expect(createFolder).toHaveBeenCalledWith("Bills"))
    expect(await screen.findByTestId("mobile-folder-toast")).toHaveTextContent(
      "Folder successfully added",
    )
    expect(refresh).toHaveBeenCalled()
    expect(
      screen.queryByTestId("mobile-folder-name-input"),
    ).not.toBeInTheDocument()
  })

  it("shows an inline duplicate error on conflict", async () => {
    createFolder.mockResolvedValue({ ok: false, conflict: true })
    render(<MobileFolderPanel isOpen onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId("mobile-create-folder-button"))
    fireEvent.change(screen.getByTestId("mobile-folder-name-input"), {
      target: { value: "EHIC" },
    })
    fireEvent.click(screen.getByTestId("mobile-folder-save"))

    expect(await screen.findByTestId("mobile-folder-error")).toHaveTextContent(
      "A folder with this name already exists",
    )
  })
})

describe("MobileFolderPanel analytics", () => {
  const listOpened = (name: string, category: string, action: string) => ({
    event: { name, category, action },
  })

  it("sends nothing on first render", () => {
    const analytics = fakeAnalytics()
    analytics.render(<MobileFolderPanel isOpen onClose={vi.fn()} />)

    expect(analytics.event).not.toHaveBeenCalled()
  })

  it("tracks opening the Inbox, a Folder or Deleted, never which Folder", () => {
    const analytics = fakeAnalytics()
    analytics.render(<MobileFolderPanel isOpen onClose={vi.fn()} />)

    fireEvent.click(screen.getByText("Inbox"))
    fireEvent.click(screen.getByTestId("mobile-folder-tag-ehic"))
    fireEvent.click(screen.getByText("Deleted"))

    expect(analytics.event.mock.calls).toEqual([
      [listOpened("inbox-open", "Message", "Inbox Opened")],
      [listOpened("folder-open", "Folder", "Folder Opened")],
      [
        listOpened(
          "deleted-messages-open",
          "Message",
          "Deleted Messages Opened",
        ),
      ],
    ])
  })
})
