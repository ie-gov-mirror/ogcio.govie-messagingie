import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MessageFoldersSidebar } from "@/components/messages/message-folders-sidebar"
import { fakeAnalytics } from "../../../test/utils/analytics"

const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/messages",
  useSearchParams: () => new URLSearchParams("id=msg-1"),
}))

vi.mock("@/components/messages/use-inbox-unread-count", () => ({
  useInboxUnreadCount: () => ({ count: 1, isLoading: false }),
}))

vi.mock("@/components/messages/inbox-unread-badge", () => ({
  InboxUnreadBadge: () => (
    <span data-testid='inbox-unread-badge' aria-hidden>
      1
    </span>
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
    refresh: () => {},
  }),
}))

vi.mock("@/components/messages/use-create-folder", () => ({
  useCreateFolder: () => ({
    createFolder: vi.fn().mockResolvedValue({ ok: true, id: "tag-new" }),
    isLoading: false,
  }),
}))

vi.mock("@/components/messages/use-rename-folder", () => ({
  useRenameFolder: () => ({
    renameFolder: vi.fn().mockResolvedValue({ ok: true }),
    isLoading: false,
  }),
}))

vi.mock("@/components/messages/use-delete-folder", () => ({
  useDeleteFolder: () => ({
    deleteFolder: vi.fn().mockResolvedValue({ ok: true }),
    isLoading: false,
  }),
}))

vi.mock("@/components/messages/folder-toast", () => ({
  showFolderToast: vi.fn(),
}))

vi.mock("@/components/messages/folder-form-modal", () => ({
  FolderFormModal: ({ isOpen, mode }: { isOpen: boolean; mode: string }) =>
    isOpen ? <div data-testid={`folder-form-modal-${mode}`} /> : null,
}))

vi.mock("@/components/messages/delete-folder-modal", () => ({
  DeleteFolderModal: ({
    isOpen,
    folderName,
  }: {
    isOpen: boolean
    folderName: string
  }) =>
    isOpen ? <div data-testid='delete-folder-modal'>{folderName}</div> : null,
}))

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: { folder?: string }) => {
      const labels: Record<string, Record<string, string>> = {
        "home.folders": {
          sidebarAriaLabel: "Message folders",
          deleted: "Deleted",
          createFolder: "Create new folder",
          folderOptions: `Options for ${values?.folder ?? ""}`,
          unreadBadge: "1 unread message",
        },
        "home.move.modal": {
          inbox: "Inbox",
        },
      }
      return labels[namespace]?.[key] ?? key
    },
}))

vi.mock("@ogcio/design-system-react", async () => {
  const React = await import("react")
  const SideNavContext = React.createContext<(value: string) => void>(() => {})

  return {
    Button: ({ children, ...props }: React.PropsWithChildren) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
    Icon: () => null,
    SideNav: ({
      children,
      onChange,
    }: React.PropsWithChildren<{
      value?: string
      onChange?: (value: string) => void
    }>) => (
      <SideNavContext.Provider value={onChange ?? (() => {})}>
        {children}
      </SideNavContext.Provider>
    ),
    SideNavItem: ({
      value,
      label,
      actions,
    }: {
      value: string
      label: React.ReactNode
      actions?: React.ReactNode
    }) => {
      const onChange = React.useContext(SideNavContext)
      return (
        <div>
          <button type='button' onClick={() => onChange(value)}>
            {label}
          </button>
          {actions}
        </div>
      )
    },
  }
})

describe("MessageFoldersSidebar", () => {
  it("renders inbox, folders, deleted and create button", () => {
    render(<MessageFoldersSidebar />)

    expect(
      screen.getByRole("navigation", { name: "Message folders" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Inbox, 1 unread message" }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("inbox-unread-badge")).toHaveTextContent("1")
    expect(screen.getByRole("button", { name: "EHIC" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Payslips" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Deleted" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Create new folder" }),
    ).toBeInTheDocument()
  })

  it("navigates back to inbox and clears the message id", () => {
    render(<MessageFoldersSidebar />)

    fireEvent.click(
      screen.getByRole("button", { name: "Inbox, 1 unread message" }),
    )

    expect(mockPush).toHaveBeenCalledWith("/en/messages", { scroll: false })
  })

  it("opens the create-folder modal from the Create button", () => {
    render(<MessageFoldersSidebar />)

    expect(
      screen.queryByTestId("folder-form-modal-create"),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("create-folder-button"))

    expect(screen.getByTestId("folder-form-modal-create")).toBeInTheDocument()
  })

  it("opens the rename modal from a folder's options menu", () => {
    render(<MessageFoldersSidebar />)

    fireEvent.click(screen.getByTestId("folder-options-tag-ehic"))
    fireEvent.click(screen.getByTestId("folder-rename-tag-ehic"))

    expect(screen.getByTestId("folder-form-modal-rename")).toBeInTheDocument()
  })

  it("opens the delete confirmation from a folder's options menu", () => {
    render(<MessageFoldersSidebar />)

    fireEvent.click(screen.getByTestId("folder-options-tag-payslips"))
    fireEvent.click(screen.getByTestId("folder-delete-tag-payslips"))

    expect(screen.getByTestId("delete-folder-modal")).toHaveTextContent(
      "Payslips",
    )
  })
})

describe("MessageFoldersSidebar analytics", () => {
  const listOpened = (name: string, category: string, action: string) => ({
    event: { name, category, action },
  })

  it("sends nothing on first render", () => {
    const analytics = fakeAnalytics()
    analytics.render(<MessageFoldersSidebar />)

    expect(analytics.event).not.toHaveBeenCalled()
  })

  it("tracks opening the Inbox, a Folder or Deleted, never which Folder", () => {
    const analytics = fakeAnalytics()
    analytics.render(<MessageFoldersSidebar />)

    fireEvent.click(
      screen.getByRole("button", { name: "Inbox, 1 unread message" }),
    )
    fireEvent.click(screen.getByRole("button", { name: "EHIC" }))
    fireEvent.click(screen.getByRole("button", { name: "Deleted" }))

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
