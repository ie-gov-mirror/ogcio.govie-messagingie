import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { ContentBlocks } from "@/components/discovery/content-blocks"
import {
  JourneyView,
  LifeEventsIndexView,
  LifeEventView,
} from "@/components/discovery/discovery-views"
import styles from "@/components/discovery/discovery-views.module.css"
import pageTitleStyles from "@/components/page-title.module.css"
import type { ContentBlock, DiscoveryContent, LifeEvent } from "@/lib/discovery"
import { getDiscovery, getLifeEvent } from "@/lib/discovery"
import en from "@/messages/en.json"
import ga from "@/messages/ga.json"
import {
  MOCK_FIXTURES_DIR,
  MOCK_INDEX_PAGE_ID,
} from "../../scripts/static-content/config.ts"
import { buildDiscoveryContent } from "../../scripts/static-content/pipeline/index.ts"
import { createMockTransport } from "../../scripts/static-content/wagtail/index.ts"
import { writeStaticContent } from "../../scripts/static-content/write.ts"

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/discovery",
  useRouter: () => ({ push: vi.fn() }),
}))

const SCHOOL_PLACE_JOURNEY_URL =
  "https://journey.uat.services.gov.ie/journey/d48b8b19-7c36-4f90-b9a0-94daaf9e73a4"

vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "http://messaging.local.test:8080",
      profile: "http://profile.local.test:8080",
      dashboard: "http://dashboard.local.test:8080",
    },
  }),
}))

let outDir: string

beforeAll(async () => {
  const { content } = await buildDiscoveryContent({
    transport: createMockTransport(MOCK_FIXTURES_DIR),
    indexPageId: MOCK_INDEX_PAGE_ID,
  })
  if (!content) throw new Error("mock content should build")
  outDir = join(await mkdtemp(join(tmpdir(), "discovery-")), ".static-content")
  await writeStaticContent({ outputDir: outDir, mode: "mock", content })
})

afterAll(async () => {
  await rm(join(outDir, ".."), { recursive: true, force: true })
})

function patchLifeEvents(
  discovery: DiscoveryContent,
  patches: Record<string, Partial<LifeEvent>>,
): DiscoveryContent {
  return {
    ...discovery,
    lifeEvents: discovery.lifeEvents.map((lifeEvent) =>
      patches[lifeEvent.slug]
        ? { ...lifeEvent, ...patches[lifeEvent.slug] }
        : lifeEvent,
    ),
  }
}

function renderIn(locale: "en" | "ga", ui: ReactNode) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : ga}
    >
      {ui}
    </NextIntlClientProvider>,
  )
}

describe("getDiscovery", () => {
  it("reads the content written by fetch:static-content", () => {
    for (const locale of ["en", "ga"]) {
      const discovery = getDiscovery(locale, outDir)
      expect(discovery.locale).toBe(locale)
      expect(discovery.categories).toHaveLength(9)
      expect(discovery.lifeEvents).toHaveLength(21)
    }
  })

  it("rejects stale or foreign output, and unknown locales", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discovery-stale-"))
    await writeFile(
      join(dir, "discovery.en.json"),
      JSON.stringify({ locale: "en", intro: [] }),
    )
    expect(() => getDiscovery("en", dir)).toThrow()
    expect(() => getDiscovery("fr", outDir)).toThrow()
    await rm(dir, { recursive: true, force: true })
  })

  it("throws on an unknown life event", () => {
    expect(() => getLifeEvent(getDiscovery("en", outDir), "nope")).toThrow(
      'Unknown life event "nope"',
    )
  })
})

describe("ContentBlocks", () => {
  it("renders headings, lists and CTAs", () => {
    const journey = getLifeEvent(
      getDiscovery("en", outDir),
      "child-starting-school",
    ).journeys.find((j) => j.slug === "apply-for-a-school-place")

    renderIn("en", <ContentBlocks blocks={journey?.body ?? []} />)

    expect(
      screen.queryByRole("heading", { name: "Getting ready to apply" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 2, name: "How long it takes" }),
    ).toHaveClass("gi-text-lg", "xl:gi-text-xl")
    expect(
      screen.getByText(/Before you start, you will need/).closest("p"),
    ).toHaveClass("gi-text-md")
    expect(screen.getAllByRole("listitem")).toHaveLength(6)
    expect(
      screen.getByRole("link", { name: "Start application" }),
    ).toHaveAttribute("href", SCHOOL_PLACE_JOURNEY_URL)
  })

  it.each(["en", "ga"] as const)(
    "prefixes internal links with the current locale (%s)",
    (locale) => {
      const journey = getLifeEvent(
        getDiscovery(locale, outDir),
        "child-starting-school",
      ).journeys.find((j) => j.slug === "appeal-a-refusal-of-admission")

      renderIn(locale, <ContentBlocks blocks={journey?.body ?? []} />)

      expect(
        screen.getByRole("link", { name: "Apply for a school place" }),
      ).toHaveAttribute(
        "href",
        `/${locale}/discovery/child-starting-school/apply-for-a-school-place`,
      )
    },
  )
})

describe("discovery views", () => {
  it("renders the index, life event and journey pages", () => {
    const discovery = getDiscovery("en", outDir)
    const school = getLifeEvent(discovery, "child-starting-school")

    renderIn("en", <LifeEventsIndexView discovery={discovery} />)
    expect(screen.getByText("9 categories · 21 life events")).toHaveClass(
      "gi-text-md",
      "gi-text-color-text-system-neutral-muted",
    )
    expect(
      screen.getByRole("link", { name: "Child starting school" }),
    ).toHaveAttribute("href", "/en/discovery/child-starting-school")
    document.body.innerHTML = ""

    renderIn(
      "en",
      <LifeEventView lifeEvent={school} categoryTitle='Education & Learning' />,
    )
    expect(screen.getByText("5 services in this life event")).toHaveClass(
      "gi-text-md",
      "gi-text-color-text-system-neutral-muted",
    )
    expect(
      screen.getByRole("link", { name: "Apply for a school place" }),
    ).toHaveAttribute(
      "href",
      "/en/discovery/child-starting-school/apply-for-a-school-place",
    )
    const back = screen.getByRole("link", { name: "Back" })
    expect(back).toHaveAttribute("href", "/en/discovery")
    expect(back).not.toHaveClass("gi-link-no-visited")
    document.body.innerHTML = ""

    renderIn(
      "en",
      <LifeEventView
        lifeEvent={getLifeEvent(discovery, "pension")}
        categoryTitle='Later Life'
      />,
    )
    expect(
      screen.getByText("There are no services in this life event yet"),
    ).toBeInTheDocument()
    document.body.innerHTML = ""

    renderIn(
      "en",
      <JourneyView lifeEvent={school} journey={school.journeys[0]} />,
    )
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/en/discovery/child-starting-school",
    )
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Apply for a school place",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Start application" }),
    ).toHaveAttribute("href", SCHOOL_PLACE_JOURNEY_URL)
  })

  it("opens the in-app school-place page and keeps the forms URL on Start application", () => {
    const discovery = getDiscovery("en", outDir)
    const school = getLifeEvent(discovery, "child-starting-school")
    const journey = school.journeys.find(
      (item) => item.slug === "apply-for-a-school-place",
    )
    if (!journey) throw new Error("missing school-place journey")
    const inApp = "/en/discovery/child-starting-school/apply-for-a-school-place"

    renderIn(
      "en",
      <LifeEventView lifeEvent={school} categoryTitle='Education & Learning' />,
    )
    const apply = screen.getByRole("link", { name: "Apply for a school place" })
    expect(apply).toHaveAttribute("href", inApp)
    expect(apply).not.toHaveAttribute("target", "_blank")
    cleanup()

    renderIn("en", <JourneyView lifeEvent={school} journey={journey} />)
    const start = screen.getByRole("link", { name: "Start application" })
    expect(start).toHaveAttribute("href", SCHOOL_PLACE_JOURNEY_URL)
    expect(start).toHaveAttribute("target", "_blank")
  })

  it("renders the CMS start button when the external forms href is absent", () => {
    const discovery = getDiscovery("en", outDir)
    const school = getLifeEvent(discovery, "child-starting-school")
    const journey = school.journeys.find(
      (item) => item.slug === "apply-for-a-school-place",
    )
    if (!journey) throw new Error("missing school-place journey")
    const cmsHref = "/from-the-cms"
    const withoutExternalHref = {
      ...journey,
      body: journey.body.map((block) =>
        block.type === "buttonLinks"
          ? {
              ...block,
              links: block.links.map((link) => ({
                ...link,
                href: cmsHref,
                internal: true,
              })),
            }
          : block,
      ),
    }
    const inApp = "/en/discovery/child-starting-school/apply-for-a-school-place"

    renderIn(
      "en",
      <LifeEventView lifeEvent={school} categoryTitle='Education & Learning' />,
    )
    const apply = screen.getByRole("link", { name: "Apply for a school place" })
    expect(apply).toHaveAttribute("href", inApp)
    expect(apply).not.toHaveAttribute("target", "_blank")
    cleanup()

    renderIn(
      "en",
      <JourneyView lifeEvent={school} journey={withoutExternalHref} />,
    )
    const start = screen.getByRole("link", { name: "Start application" })
    expect(start).toHaveAttribute("href", `/en${cmsHref}`)
    expect(start).not.toHaveAttribute("target", "_blank")
  })

  it("renders a description under each life event on the overview", () => {
    const discovery = getDiscovery("en", outDir)
    renderIn("en", <LifeEventsIndexView discovery={discovery} />)

    const school = screen.getByRole("link", { name: "Child starting school" })
    expect(school.closest("li")).toHaveTextContent(
      "Enrolling a child in primary school, the supports available, and what to do if you do not get a place.",
    )
    expect(school.closest("li")?.querySelector("p")).toHaveClass("gi-text-sm")

    expect(
      screen.getByRole("link", { name: "Birth of a Child" }).closest("li"),
    ).toHaveTextContent(
      "Registering a birth, and the payments and services available to new parents.",
    )
  })

  it("uses the life-events type scale, muted eyebrow, and card divider", () => {
    const discovery = getDiscovery("en", outDir)
    const school = getLifeEvent(discovery, "child-starting-school")

    renderIn("en", <LifeEventsIndexView discovery={discovery} />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      pageTitleStyles.pageTitle,
    )
    expect(
      screen.getByText(/Choose the moment you are dealing with/),
    ).toHaveClass("gi-text-lg")
    expect(
      screen.getByRole("heading", { level: 2, name: "Education & Learning" }),
    ).toHaveClass("gi-text-lg", "xl:gi-text-xl")
    expect(screen.getByText("school")).toHaveClass(styles.categoryIcon)
    expect(screen.getByText("blind")).toHaveClass(styles.categoryIcon)
    expect(screen.getByText("local_florist")).toHaveClass(styles.categoryIcon)
    expect(
      screen.getByRole("link", { name: "Child starting school" }).closest("li"),
    ).toHaveClass("gi-border-b", "gi-border-color-border-system-neutral-muted")
    for (const el of [
      screen.getByRole("link", { name: "Child starting school" }).closest("ul"),
      screen
        .getByRole("link", { name: "Child starting school" })
        .closest("section"),
    ]) {
      expect(el).toHaveClass("gi-w-full")
    }
    expect(
      screen.getByRole("link", { name: "Child starting school" }),
    ).toHaveClass("gi-font-bold", "gi-text-md")
    cleanup()

    renderIn(
      "en",
      <LifeEventView lifeEvent={school} categoryTitle='Education & Learning' />,
    )
    expect(screen.getByText("Life event · Education & Learning")).toHaveClass(
      "gi-font-bold",
      "gi-text-color-text-system-neutral-muted",
    )
    expect(
      screen.getByRole("heading", { level: 1, name: "Child starting school" }),
    ).toHaveClass(pageTitleStyles.pageTitle)
    expect(screen.getByText(/Enrolling a child in primary school/)).toHaveClass(
      "gi-text-lg",
    )
    expect(
      screen.getByRole("heading", { level: 2, name: "Services" }),
    ).toHaveClass("gi-text-lg", "xl:gi-text-xl")
    expect(
      screen
        .getByRole("link", { name: "Apply for a school place" })
        .closest("li"),
    ).toHaveClass("gi-border-b", "gi-border-color-border-system-neutral-muted")
    for (const el of [
      screen
        .getByRole("link", { name: "Apply for a school place" })
        .closest("ul"),
      screen
        .getByRole("link", { name: "Apply for a school place" })
        .closest("section"),
    ]) {
      expect(el).toHaveClass("gi-w-full")
    }
    cleanup()

    renderIn(
      "en",
      <JourneyView lifeEvent={school} journey={school.journeys[0]} />,
    )
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Apply for a school place",
      }),
    ).toHaveClass(pageTitleStyles.pageTitle)
    expect(screen.queryByText(/Life event ·/)).not.toBeInTheDocument()
    expect(
      screen.getByText(/Use this service to apply for a primary school place/),
    ).toHaveClass("gi-text-lg")
    expect(
      screen.queryByRole("heading", { name: "Getting ready to apply" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 2, name: "How long it takes" }),
    ).toHaveClass("gi-text-lg", "xl:gi-text-xl")
  })

  it("uses a summary, otherwise the first plain-text paragraph", () => {
    const discovery = getDiscovery("en", outDir)
    const fallback: ContentBlock = {
      type: "richText",
      nodes: [
        {
          type: "list",
          ordered: false,
          children: [
            { type: "listItem", children: [{ type: "text", value: "skip" }] },
          ],
        },
        { type: "paragraph", children: [{ type: "text", value: "   " }] },
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Apply " },
            { type: "strong", children: [{ type: "text", value: "now" }] },
            { type: "text", value: " " },
            { type: "emphasis", children: [{ type: "text", value: "today" }] },
            { type: "lineBreak" },
            {
              type: "link",
              href: "https://www.gov.ie/en/",
              internal: false,
              children: [{ type: "text", value: "here" }],
            },
            { type: "text", value: " " },
            {
              type: "list",
              ordered: true,
              children: [
                {
                  type: "listItem",
                  children: [{ type: "text", value: "one" }],
                },
                {
                  type: "paragraph",
                  children: [{ type: "text", value: " two" }],
                },
              ],
            },
          ],
        },
      ],
    }

    renderIn(
      "en",
      <LifeEventsIndexView
        discovery={patchLifeEvents(discovery, {
          "child-starting-school": {
            summary: "Explicit CMS summary",
            body: [
              {
                type: "richText",
                nodes: [
                  {
                    type: "paragraph",
                    children: [
                      { type: "text", value: "Body that must not show" },
                    ],
                  },
                ],
              },
            ],
          },
          "birth-of-a-child": {
            summary: undefined,
            body: [{ type: "heading", text: "Skipped heading" }, fallback],
          },
          pension: {
            summary: undefined,
            body: [
              { type: "heading", text: "Only a heading" },
              {
                type: "richText",
                nodes: [{ type: "paragraph", children: [] }],
              },
            ],
          },
        })}
      />,
    )

    const school = screen
      .getByRole("link", { name: "Child starting school" })
      .closest("li")
    expect(school).toHaveTextContent("Explicit CMS summary")
    expect(school).not.toHaveTextContent("Body that must not show")

    expect(
      screen.getByRole("link", { name: "Birth of a Child" }).closest("li"),
    ).toHaveTextContent("Apply now today here one two")

    expect(
      screen
        .getByRole("link", { name: "Pension" })
        .closest("li")
        ?.querySelector("p"),
    ).toBeNull()
  })

  it("renders no intro lead when the first block is not a paragraph", () => {
    const discovery = getDiscovery("en", outDir)
    const school = getLifeEvent(discovery, "child-starting-school")

    renderIn(
      "en",
      <LifeEventsIndexView
        discovery={{
          ...discovery,
          body: [{ type: "heading", text: "No lead paragraph" }],
        }}
      />,
    )
    expect(
      screen.getByRole("heading", { level: 2, name: "No lead paragraph" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Choose the moment you are dealing with/),
    ).not.toBeInTheDocument()
    cleanup()

    renderIn(
      "en",
      <LifeEventView
        lifeEvent={{
          ...school,
          body: [
            {
              type: "richText",
              nodes: [
                {
                  type: "list",
                  ordered: false,
                  children: [
                    {
                      type: "listItem",
                      children: [{ type: "text", value: "Only a list" }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
        categoryTitle='Education & Learning'
      />,
    )
    expect(screen.queryByText(/Enrolling a child/)).not.toBeInTheDocument()
    expect(screen.getByText("Only a list")).toBeInTheDocument()
    cleanup()

    renderIn(
      "en",
      <JourneyView
        lifeEvent={school}
        journey={{
          ...school.journeys[0],
          body: [
            {
              type: "richText",
              nodes: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Lead sentence." }],
                },
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Following paragraph." }],
                },
              ],
            },
          ],
        }}
      />,
    )
    expect(screen.getByText("Lead sentence.")).toHaveClass("gi-text-lg")
    expect(screen.getByText("Following paragraph.")).toHaveClass("gi-text-md")
  })
})
