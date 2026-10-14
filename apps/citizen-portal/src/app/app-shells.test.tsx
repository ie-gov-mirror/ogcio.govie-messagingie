import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ApplicationSignoutPage from "./api/application-signout/page"
import GlobalError from "./global-error"
import RootLayout from "./layout"
import NotFound from "./not-found"
import OnboardingLayout from "./onboarding/layout"
import PostGlobalSignoutPage from "./post-global-signout/page"

vi.mock("next/font/google", () => ({
  Lato: () => ({ variable: "font-lato" }),
}))

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock("@/i18n/locale", () => ({
  detectLocale: () => "en",
  messagesMap: { en: {} },
}))

vi.mock("@/util/chunk-error", () => ({
  reloadOnceIfChunkLoadError: () => false,
}))

vi.mock("@/components/swr-provider", () => ({
  SwrProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='swr-provider'>{children}</div>
  ),
}))

vi.mock("@/components/onboarding-shell", () => ({
  OnboardingShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='onboarding-shell'>{children}</div>
  ),
}))

vi.mock("./onboarding/onboarding-intl-provider", () => ({
  OnboardingIntlProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='onboarding-intl'>{children}</div>
  ),
}))

vi.mock("@/components/layout/application-footer", () => ({
  ApplicationFooter: () => <footer>Footer</footer>,
}))

vi.mock("@/components/layout/containers", () => ({
  MainContainer: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock("@/components/post-global-signout", () => ({
  PostGlobalSignout: () => <div>Signed out</div>,
}))

describe("top-level app shells", () => {
  it("wraps the document body with the SWR provider", () => {
    const layout = RootLayout({ children: <p>App content</p> })

    expect(layout.type).toBe("html")
    expect(layout.props.className).toBe("font-lato")
    expect(layout.props.children.type).toBe("body")
    expect(layout.props.children.props.children.props.children).toEqual(
      <p>App content</p>,
    )
  })

  it("wraps onboarding content with its locale provider and shell", () => {
    render(
      <OnboardingLayout>
        <p>Onboarding content</p>
      </OnboardingLayout>,
    )

    expect(screen.getByTestId("onboarding-intl")).toBeInTheDocument()
    expect(screen.getByTestId("onboarding-shell")).toHaveTextContent(
      "Onboarding content",
    )
  })

  it("renders the global error and retries", async () => {
    const reset = vi.fn()
    render(<GlobalError error={new Error("boom")} reset={reset} />)

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "errors.global.title",
        }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: "errors.global.retry" }))
    expect(reset).toHaveBeenCalledOnce()
  })

  it("renders the localized not-found view", async () => {
    render(<NotFound />)

    expect(
      await screen.findByRole("heading", { name: "notFound.heading" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "home.button.back" }),
    ).toHaveAttribute("href", "/en/messages")
  })

  it("delegates the post-global-signout page", () => {
    render(<PostGlobalSignoutPage />)

    expect(screen.getByText("Signed out")).toBeInTheDocument()
  })

  it("keeps the application-signout endpoint bodyless", () => {
    const { container } = render(<ApplicationSignoutPage />)

    expect(container).toBeEmptyDOMElement()
  })
})
