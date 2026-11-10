import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AttachmentCard } from "@/components/messages/attachment-card"
import { fakeAnalytics } from "../../../test/utils/analytics"

const analytics = fakeAnalytics()
const { render } = analytics
const trackEvent = analytics.event

const pushLogSpy = vi.fn()
const signIn = vi.hoisted(() => vi.fn())
const authState = vi.hoisted(() => ({ authenticated: true, loading: false }))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: { fileName?: string }) => {
    const labels: Record<string, string> = {
      open: "Open",
      download: "Download",
    }
    if (labels[key]) return labels[key]
    if (key === "openFile") return `Open ${params?.fileName ?? ""}`
    if (key === "downloadFile") return `Download ${params?.fileName ?? ""}`
    return key
  },
}))

vi.mock("@grafana/faro-web-sdk", () => ({
  faro: { api: { pushLog: (...args: unknown[]) => pushLogSpy(...args) } },
  LogLevel: { WARN: "warn" },
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({
    authenticated: authState.authenticated,
    loading: authState.loading,
    signIn,
  }),
  useGatewayFetch: (path: string) => {
    const idMatch = path.match(/^\/upload\/api\/v1\/metadata\/(.+)$/)
    if (!idMatch) {
      return { data: undefined, isLoading: false, error: null }
    }
    const id = idMatch[1]
    if (id === "missing-metadata") {
      return {
        data: undefined,
        isLoading: false,
        error: new Error("not found"),
      }
    }
    return {
      data: {
        fileName: "payslip.pdf",
        fileSize: 2048,
        mimeType: "application/pdf",
      },
      isLoading: false,
      error: null,
    }
  },
}))

describe("AttachmentCard", () => {
  beforeEach(() => {
    pushLogSpy.mockClear()
    trackEvent.mockClear()
    signIn.mockClear()
    authState.authenticated = true
    authState.loading = false
  })

  it("renders file name and the file-type/size subtitle", () => {
    render(<AttachmentCard id='file-123' />)

    expect(screen.getByText("payslip.pdf")).toBeInTheDocument()
    expect(screen.getByText("PDF - 2 KB")).toBeInTheDocument()
  })

  it("renders Download and Open as inline links", () => {
    render(<AttachmentCard id='file-123' />)

    expect(
      screen.getByRole("link", { name: "Download payslip.pdf" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Open payslip.pdf" }),
    ).toBeInTheDocument()
  })

  it("points the Download link at the same-origin file proxy with a download attribute", () => {
    render(<AttachmentCard id='file-123' />)

    const link = screen.getByRole("link", { name: "Download payslip.pdf" })
    expect(link).toHaveAttribute(
      "href",
      "/_next/files/upload/api/v1/files/file-123",
    )
    expect(link).toHaveAttribute("download", "payslip.pdf")
  })

  it("opens the preview in a new tab via the same-origin proxy, without a download attribute", () => {
    render(<AttachmentCard id='file-123' />)

    const link = screen.getByRole("link", { name: "Open payslip.pdf" })
    expect(link).toHaveAttribute(
      "href",
      "/_next/files/upload/api/v1/files/file-123",
    )
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(link).not.toHaveAttribute("download")
  })

  it("logs when attachment metadata is unavailable", () => {
    const { container } = render(<AttachmentCard id='missing-metadata' />)

    expect(container).toBeEmptyDOMElement()
    expect(pushLogSpy).toHaveBeenCalledWith(
      ["Attachment metadata unavailable"],
      {
        context: {
          attachmentId: "missing-metadata",
          error: "not found",
        },
        level: "warn",
      },
    )
  })

  it("fires message-attachment-download on download click", () => {
    render(<AttachmentCard id='file-123' />)
    fireEvent.click(screen.getByTestId("attachment-download-action"))
    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "message-attachment-download",
        category: "Message",
        action: "Attachment Downloaded",
      },
    })
  })

  it("fires message-attachment-open when the attachment is opened in a new tab", () => {
    render(<AttachmentCard id='file-123' />)
    fireEvent.click(screen.getByTestId("attachment-preview-action"))
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "message-attachment-open",
        category: "Message",
        action: "Attachment Opened",
      },
    })
  })

  it("fires message-attachment-download-error when metadata is missing", () => {
    render(<AttachmentCard id='missing-metadata' />)
    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "message-attachment-download-error",
        category: "Message",
        action: "Attachment Unavailable",
      },
    })
  })

  it("reports the missing-metadata error only once across re-renders", () => {
    const { rerender } = render(<AttachmentCard id='missing-metadata' />)
    rerender(<AttachmentCard id='missing-metadata' />)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(pushLogSpy).toHaveBeenCalledTimes(1)
  })

  it("leaves the native download link intact when authenticated", () => {
    authState.authenticated = true
    authState.loading = false
    render(<AttachmentCard id='file-123' />)

    const notPrevented = fireEvent.click(
      screen.getByTestId("attachment-download-action"),
    )
    expect(notPrevented).toBe(true)
    expect(signIn).not.toHaveBeenCalled()
  })

  it("redirects to sign-in instead of navigating when the session is already expired", () => {
    authState.authenticated = false
    authState.loading = false
    render(<AttachmentCard id='file-123' />)

    const downloadPrevented = !fireEvent.click(
      screen.getByTestId("attachment-download-action"),
    )
    expect(downloadPrevented).toBe(true)
    expect(signIn).toHaveBeenCalledWith({ redirectUrl: window.location.href })

    signIn.mockClear()
    const openPrevented = !fireEvent.click(
      screen.getByTestId("attachment-preview-action"),
    )
    expect(openPrevented).toBe(true)
    expect(signIn).toHaveBeenCalledWith({ redirectUrl: window.location.href })
  })

  it("does not divert the click while auth is still loading", () => {
    authState.authenticated = false
    authState.loading = true
    render(<AttachmentCard id='file-123' />)

    const notPrevented = fireEvent.click(
      screen.getByTestId("attachment-download-action"),
    )
    expect(notPrevented).toBe(true)
    expect(signIn).not.toHaveBeenCalled()
  })
})
