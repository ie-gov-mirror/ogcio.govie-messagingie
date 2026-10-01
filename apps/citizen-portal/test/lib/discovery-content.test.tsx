import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import {
  fetchStaticContent,
  mockSource,
} from "../../scripts/fetch-static-content.mjs"
import { ContentBlocks } from "@/components/discovery/content-blocks"
import {
  JourneyView,
  LifeEventsIndexView,
  LifeEventView,
} from "@/components/discovery/discovery-views"
import { getDiscovery, getLifeEvent } from "@/lib/discovery-content"
import en from "@/messages/en.json"

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/discovery",
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "http://messaging.local.test:8080",
      profile: "http://profile.local.test:8080",
      dashboard: "http://dashboard.local.test:8080",
    },
  }),
}))

const FIXTURES = join(process.cwd(), "static-content/fixtures")
const quiet = { info() {}, warn() {} }

async function run(source = mockSource()) {
  const outDir = await mkdtemp(join(tmpdir(), "static-content-"))
  await fetchStaticContent({ source, indexPageId: 1000, outDir, log: quiet })
  return outDir
}

describe("fetch:static-content (mock mode)", () => {
  it("builds the school-place discovery path in en and ga", async () => {
    const outDir = await run()

    for (const locale of ["en", "ga"]) {
      const discovery = getDiscovery(locale, outDir)
      expect(discovery.categories).toHaveLength(9)
      expect(discovery.lifeEvents).toHaveLength(21)

      const school = getLifeEvent(discovery, "child-starting-school")
      expect(school.journeys).toHaveLength(5)
      const journey = school.journeys.find(
        (j) => j.slug === "apply-for-a-school-place",
      )
      expect(journey?.body).toContainEqual({
        type: "buttons",
        links: [
          {
            href: "https://forms.uat.services.gov.ie/en/school-place-application",
            text: "Start application",
          },
        ],
      })

      render(<ContentBlocks blocks={journey?.body ?? []} />)
      expect(
        screen.getByRole("heading", { level: 2, name: "Getting ready to apply" }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("link", { name: "Start application" }),
      ).toHaveAttribute(
        "href",
        "https://forms.uat.services.gov.ie/en/school-place-application",
      )
      expect(screen.getAllByRole("listitem")).toHaveLength(6)
      document.body.innerHTML = ""
    }

    const appeal = getLifeEvent(getDiscovery("ga", outDir), "child-starting-school")
      .journeys.find((j) => j.slug === "appeal-a-refusal-of-admission")
    expect(JSON.stringify(appeal?.body)).toContain(
      '"href":"/ga/discovery/child-starting-school/apply-for-a-school-place"',
    )
  })

  it("renders the index, life event and journey pages", async () => {
    const discovery = getDiscovery("en", await run())
    const school = getLifeEvent(discovery, "child-starting-school")
    const inIntl = (ui: React.ReactNode) =>
      render(
        <NextIntlClientProvider locale='en' messages={en}>
          {ui}
        </NextIntlClientProvider>,
      )

    inIntl(<LifeEventsIndexView discovery={discovery} />)
    expect(screen.getByText("9 categories · 21 life events")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Child starting school" }),
    ).toHaveAttribute("href", "/en/discovery/child-starting-school")
    document.body.innerHTML = ""

    inIntl(<LifeEventView lifeEvent={school} categoryTitle='Education & Learning' />)
    expect(screen.getByText("5 services in this life event")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Apply for a school place" }),
    ).toHaveAttribute(
      "href",
      "/en/discovery/child-starting-school/apply-for-a-school-place",
    )
    document.body.innerHTML = ""

    inIntl(
      <LifeEventView
        lifeEvent={getLifeEvent(discovery, "pension")}
        categoryTitle='Later Life'
      />,
    )
    expect(
      screen.getByText("There are no services in this life event yet"),
    ).toBeInTheDocument()
    document.body.innerHTML = ""

    inIntl(<JourneyView lifeEvent={school} journey={school.journeys[0]} />)
    expect(
      screen.getByRole("link", { name: "Back to Child starting school" }),
    ).toHaveAttribute("href", "/en/discovery/child-starting-school")
    expect(
      screen.getByRole("heading", { level: 1, name: "Apply for a school place" }),
    ).toBeInTheDocument()
  })

  it("fails the build on an unknown block type, naming the document", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fixtures-"))
    const en = JSON.parse(await readFile(join(FIXTURES, "en.json"), "utf8"))
    en.find((p: { id: number }) => p.id === 1201).body[0].type = "video"
    await writeFile(join(dir, "en.json"), JSON.stringify(en))
    await writeFile(
      join(dir, "ga.json"),
      await readFile(join(FIXTURES, "ga.json"), "utf8"),
    )

    await expect(run(mockSource(dir))).rejects.toThrow(
      'page 1201 (en) $.body.0.type: unknown block type "video"',
    )
  })
})
