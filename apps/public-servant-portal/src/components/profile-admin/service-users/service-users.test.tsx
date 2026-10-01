import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  gatewayFetchMock,
  signInMock,
  pushMock,
  replaceMock,
  searchParams,
  toasterCreate,
  trackEventMock,
} = vi.hoisted(() => ({
  gatewayFetchMock: vi.fn(),
  signInMock: vi.fn(),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParams: new URLSearchParams(),
  toasterCreate: vi.fn(),
  trackEventMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/service-users",
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => searchParams,
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))

vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent: trackEventMock }),
}))

vi.mock("@ogcio/sag-client", () => ({ signIn: signInMock }))
vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (path: string | null) => gatewayFetchMock(path),
}))
vi.mock("@/hooks/profile-admin/use-organization-id", () => ({
  useOrganizationId: () => "org-1",
}))
vi.mock("@/env/env.client", () => ({
  env: { NEXT_PUBLIC_SAG_URL: "https://sag.example" },
}))

vi.mock("@tanstack/react-table", () => ({
  getCoreRowModel: () => vi.fn(),
  useReactTable: (options: unknown) => options,
}))

vi.mock("@/components/tables/TanStackTable", () => ({
  TanStackTable: ({
    "aria-label": ariaLabel,
    table,
  }: {
    "aria-label": string
    table: {
      data: Array<Record<string, unknown>>
      columns: Array<{
        id?: string
        accessorKey?: string
        accessorFn?: (row: Record<string, unknown>) => React.ReactNode
        cell?: (context: {
          row: { original: Record<string, unknown> }
        }) => React.ReactNode
      }>
    }
  }) => (
    <div data-testid='table'>
      {ariaLabel}
      {table.data.map((row, rowIndex) =>
        table.columns.map((column) => (
          <span key={`${rowIndex}-${column.id}`}>
            {column.cell?.({ row: { original: row } })}
            {column.accessorFn?.(row)}
            {column.accessorKey ? String(row[column.accessorKey] ?? "") : null}
          </span>
        )),
      )}
    </div>
  ),
}))

vi.mock("@/components/css-spinner", () => ({
  CssSpinner: () => <span data-testid='css-spinner' />,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
  FormField: ({
    children,
    error,
  }: {
    children?: React.ReactNode
    error?: { text: string }
  }) => (
    <div>
      {children}
      {error?.text}
    </div>
  ),
  Heading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Icon: () => <span />,
  InputText: ({
    clearButtonEnabled: _clearButtonEnabled,
    iconEnd: _iconEnd,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & {
    clearButtonEnabled?: boolean
    iconEnd?: React.ReactNode
  }) => <input {...props} />,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  Pagination: ({
    currentPage,
    onPageChange,
  }: {
    currentPage: number
    onPageChange: (page: number) => void
  }) => (
    <button type='button' onClick={() => onPageChange(currentPage + 1)}>
      page {currentPage}
    </button>
  ),
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Spinner: () => <span data-testid='spinner' />,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SummaryList: ({ children }: { children: React.ReactNode }) => (
    <dl>{children}</dl>
  ),
  SummaryListRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SummaryListValue: ({ children }: { children: React.ReactNode }) => (
    <dd>{children}</dd>
  ),
  TabItem: ({
    children,
    onTabClick,
  }: {
    children: React.ReactNode
    onTabClick?: () => void
  }) => (
    <button type='button' onClick={onTabClick}>
      {children}
    </button>
  ),
  TabList: ({ children }: { children: React.ReactNode }) => (
    <div role='tablist'>{children}</div>
  ),
  TabPanel: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  Tabs: ({ children, id }: { children: React.ReactNode; id: string }) => (
    <div id={id}>{children}</div>
  ),
  Tag: ({ type, text }: { type: string; text: string }) => (
    <span data-testid={`tag-${type}`}>{text}</span>
  ),
  toaster: { create: toasterCreate },
}))

import { EditServiceUser } from "./edit-service-user"
import { PaginationWrapper } from "./pagination-wrapper"
import { SearchForm } from "./search-form"
import { ServiceUser } from "./service-user"
import { ServiceUsers } from "./service-users"
import { ServiceUsersImportCSV } from "./service-users-import-csv"
import { ServiceUsersImportDetailsTable } from "./service-users-import-details-table"
import { ServiceUsersImportsTable } from "./service-users-imports-table"
import { ServiceUsersTable } from "./service-users-table"
import { StatusTag } from "./status-tag"

const profile = {
  id: "user-1",
  email: "alice@example.com",
  publicName: "Alice",
  preferredLanguage: "en",
  details: { firstName: "Alice", lastName: "Doe", ppsn: "1234567A" },
}

function getInput(name: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  )
  if (!input) throw new Error(`Missing input: ${name}`)
  return input
}

describe("profile-admin service-user components", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn())
    window.history.replaceState({}, "", "/")
    for (const key of [...searchParams.keys()]) searchParams.delete(key)
    gatewayFetchMock.mockImplementation((path: string | null) => {
      if (path === "/profile/api/v1/profiles/user-1") {
        return { data: profile, error: undefined, isLoading: false }
      }
      return {
        data: path?.includes("/imports/import-1")
          ? {
              id: "import-1",
              createdAt: "2024-01-01T12:00:00Z",
              status: "completed",
              metadata: { filename: "users.csv" },
              details: [],
            }
          : [],
        metadata: { totalCount: 0 },
        error: undefined,
        isLoading: false,
      }
    })
  })

  it("maps statuses to tag variants and hides missing statuses", () => {
    const { rerender } = render(<StatusTag status='completed' />)
    expect(screen.getByTestId("tag-success")).toHaveTextContent("completed")
    rerender(<StatusTag status='unknown' />)
    expect(screen.getByTestId("tag-info")).toBeInTheDocument()
    rerender(<StatusTag status={null} />)
    expect(screen.queryByTestId(/tag-/)).not.toBeInTheDocument()
  })

  it("renders the users tabs and tracks import-log views", () => {
    window.history.replaceState({}, "", "/?profiles=foo")
    render(<ServiceUsers />)
    fireEvent.click(screen.getByRole("button", { name: "tabs.imports" }))

    expect(screen.getByText("tabs.users")).toBeInTheDocument()
    expect(trackEventMock).toHaveBeenCalledOnce()
  })

  it.each(["tabs.users", "tabs.imports", "tabs.importCsv"])(
    "does not navigate when the %s tab is clicked with a query",
    (tabName) => {
      window.history.replaceState({}, "", "/?imports=abc")
      render(<ServiceUsers />)

      fireEvent.click(screen.getByRole("button", { name: tabName }))

      expect(pushMock).not.toHaveBeenCalled()
      expect(replaceMock).not.toHaveBeenCalled()
    },
  )

  it("ignores import query keys in the users panel", () => {
    searchParams.set("imports", "users.csv")
    searchParams.set("importsPage", "4")
    searchParams.set("importsSize", "5")
    searchParams.set("page", "4")
    searchParams.set("size", "5")

    render(<ServiceUsersTable />)

    expect(gatewayFetchMock).toHaveBeenCalledWith(
      "/profile/api/v1/profiles/?offset=0&limit=20",
    )
  })

  it("ignores user query keys in the imports panel", () => {
    searchParams.set("profiles", "alice")
    searchParams.set("profilesPage", "4")
    searchParams.set("profilesSize", "5")
    searchParams.set("page", "4")
    searchParams.set("size", "5")

    render(<ServiceUsersImportsTable />)

    expect(gatewayFetchMock).toHaveBeenCalledWith(
      "/profile/api/v1/profiles/imports/?offset=0&limit=20",
    )
  })

  it("fetches and renders both list tables", () => {
    const { rerender } = render(<ServiceUsersTable />)
    expect(gatewayFetchMock).toHaveBeenCalledWith(
      "/profile/api/v1/profiles/?offset=0&limit=20",
    )
    expect(screen.getByTestId("table")).toHaveTextContent("table.columns.email")

    rerender(<ServiceUsersImportsTable />)
    expect(gatewayFetchMock).toHaveBeenCalledWith(
      "/profile/api/v1/profiles/imports/?offset=0&limit=20",
    )
    expect(screen.getByTestId("table")).toHaveTextContent(
      "table.columns.fileName",
    )
  })

  it("renders populated profile and import table cells", () => {
    gatewayFetchMock.mockImplementation((path: string) => ({
      data: path.includes("/imports/")
        ? [
            {
              id: "import-1",
              createdAt: "2024-01-01T12:00:00Z",
              status: "completed",
              metadata: { filename: "users.csv" },
            },
          ]
        : [
            profile,
            {
              id: "user-2",
              email: "no-details@example.com",
              publicName: "",
              details: undefined,
              updatedAt: undefined,
            },
          ],
      metadata: { totalCount: 50 },
      error: undefined,
      isLoading: false,
    }))
    const { rerender } = render(<ServiceUsersTable />)

    expect(screen.getByText("Alice Doe")).toBeInTheDocument()
    expect(screen.getAllByText("-").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("link")).toHaveLength(4)

    rerender(<ServiceUsersImportsTable />)
    expect(screen.getByText("users.csv")).toBeInTheDocument()
    expect(screen.getByTestId("tag-success")).toBeInTheDocument()
  })

  it("applies list searches and handles missing response data", () => {
    searchParams.set("profiles", "Ada")
    gatewayFetchMock.mockReturnValue({
      data: undefined,
      metadata: undefined,
      error: "failed",
      isLoading: false,
    })
    const { rerender } = render(<ServiceUsersTable />)
    expect(gatewayFetchMock).toHaveBeenCalledWith(
      "/profile/api/v1/profiles/?offset=0&limit=20&search=Ada",
    )

    searchParams.delete("profiles")
    searchParams.set("imports", "users.csv")
    rerender(<ServiceUsersImportsTable />)
    expect(gatewayFetchMock).toHaveBeenCalledWith(
      "/profile/api/v1/profiles/imports/?offset=0&limit=20&search=users.csv",
    )
  })

  it("renders import details and pagination", () => {
    render(
      <ServiceUsersImportDetailsTable
        details={[
          {
            email: "alice@example.com",
            firstName: "Alice",
            lastName: "Doe",
            status: "success",
          },
        ]}
        paging={{ currentPage: 1, totalPages: 2 }}
      />,
    )
    expect(screen.getByTestId("table")).toHaveTextContent(
      "table.columns.recipient",
    )
    expect(screen.getByRole("button", { name: "page 1" })).toBeInTheDocument()
  })

  it("updates pagination while retaining query parameters", () => {
    searchParams.set("profiles", "alice")
    render(
      <PaginationWrapper
        currentPage={1}
        totalPages={3}
        size={10}
        pageKey='profilesPage'
        sizeKey='profilesSize'
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "page 1" }))
    expect(pushMock).toHaveBeenCalledWith(
      "?profiles=alice&profilesPage=1&profilesSize=10",
    )
  })

  it("pushes a search immediately on Enter", () => {
    render(<SearchForm searchKey='profiles' pageKey='profilesPage' />)
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: " Alice " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(pushMock).toHaveBeenCalledWith("/en/service-users?profiles=Alice", {
      scroll: false,
    })
  })

  it("renders the CSV download and upload controls", () => {
    render(<ServiceUsersImportCSV />)
    expect(
      screen.getByRole("button", { name: "download.action" }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("upload.label")).toHaveAttribute(
      "accept",
      ".csv",
    )
    expect(screen.getByRole("button", { name: "upload.action" })).toBeDisabled()
  })

  it("downloads the CSV template", async () => {
    const createObjectURL = vi.fn(() => "blob:template")
    const revokeObjectURL = vi.fn()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(["template"]),
    } as Response)
    render(<ServiceUsersImportCSV />)

    fireEvent.click(screen.getByRole("button", { name: "download.action" }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledWith(
      "https://sag.example/profile/api/v1/profiles/imports/template",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Organization-Id": "org-1" }),
      }),
    )
  })

  it("signs in again when template download is unauthorized", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
    } as Response)
    render(<ServiceUsersImportCSV />)

    fireEvent.click(screen.getByRole("button", { name: "download.action" }))

    await waitFor(() => expect(signInMock).toHaveBeenCalledOnce())
    expect(toasterCreate).not.toHaveBeenCalled()
  })

  it("reports template download failures", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)
    render(<ServiceUsersImportCSV />)

    fireEvent.click(screen.getByRole("button", { name: "download.action" }))

    await waitFor(() =>
      expect(toasterCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: "download.error" }),
      ),
    )
  })

  it("rejects CSV files over the size limit", () => {
    render(<ServiceUsersImportCSV />)
    const input = screen.getByLabelText("upload.label")

    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "users.csv")],
      },
    })

    expect(screen.getByText("upload.errors.fileSize")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "upload.action" })).toBeDisabled()
  })

  it("uploads a CSV and opens its import details", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ profileImportId: "import-1" }),
    } as Response)
    render(<ServiceUsersImportCSV />)
    fireEvent.change(screen.getByLabelText("upload.label"), {
      target: { files: [new File(["email"], "users.csv")] },
    })

    fireEvent.click(screen.getByRole("button", { name: "upload.action" }))

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/en/service-users/import?id=import-1",
      ),
    )
    expect(toasterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "upload.success" }),
    )
  })

  it("shows API and network upload errors", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: { detail: "Invalid row" } }),
    } as Response)
    const { rerender } = render(<ServiceUsersImportCSV />)
    fireEvent.change(screen.getByLabelText("upload.label"), {
      target: { files: [new File(["bad"], "users.csv")] },
    })
    fireEvent.click(screen.getByRole("button", { name: "upload.action" }))
    expect(await screen.findByText("Invalid row")).toBeInTheDocument()

    vi.mocked(fetch).mockRejectedValue(new Error("Offline"))
    rerender(<ServiceUsersImportCSV />)
    fireEvent.change(screen.getByLabelText("upload.label"), {
      target: { files: [new File(["email"], "users.csv")] },
    })
    fireEvent.click(screen.getByRole("button", { name: "upload.action" }))

    expect(await screen.findByText("Offline")).toBeInTheDocument()
  })

  it("fetches and renders one service user", () => {
    searchParams.set("id", "user-1")
    render(<ServiceUser />)
    expect(gatewayFetchMock).toHaveBeenCalledWith(
      "/profile/api/v1/profiles/user-1",
    )
    expect(screen.getByText("alice@example.com")).toBeInTheDocument()
    expect(screen.getByText("1234567A")).toBeInTheDocument()
  })

  it("renders service-user loading and error states", () => {
    searchParams.set("id", "user-1")
    gatewayFetchMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
    })
    const { rerender } = render(<ServiceUser />)
    expect(screen.getByLabelText("Loading")).toBeInTheDocument()

    gatewayFetchMock.mockReturnValue({
      data: undefined,
      error: new Error("Profile failed"),
      isLoading: false,
    })
    rerender(<ServiceUser />)
    expect(screen.getByText("Profile failed")).toBeInTheDocument()
  })

  it("renders an empty service-user shell without an id", () => {
    gatewayFetchMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
    })
    render(<ServiceUser />)

    expect(gatewayFetchMock).toHaveBeenCalledWith(null)
    expect(screen.getByText("title")).toBeInTheDocument()
  })

  it("populates the edit form from the fetched service user", () => {
    searchParams.set("id", "user-1")
    render(<EditServiceUser />)
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Doe")).toBeInTheDocument()
    expect(screen.getByDisplayValue("1234567A")).toBeInTheDocument()
  })

  it("renders edit loading and error states", () => {
    searchParams.set("id", "user-1")
    gatewayFetchMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
    })
    const { rerender } = render(<EditServiceUser />)
    expect(screen.getByLabelText("Loading")).toBeInTheDocument()

    gatewayFetchMock.mockReturnValue({
      data: undefined,
      error: new Error("Edit failed"),
      isLoading: false,
    })
    rerender(<EditServiceUser />)
    expect(screen.getByText("Edit failed")).toBeInTheDocument()
  })

  it("validates required service-user names", () => {
    searchParams.set("id", "user-1")
    render(<EditServiceUser />)
    const firstName = getInput("firstName")
    const lastName = getInput("lastName")

    fireEvent.change(firstName, { target: { value: "" } })
    fireEvent.click(
      screen.getByRole("button", { name: "actions.update.title" }),
    )
    expect(screen.getByText("attributes.firstName")).toBeInTheDocument()

    fireEvent.change(firstName, { target: { value: "Ada" } })
    fireEvent.change(lastName, { target: { value: "" } })
    fireEvent.click(
      screen.getByRole("button", { name: "actions.update.title" }),
    )
    expect(screen.getByText("attributes.lastName")).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("updates a service user", async () => {
    searchParams.set("id", "user-1")
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ profileImportId: "import-1" }),
    } as Response)
    render(<EditServiceUser />)

    fireEvent.click(
      screen.getByRole("button", { name: "actions.update.title" }),
    )

    await waitFor(() =>
      expect(toasterCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: "actions.update.success" }),
      ),
    )
    expect(fetch).toHaveBeenCalledWith(
      "https://sag.example/profile/api/v1/profiles/imports",
      expect.objectContaining({
        body: expect.stringContaining('"preferredLanguage":"en"'),
        headers: expect.objectContaining({ "X-Organization-Id": "org-1" }),
      }),
    )
  })

  it("reports service-user update API failures", async () => {
    searchParams.set("id", "user-1")
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: { detail: "Invalid profile" } }),
    } as Response)
    render(<EditServiceUser />)

    fireEvent.click(
      screen.getByRole("button", { name: "actions.update.title" }),
    )

    await waitFor(() =>
      expect(toasterCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Invalid profile",
          variant: "danger",
        }),
      ),
    )
  })

  it("requires an email before updating a service user", async () => {
    searchParams.set("id", "user-1")
    gatewayFetchMock.mockReturnValue({
      data: { ...profile, email: "", details: profile.details },
      error: undefined,
      isLoading: false,
    })
    render(<EditServiceUser />)

    fireEvent.click(
      screen.getByRole("button", { name: "actions.update.title" }),
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(toasterCreate).not.toHaveBeenCalled()
  })
})
