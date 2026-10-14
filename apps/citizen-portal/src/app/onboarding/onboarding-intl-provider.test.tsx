import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OnboardingIntlProvider } from "./onboarding-intl-provider"

const mocks = vi.hoisted(() => ({
  localeParam: null as string | null,
  cookieLocale: "en",
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ lng: mocks.localeParam ?? "" }),
}))

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({
    children,
    locale,
  }: {
    children: React.ReactNode
    locale: string
  }) => <div data-locale={locale}>{children}</div>,
}))

vi.mock("@/components/html-lang-script", () => ({
  HtmlLangScript: ({ locale }: { locale: string }) => (
    <span data-testid='html-lang'>{locale}</span>
  ),
}))

vi.mock("@/const", () => ({
  AVAILABLE_LOCALES: ["en", "ga"],
  DEFAULT_LOCALE: "en",
}))

vi.mock("@/i18n/locale", () => ({
  messagesMap: { en: {}, ga: {} },
}))

vi.mock("@/util/locale-cookie", () => ({
  readLocaleCookie: () => mocks.cookieLocale,
}))

describe("OnboardingIntlProvider", () => {
  beforeEach(() => {
    mocks.localeParam = null
    mocks.cookieLocale = "en"
  })

  it("uses a supported locale from the query string", () => {
    mocks.localeParam = "ga"

    render(
      <OnboardingIntlProvider>
        <p>Content</p>
      </OnboardingIntlProvider>,
    )

    expect(screen.getByText("Content").parentElement).toHaveAttribute(
      "data-locale",
      "ga",
    )
    expect(screen.getByTestId("html-lang")).toHaveTextContent("ga")
  })

  it("falls back to the persisted locale", () => {
    mocks.localeParam = "unsupported"
    mocks.cookieLocale = "ga"

    render(
      <OnboardingIntlProvider>
        <p>Content</p>
      </OnboardingIntlProvider>,
    )

    expect(screen.getByText("Content").parentElement).toHaveAttribute(
      "data-locale",
      "ga",
    )
  })
})
