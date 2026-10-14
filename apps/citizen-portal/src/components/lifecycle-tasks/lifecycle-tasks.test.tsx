import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LifecycleTasks } from "@/components/lifecycle-tasks/lifecycle-tasks"

const trackEvent = vi.hoisted(() => vi.fn())
const searchTrigger = vi.hoisted(() => vi.fn())
const createTrigger = vi.hoisted(() => vi.fn())
const downloadFn = vi.hoisted(() => vi.fn())
const toasterCreate = vi.hoisted(() => vi.fn())

vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// DS primitives carry side effects (portal mount, CSS-only theming) that
// don't matter for the analytics contract this test pins. Stub them as
// passthroughs, mirroring public-name-form.test.tsx.
vi.mock("@ogcio/design-system-react", async () => {
  const actual = await vi.importActual<
    typeof import("@ogcio/design-system-react")
  >("@ogcio/design-system-react")
  return {
    Alert: ({
      children,
      title,
    }: {
      children: React.ReactNode
      title: string
    }) => (
      <div>
        {title}
        {children}
      </div>
    ),
    Button: ({
      children,
      onClick,
      disabled,
    }: {
      children: React.ReactNode
      onClick?: () => void
      disabled?: boolean
    }) => (
      <button type='button' onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Heading: actual.Heading,
    Paragraph: ({ children }: { children: React.ReactNode }) => (
      <p>{children}</p>
    ),
    SectionBreak: () => <hr />,
    Spinner: () => <span>spinner</span>,
    Stack: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    toaster: {
      create: (...args: unknown[]) => toasterCreate(...args),
    },
  }
})

vi.mock("@ogcio/sag-client/react", () => ({
  SagFetchError: class SagFetchError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
  useGatewayMutation: (path: string) => {
    if (path === "/profile/api/v1/lifecycle-tasks/search") {
      return {
        trigger: searchTrigger,
        isLoading: false,
        error: null,
        data: undefined,
        reset: vi.fn(),
      }
    }
    return {
      trigger: createTrigger,
      isLoading: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
    }
  },
  useGatewayDownload: () => ({
    download: downloadFn,
    isDownloading: false,
    error: null,
  }),
}))

describe("LifecycleTasks analytics", () => {
  beforeEach(() => {
    trackEvent.mockClear()
    searchTrigger.mockReset()
    createTrigger.mockReset()
    downloadFn.mockReset()
    toasterCreate.mockClear()
  })

  it("fires export-requested when the export request succeeds", async () => {
    searchTrigger.mockResolvedValue({ tasks: [] })
    createTrigger.mockResolvedValue(undefined)

    render(<LifecycleTasks profileId='profile-1' locale='en' />)

    const button = await screen.findByRole("button", {
      name: "button.request",
    })
    const heading = screen.getByRole("heading", { name: "title" })
    expect(heading).toHaveClass("gi-text-lg", "xl:gi-text-xl")
    expect(heading.className).not.toContain("xl:gi-text-2xl")
    fireEvent.click(button)

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith({
        event: {
          name: "export-requested",
          category: "Profile",
          action: "Data Export Requested",
        },
      }),
    )
  })

  it("fires export-request-error when the export request fails", async () => {
    searchTrigger.mockResolvedValue({ tasks: [] })
    createTrigger.mockRejectedValue(new Error("boom"))

    render(<LifecycleTasks profileId='profile-1' locale='en' />)

    const button = await screen.findByRole("button", {
      name: "button.request",
    })
    fireEvent.click(button)

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith({
        event: {
          name: "export-request-error",
          category: "Profile",
          action: "Data Export Request Failed",
        },
      }),
    )
  })

  it("fires export-downloaded when the export download succeeds", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10)
    searchTrigger.mockResolvedValue({
      tasks: [
        {
          id: "task-1",
          type: "export_user_data",
          status: "completed",
          metadata: {
            uploadId: "file-1",
            expiresAt: futureDate.toISOString(),
          },
        },
      ],
    })
    downloadFn.mockResolvedValue(undefined)

    render(<LifecycleTasks profileId='profile-1' locale='en' />)

    const button = await screen.findByRole("button", {
      name: "button.download",
    })
    fireEvent.click(button)

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith({
        event: {
          name: "export-downloaded",
          category: "Profile",
          action: "Data Export Downloaded",
        },
      }),
    )
  })
})
