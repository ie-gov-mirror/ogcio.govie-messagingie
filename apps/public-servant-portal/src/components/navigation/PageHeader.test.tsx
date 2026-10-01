import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { PageHeader } from "./PageHeader"

const header = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/messages",
  useSearchParams: () => new URLSearchParams("search=hello"),
}))
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) =>
    ({
      "drawer.link.messaging": "Messaging",
      "drawer.link.profile": "Profile",
      "drawer.link.logout": "Logout",
      "drawer.link.serviceUsers": "Service users",
      "label.menu": "Menu",
    })[key] ?? key,
}))
vi.mock("@/hooks/use-organization-context", () => ({
  useOrganizationContext: () => ({
    currentOrganization: { id: "org-1", name: "Department" },
  }),
}))
vi.mock("@/util/get-languages", () => ({
  useClientLanguages: () => ({ href: "/ga/messages", label: "Gaeilge" }),
}))
vi.mock("@ogcio/design-system-react", () => ({
  Header: ({
    title,
    items,
  }: {
    title: string
    items: { component: ReactNode }[]
  }) => {
    header({ title, items })
    return (
      <header>
        <h1>{title}</h1>
        {items[0]?.component}
      </header>
    )
  },
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Link: ({
    children,
    asButton,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    asButton?: unknown
  }) => <a {...props}>{children}</a>,
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FormField: ({ children }: { children: ReactNode }) => <>{children}</>,
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} />
  ),
  SelectItem: (props: React.OptionHTMLAttributes<HTMLOptionElement>) => (
    <option {...props} />
  ),
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}))
vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent: vi.fn() }),
}))

describe("PageHeader", () => {
  it("renders the organization title and configured drawer links", () => {
    render(
      <PageHeader
        publicName='Jane'
        config={{
          profileAdminUrl: "https://profile.example",
          messagingUrl: "https://messaging.example",
        }}
      />,
    )
    expect(
      screen.getByRole("heading", { name: "Department - Messaging Admin" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "https://profile.example/en/my-profile",
    )
    expect(screen.getByRole("link", { name: "Messaging" })).toHaveAttribute(
      "href",
      "https://messaging.example/en",
    )
    expect(screen.getByRole("link", { name: "Service users" })).toHaveAttribute(
      "href",
      "https://profile.example/en/service-users",
    )
    expect(screen.getByRole("link", { name: "Gaeilge" })).toHaveAttribute(
      "href",
      "/ga/messages",
    )
  })
})
