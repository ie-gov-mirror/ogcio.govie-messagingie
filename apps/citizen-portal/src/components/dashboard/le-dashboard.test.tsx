import { fireEvent, render, screen, within } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import en from "@/messages/en.json"
import type { Submission } from "@/types"
import { fakeAnalytics } from "../../../test/utils/analytics"

const state = vi.hoisted(() => ({
  submissions: [] as Submission[],
  totalCount: 0,
  isLoading: false,
  idleReady: true,
  fetches: {} as Record<string, unknown>,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/my-dashboard",
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "http://messaging.local.test",
      profile: "http://profile.local.test",
      dashboard: "http://dashboard.local.test",
    },
  }),
  useCrossZoneLink: () => (_zone: string, path: string) =>
    `http://messaging.local.test${path}`,
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ user: { sub: "user-1" }, loading: false }),
  useGatewayFetch: (key: string) => ({
    data: Object.entries(state.fetches).find(([k]) => key.includes(k))?.[1],
    isLoading: false,
  }),
}))
vi.mock("@/hooks/use-idle-mount", () => ({
  useIdleMount: () => state.idleReady,
}))
vi.mock("@/components/public-name", () => ({ PublicName: () => "Ashley" }))
vi.mock("@/components/submissions/use-submissions", () => ({
  useSubmissionsList: () => ({
    submissions: state.submissions,
    totalCount: state.totalCount,
    isLoading: state.isLoading,
    error: null,
  }),
}))

import { LeDashboard } from "./le-dashboard"

const submission = (id: string, title: string): Submission => ({
  id,
  title: { en: title },
  description: { en: "" },
  organizationId: `org-${id}`,
  journeyId: "j",
  status: "submitted",
  createdAt: "2026-03-01T10:00:00Z",
  updatedAt: "2026-03-24T10:00:00Z",
})

const lifeEvents = ["birth", "school", "home", "bereaved"].map((slug) => ({
  slug,
  title: `Life event ${slug}`,
  category: `Category ${slug}`,
  icon: "home",
}))

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale='en' messages={en}>
      <LeDashboard lifeEvents={lifeEvents} />
    </NextIntlClientProvider>,
  )
}

describe("LeDashboard", () => {
  beforeEach(() => {
    state.isLoading = false
    state.idleReady = true
    state.submissions = ["a", "b", "c", "d", "e"].map((id) =>
      submission(id, `Application ${id}`),
    )
    state.totalCount = 7
    state.fetches = {
      "org-a": { translations: { en: { name: "Wicklow County Council" } } },
      "submissionId=a": [
        {
          id: "m1",
          subject: "Application received",
          createdAt: "2026-03-24T10:00:00Z",
          isSeen: false,
        },
      ],
    }
  })

  it("links four life events to discovery, with View all", () => {
    renderDashboard()
    const section = screen.getByRole("region", { name: "Life events" })
    const cards = within(section).getAllByRole("listitem")
    expect(cards).toHaveLength(4)
    expect(
      within(cards[0]).getByRole("link", { name: "Life event birth" }),
    ).toHaveAttribute("href", "/en/discovery/birth")
    expect(
      within(section).getByRole("link", { name: "View all life events" }),
    ).toHaveAttribute("href", "/en/discovery")
  })

  it("shows the three most recent applications with their latest message", () => {
    renderDashboard()
    const section = screen.getByRole("region", { name: "Recent applications" })
    const cards = within(section).getAllByRole("listitem")
    expect(cards).toHaveLength(3)

    const first = within(cards[0])
    expect(first.getByText("Submitted")).toBeInTheDocument()
    expect(first.getByText("Wicklow County Council")).toBeInTheDocument()
    expect(first.getByText("Last update 24/03/2026")).toBeInTheDocument()
    expect(first.getByText("New")).toBeInTheDocument()
    expect(
      first.getByRole("link", { name: "Application received" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/en/messages?id=m1&submissionId=a"),
    )
    expect(within(cards[1]).getByText("No messages yet")).toBeInTheDocument()
    expect(
      within(section).getByRole("link", { name: "View all applications" }),
    ).toHaveAttribute("href", "/en/my-submissions")
  })

  it("hides View all when there are three or fewer applications", () => {
    state.submissions = state.submissions.slice(0, 2)
    state.totalCount = 2
    renderDashboard()
    const section = screen.getByRole("region", { name: "Recent applications" })
    expect(within(section).getAllByRole("listitem")).toHaveLength(2)
    expect(within(section).queryByRole("link", { name: /View all/ })).toBeNull()
  })

  it("shows three card skeletons while applications are loading", () => {
    state.submissions = []
    state.totalCount = 0
    state.isLoading = true
    renderDashboard()
    const section = screen.getByRole("region", { name: "Recent applications" })
    expect(within(section).getAllByTestId("le-card-skeleton")).toHaveLength(3)
    expect(within(section).getByRole("status")).toHaveTextContent(
      "Loading applications",
    )
    expect(within(section).queryByRole("link", { name: /View all/ })).toBeNull()
    expect(within(section).queryByText("You have no applications")).toBeNull()
  })

  it("keeps the skeletons up until the submissions fetch is allowed to start", () => {
    state.submissions = []
    state.totalCount = 0
    state.idleReady = false
    renderDashboard()
    const section = screen.getByRole("region", { name: "Recent applications" })
    expect(within(section).getAllByTestId("le-card-skeleton")).toHaveLength(3)
    expect(within(section).queryByText("You have no applications")).toBeNull()
  })

  it("shows the info alert, not cards, when there are no applications", () => {
    state.submissions = []
    state.totalCount = 0
    renderDashboard()
    const section = screen.getByRole("region", { name: "Recent applications" })
    expect(within(section).getByText("You have no applications")).toBeVisible()
    expect(within(section).queryByRole("list")).toBeNull()
    expect(within(section).queryByRole("link", { name: /View all/ })).toBeNull()
  })
})

describe("LeDashboard analytics", () => {
  const sent = (category: string, name: string, action: string) => [
    { event: { category, name, action } },
  ]

  function renderTracked() {
    const analytics = fakeAnalytics()
    const view = analytics.render(
      <NextIntlClientProvider locale='en' messages={en}>
        <LeDashboard lifeEvents={lifeEvents} />
      </NextIntlClientProvider>,
    )
    return { analytics, ...view }
  }

  beforeEach(() => {
    state.isLoading = false
    state.idleReady = true
    state.submissions = ["a", "b", "c", "d"].map((id) =>
      submission(id, `Application ${id}`),
    )
    state.totalCount = 7
    state.fetches = {}
  })

  it("reports the dashboard view once", () => {
    const { analytics, rerender } = renderTracked()
    rerender(
      <NextIntlClientProvider locale='en' messages={en}>
        <LeDashboard lifeEvents={lifeEvents} />
      </NextIntlClientProvider>,
    )
    expect(analytics.event.mock.calls).toEqual([
      sent("Life Event", "dashboard-view", "Dashboard Viewed"),
    ])
  })

  it("reports which dashboard link the citizen follows, never which item", () => {
    const { analytics } = renderTracked()
    analytics.event.mockClear()

    const lifeEventsSection = screen.getByRole("region", {
      name: "Life events",
    })
    fireEvent.click(
      within(lifeEventsSection).getByRole("link", { name: "Life event birth" }),
    )
    fireEvent.click(
      within(lifeEventsSection).getByRole("link", {
        name: "View all life events",
      }),
    )
    const applications = screen.getByRole("region", {
      name: "Recent applications",
    })
    fireEvent.click(
      within(applications).getByRole("link", { name: "Application a" }),
    )
    fireEvent.click(
      within(applications).getByRole("link", { name: "View all applications" }),
    )

    expect(analytics.event.mock.calls).toEqual([
      sent(
        "Life Event",
        "dashboard-life-event-open",
        "Life Event Opened from Dashboard",
      ),
      sent("Life Event", "dashboard-life-events-all", "All Life Events Opened"),
      sent(
        "Application",
        "dashboard-application-open",
        "Application Opened from Dashboard",
      ),
      sent(
        "Application",
        "dashboard-applications-all",
        "All Applications Opened",
      ),
    ])
    const payload = JSON.stringify(analytics.event.mock.calls)
    expect(payload).not.toContain("birth")
    expect(payload).not.toContain("Application a")
  })
})
