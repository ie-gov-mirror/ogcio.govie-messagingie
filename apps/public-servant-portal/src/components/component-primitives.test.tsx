import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApplicationFooter } from "./ApplicationFooter"
import { BackButton, BackLink } from "./BackButton"
import {
  BodyContainer,
  FullWidthContainer,
  MainContainer,
  MenuContainer,
  SuccessBannerContainer,
  TwoColumnLayout,
  UserMenuDrawerContainer,
} from "./containers"
import { CssSpinner } from "./css-spinner"
import { NotAuthorized } from "./not-authorized"

const trackEvent = vi.hoisted(() => vi.fn())

vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent }),
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    (namespace: string) => (key: string, values?: { year?: number }) =>
      key === "text.trademark"
        ? `© ${values?.year ?? ""} Government of Ireland`
        : `${namespace}.${key}`,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Footer: ({ utilitySlot }: { utilitySlot: ReactNode }) => (
    <footer>{utilitySlot}</footer>
  ),
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Icon: ({ icon }: { icon: string }) => <span>{icon}</span>,
  Link: ({
    children,
    href,
    onClick,
    external: _external,
    noColor: _noColor,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    external?: boolean
    noColor?: boolean
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onClick?.(event)
      }}
      {...props}
    >
      {children}
    </a>
  ),
  Paragraph: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  Stack: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
}))

describe("component primitives", () => {
  beforeEach(() => {
    trackEvent.mockClear()
  })

  it("renders footer links using the profile origin and tracks clicks", () => {
    render(<ApplicationFooter profileUrl='https://profile.example/base' />)

    const privacy = screen.getByRole("link", {
      name: "footer.link.privacy",
    })
    expect(privacy).toHaveAttribute(
      "href",
      "https://profile.example/en/privacy-policy",
    )
    fireEvent.click(privacy)
    expect(trackEvent).toHaveBeenCalledOnce()
    expect(screen.getAllByRole("link")).toHaveLength(5)
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Government of Ireland`),
    ).toBeInTheDocument()
  })

  it("renders back controls, invokes callbacks, and tracks clicks", () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <BackLink href='/messages'>Back to messages</BackLink>,
    )
    fireEvent.click(screen.getByRole("link", { name: "Back to messages" }))
    expect(trackEvent).toHaveBeenCalledOnce()

    rerender(<BackButton onClick={onClick}>Previous</BackButton>)
    fireEvent.click(screen.getByText("Previous"))
    expect(onClick).toHaveBeenCalledOnce()
    expect(trackEvent).toHaveBeenCalledTimes(2)

    rerender(<BackButton onClick={onClick}>{null}</BackButton>)
    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
  })

  it("renders the unauthorized message", () => {
    render(<NotAuthorized />)
    expect(
      screen.getByRole("heading", { name: "notAuthorized.title" }),
    ).toBeInTheDocument()
    expect(screen.getByText("notAuthorized.description")).toBeInTheDocument()
  })

  it("renders every layout container and forwards attributes", () => {
    const body = BodyContainer({
      children: "body",
      ...{ "data-testid": "body" },
    })
    expect(body.type).toBe("body")
    expect(body.props["data-testid"]).toBe("body")

    const cases = [
      <MainContainer key='main' data-testid='main'>
        main
      </MainContainer>,
      <FullWidthContainer key='full' data-testid='full'>
        full
      </FullWidthContainer>,
      <TwoColumnLayout key='two' data-testid='two'>
        two
      </TwoColumnLayout>,
      <UserMenuDrawerContainer key='drawer' data-testid='drawer'>
        drawer
      </UserMenuDrawerContainer>,
      <SuccessBannerContainer key='success' data-testid='success'>
        success
      </SuccessBannerContainer>,
      <MenuContainer key='menu' data-testid='menu'>
        menu
      </MenuContainer>,
    ]

    const { container } = render(cases)
    for (const id of ["main", "full", "two", "drawer", "success", "menu"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    expect(container.querySelector("main")).toHaveTextContent("main")
  })

  it("renders a decorative CSS spinner with its contract attributes", () => {
    render(<CssSpinner dataTestid='spinner' size='sm' />)
    expect(screen.getByTestId("spinner")).toHaveAttribute("aria-hidden", "true")
  })
})
