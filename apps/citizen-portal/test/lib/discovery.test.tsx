import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { ContentBlocks } from "@/components/discovery/content-blocks"
import {
  LifeEventsIndexView,
  LifeEventView,
  ServiceView,
} from "@/components/discovery/discovery-views"
import styles from "@/components/discovery/discovery-views.module.css"
import { LoadMaterialSymbols } from "@/components/load-material-symbols"
import pageTitleStyles from "@/components/page-title.module.css"
import type { ContentBlock } from "@/lib/discovery"
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
  it("opens email links in the mail app, not a new tab", () => {
    renderIn(
      "en",
      <ContentBlocks
        blocks={[
          {
            type: "richText",
            nodes: [
              {
                type: "paragraph",
                children: [
                  {
                    type: "link",
                    href: "mailto:jobseekersforms@welfare.ie",
                    internal: false,
                    children: [
                      { type: "text", value: "jobseekersforms@welfare.ie" },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "buttonLinks",
            links: [
              {
                text: "Email us",
                href: "mailto:jobseekersforms@welfare.ie",
                internal: false,
              },
            ],
          },
        ]}
      />,
    )
    for (const name of ["jobseekersforms@welfare.ie", "Email us"]) {
      const link = screen.getByRole("link", { name })
      expect(link).toHaveAttribute("href", "mailto:jobseekersforms@welfare.ie")
      expect(link).not.toHaveAttribute("target", "_blank")
    }
  })

  it("renders headings, lists and CTAs", () => {
    const blocks: ContentBlock[] = [
      {
        type: "richText",
        nodes: [
          {
            type: "paragraph",
            children: [{ type: "text", value: "Before you start" }],
          },
          {
            type: "list",
            ordered: false,
            children: [
              { type: "listItem", children: [{ type: "text", value: "PPSN" }] },
              {
                type: "listItem",
                children: [{ type: "text", value: "Birth certificate" }],
              },
            ],
          },
        ],
      },
      {
        type: "buttonLinks",
        links: [
          {
            text: "Start application",
            href: SCHOOL_PLACE_JOURNEY_URL,
            internal: false,
          },
        ],
      },
      { type: "heading", text: "How long it takes" },
      {
        type: "richText",
        nodes: [
          {
            type: "heading",
            level: 3,
            children: [{ type: "text", value: "Sort out work leave" }],
          },
        ],
      },
    ]

    renderIn("en", <ContentBlocks blocks={blocks} />)

    const article = screen
      .getByRole("heading", { level: 2, name: "How long it takes" })
      .closest("article")
    expect(article).toHaveClass("gi-prose")
    expect(
      screen.getByRole("heading", { level: 2, name: "How long it takes" }),
    ).not.toHaveAttribute("class")
    expect(
      screen.getByRole("heading", { level: 3, name: "Sort out work leave" }),
    ).not.toHaveAttribute("class")
    expect(
      screen.getByText("Before you start").closest("p"),
    ).not.toHaveAttribute("class")
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    const start = screen.getByRole("link", { name: "Start application" })
    expect(start).toHaveAttribute("href", SCHOOL_PLACE_JOURNEY_URL)
    expect(start).toHaveAttribute("target", "_blank")
  })

  it.each(["en", "ga"] as const)(
    "prefixes internal links with the current locale (%s)",
    (locale) => {
      const school = getLifeEvent(
        getDiscovery(locale, outDir),
        "child-starting-school",
      )

      renderIn(locale, <ContentBlocks blocks={school.body} />)

      expect(
        screen.getByRole("link", {
          name: "Transition from Secondary to Tertiary Education",
        }),
      ).toHaveAttribute(
        "href",
        `/${locale}/discovery/transition-from-secondary-to-tertiary-education`,
      )
    },
  )
})

describe("discovery views", () => {
  it("loads the CMS category icons and falls back for an unknown name", () => {
    const { container } = render(<LoadMaterialSymbols />)
    const stylesheet = container.querySelector('link[rel="stylesheet"]')
    for (const icon of [
      "elderly",
      "family_restroom",
      "medical_services",
      "volunteer_activism",
    ]) {
      expect(stylesheet).toHaveAttribute("href", expect.stringContaining(icon))
    }
    cleanup()

    const discovery = getDiscovery("en", outDir)
    discovery.categories[0].icon = "not_a_material_symbol"
    renderIn("en", <LifeEventsIndexView discovery={discovery} />)

    expect(screen.queryByText("not_a_material_symbol")).not.toBeInTheDocument()
    expect(screen.getByTestId("info")).toHaveClass(styles.categoryIcon)
  })

  it("renders the index and life event pages", () => {
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
    cleanup()

    renderIn(
      "en",
      <LifeEventView lifeEvent={school} categoryTitle='Education & Learning' />,
    )
    expect(screen.getByText("5 services in this life event")).toHaveClass(
      "gi-text-md",
      "gi-text-color-text-system-neutral-muted",
    )
    const back = screen.getByRole("link", { name: "Back" })
    expect(back).toHaveAttribute("href", "/en/discovery")
    expect(back).not.toHaveClass("gi-link-no-visited")
    cleanup()

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
    expect(
      screen.queryByRole("heading", { name: "Guidance" }),
    ).not.toBeInTheDocument()
  })

  it("opens services and guidance on their own site, unless they're discovery pages", () => {
    const school = getLifeEvent(
      getDiscovery("en", outDir),
      "child-starting-school",
    )

    renderIn(
      "en",
      <LifeEventView lifeEvent={school} categoryTitle='Education & Learning' />,
    )
    const apply = screen.getByRole("link", { name: "Apply for a school place" })
    expect(apply).toHaveAttribute("href", SCHOOL_PLACE_JOURNEY_URL)
    expect(apply).toHaveAttribute("target", "_blank")
    expect(apply.closest("li")).toHaveTextContent(
      "Apply for a primary school place in one of the five pilot regions.",
    )
    expect(
      screen.getByRole("link", {
        name: "https://www.gov.ie/en/publication/appeal-a-refusal-of-admission/",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.gov.ie/en/publication/appeal-a-refusal-of-admission/",
    )

    const guidance = screen.getByRole("heading", { level: 2, name: "Guidance" })
    const section = guidance.closest("section")
    expect(section).toHaveClass("gi-w-full")
    const choosing = screen.getByRole("link", {
      name: "Choosing a primary school",
    })
    expect(choosing).toHaveAttribute("target", "_blank")
    expect(section).toContainElement(choosing)
    const transition = screen.getAllByRole("link", {
      name: "Transition from Secondary to Tertiary Education",
    })
    const inGuidance = transition.find((link) => section?.contains(link))
    expect(inGuidance).toHaveAttribute(
      "href",
      "/en/discovery/transition-from-secondary-to-tertiary-education",
    )
    expect(inGuidance).not.toHaveAttribute("target", "_blank")
  })

  it("renders a service page and links back to its life event", () => {
    renderIn(
      "en",
      <ServiceView
        lifeEvent={{
          slug: "child-starting-school",
          title: "Child starting school",
        }}
        service={{
          slug: "apply-for-a-school-place",
          title: "Apply for a school place",
          body: [
            {
              type: "richText",
              nodes: [
                {
                  type: "paragraph",
                  children: [
                    { type: "text", value: "Use this service to apply." },
                  ],
                },
              ],
            },
            {
              type: "buttonLinks",
              links: [
                {
                  text: "Start application",
                  href: SCHOOL_PLACE_JOURNEY_URL,
                  internal: false,
                },
              ],
            },
          ],
        }}
      />,
    )

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Apply for a school place",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("Child starting school")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/en/discovery/child-starting-school",
    )
    const start = screen.getByRole("link", { name: "Start application" })
    expect(start).toHaveAttribute("href", SCHOOL_PLACE_JOURNEY_URL)
    expect(start).toHaveAttribute("target", "_blank")
  })

  it("lists life events by title, without a synthesised description", () => {
    const discovery = getDiscovery("en", outDir)
    renderIn("en", <LifeEventsIndexView discovery={discovery} />)

    const school = screen.getByRole("link", { name: "Child starting school" })
    expect(school.closest("li")?.querySelector("p")).toBeNull()
    expect(school.closest("li")).not.toHaveTextContent(
      "Enrolling a child in primary school",
    )
    expect(
      screen.getByRole("link", { name: "Birth of a Child" }).closest("li"),
    ).not.toHaveTextContent("Registering a birth")
  })

  it("uses the life-events type scale, muted eyebrow, and card divider", () => {
    const discovery = getDiscovery("en", outDir)
    const school = getLifeEvent(discovery, "child-starting-school")

    renderIn("en", <LifeEventsIndexView discovery={discovery} />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      pageTitleStyles.pageTitle,
    )
    const intro = screen.getByText(/Choose the moment you are dealing with/)
    expect(intro.closest("p")).not.toHaveAttribute("class")
    expect(intro.closest("article")).toHaveClass("gi-prose")
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
    const lead = screen.getByText(/Enrolling a child in primary school/)
    expect(lead.closest("p")).not.toHaveAttribute("class")
    expect(lead.closest("article")).toHaveClass("gi-prose")
    for (const name of ["Services", "Guidance"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toHaveClass(
        "gi-text-lg",
        "xl:gi-text-xl",
      )
    }
    const apply = screen.getByRole("link", { name: "Apply for a school place" })
    expect(apply).toHaveClass("gi-font-bold", "gi-text-md")
    expect(apply.closest("li")).toHaveClass(
      "gi-border-b",
      "gi-border-color-border-system-neutral-muted",
    )
    for (const el of [apply.closest("ul"), apply.closest("section")]) {
      expect(el).toHaveClass("gi-w-full")
    }
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
      <LifeEventView
        lifeEvent={{
          ...school,
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
        categoryTitle='Education & Learning'
      />,
    )
    expect(screen.getByText("Lead sentence.").closest("p")).not.toHaveAttribute(
      "class",
    )
    expect(
      screen.getByText("Following paragraph.").closest("p"),
    ).not.toHaveAttribute("class")
    expect(screen.getByText("Lead sentence.").closest("article")).toHaveClass(
      "gi-prose",
    )
  })
})
