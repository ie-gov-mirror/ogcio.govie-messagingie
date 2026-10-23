// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { discoveryContentSchema, type RichTextNode } from "@/lib/discovery"
import {
  MOCK_FIXTURES_DIR,
  MOCK_INDEX_PAGE_ID,
} from "../../scripts/static-content/config.ts"
import {
  type BuildResult,
  buildDiscoveryContent,
} from "../../scripts/static-content/pipeline/index.ts"
import {
  ContentFetchError,
  createInMemoryTransport,
  type FixturePage,
  loadFixtures,
  type Transport,
} from "../../scripts/static-content/wagtail/index.ts"

type Fixtures = { pages: FixturePage[] }
type Link = { type: string; value: Record<string, unknown>; id: string }
type Category = {
  type: string
  value: { title: string; icon: string; life_events: Array<{ id: number }> }
  id: string
}
type Page = FixturePage & {
  body: Array<{ type: string; value: unknown; id: string }>
  categories: Category[]
  services: Array<{
    type: string
    value: { link: Link[]; description?: string }
    id: string
  }>
  guidance: Link[]
}

const LIST = 1000
const GA_LIST = 2000
const LIFE_EVENT = 1104
const GA_LIFE_EVENT = 2104
const PUBLICATION = 3001

const SCHOOL_PLACE_JOURNEY_URL =
  "https://journey.uat.services.gov.ie/journey/d48b8b19-7c36-4f90-b9a0-94daaf9e73a4"

async function fixtures(): Promise<Fixtures> {
  return { pages: structuredClone(await loadFixtures(MOCK_FIXTURES_DIR)) }
}

async function build(
  mutate: (fixtures: Fixtures) => void = () => {},
  wrap: (transport: Transport) => Transport = (transport) => transport,
) {
  const loaded = await fixtures()
  mutate(loaded)
  return buildDiscoveryContent({
    transport: wrap(createInMemoryTransport(loaded.pages)),
    indexPageId: MOCK_INDEX_PAGE_ID,
  })
}

function page({ pages }: Fixtures, id: number) {
  const found = pages.find((p) => p.id === id)
  if (!found) throw new Error(`no fixture page ${id}`)
  return found as Page
}

function remove(fixtures: Fixtures, id: number) {
  fixtures.pages = fixtures.pages.filter((p) => p.id !== id)
}

function schoolStart(content: BuildResult["content"], locale: "en" | "ga") {
  const lifeEvent = content?.[locale].lifeEvents.find(
    (le) => le.id === LIFE_EVENT,
  )
  if (!lifeEvent) throw new Error(`no child-starting-school in ${locale}`)
  return lifeEvent
}

function links(nodes: RichTextNode[]): RichTextNode[] {
  return nodes.flatMap((node) => [
    ...(node.type === "link" ? [node] : []),
    ...("children" in node ? links(node.children) : []),
  ])
}

describe("buildDiscoveryContent on the mock fixtures", () => {
  it("builds valid EN and GA content, warning about life events with no services", async () => {
    const { content, issues } = await build()

    expect(issues.errors).toEqual([])
    const noServices = issues.warnings.filter(
      (w) => w.rule === "life-event-no-services",
    )
    expect(noServices).toHaveLength(20)
    expect(noServices[0].document).toBe(
      'en:1101 LifeEventPage "birth-of-a-child"',
    )
    // The appeal service links with no text, in EN and GA.
    expect(issues.warnings.map((w) => w.rule).sort()).toEqual([
      ...Array(20).fill("life-event-no-services"),
      "link-text-missing",
      "link-text-missing",
    ])
    for (const locale of ["en", "ga"] as const) {
      const localised = discoveryContentSchema.parse(content?.[locale])
      expect(localised.locale).toBe(locale)
      expect(localised.categories.map((c) => c.key)).toEqual([
        "category-family",
        "category-education",
        "category-transport",
        "category-housing",
        "category-work",
        "category-relationships",
        "category-health",
        "category-later-life",
        "category-bereavement",
      ])
      expect(localised.lifeEvents).toHaveLength(21)
      expect(schoolStart(content, locale).services).toHaveLength(5)
      expect(schoolStart(content, locale).guidance).toHaveLength(2)
    }
  })

  it("takes structure and slugs from EN, and text from GA", async () => {
    const { content } = await build((fixtures) => {
      page(fixtures, GA_LIST).categories[1].value.title = "Oideachas"
      page(fixtures, GA_LIFE_EVENT).title = "Leanbh ag tosú ar scoil"
      page(fixtures, GA_LIFE_EVENT).meta.slug = "leanbh-ag-tosu-ar-scoil"
    })

    expect(content?.en.categories[1]).toEqual({
      key: "category-education",
      title: "Education & Learning",
      icon: "school",
      lifeEventSlugs: [
        "child-starting-school",
        "transition-from-secondary-to-tertiary-education",
      ],
    })
    expect(content?.ga.categories[1].title).toBe("Oideachas")
    expect(schoolStart(content, "ga")).toMatchObject({
      id: LIFE_EVENT,
      slug: "child-starting-school",
      title: "Leanbh ag tosú ar scoil",
      highlighted: true,
    })
    expect(schoolStart(content, "en").title).toBe("Child starting school")
  })

  it("maps services and guidance to links, in the app or out of it", async () => {
    const { content } = await build((fixtures) => {
      page(fixtures, GA_LIFE_EVENT).title = "Leanbh ag tosú ar scoil"
      page(fixtures, 2105).title = "Aistriú go dtí an tríú leibhéal"
    })

    const { services, guidance } = schoolStart(content, "ga")
    expect(services[0]).toEqual({
      link: {
        text: "Apply for a school place",
        href: SCHOOL_PLACE_JOURNEY_URL,
        internal: false,
      },
      description:
        "Apply for a primary school place in one of the five pilot regions. Takes 20 to 25 minutes and cannot be saved part-way.",
    })
    // No link text: a discovery page's title in the locale, otherwise the URL.
    expect(services[4].link).toEqual({
      text: "https://www.gov.ie/en/publication/appeal-a-refusal-of-admission/",
      href: "https://www.gov.ie/en/publication/appeal-a-refusal-of-admission/",
      internal: false,
    })
    expect(guidance[1]).toEqual({
      text: "Aistriú go dtí an tríú leibhéal",
      href: "/discovery/transition-from-secondary-to-tertiary-education",
      internal: true,
    })
  })

  it("shows the URL of a guidance link with no text, with a warning", async () => {
    const get = vi.fn()
    const { content, issues } = await build(
      (fixtures) => {
        page(fixtures, LIFE_EVENT).guidance[0].value.link_text = " "
      },
      (transport) => {
        get.mockImplementation(transport.get)
        return { get }
      },
    )

    const url = "https://www.gov.ie/en/publication/choosing-a-primary-school/"
    expect(schoolStart(content, "en").guidance[0]).toEqual({
      text: url,
      href: url,
      internal: false,
    })
    expect(issues.warnings).toContainEqual({
      document: 'en:1104 LifeEventPage "child-starting-school"',
      path: "guidance[0].value.link_text",
      rule: "link-text-missing",
      message: `has no link text, so it shows its URL (${url})`,
    })
    // An empty service page is fetched and left as an outbound link.
    expect(get.mock.calls.map((call) => call[0])).toContain(
      `/v2/pages/${PUBLICATION}/`,
    )
  })

  it("hosts a service whose link is a page with a body", async () => {
    const { content, issues } = await build((fixtures) => {
      fixtures.pages.push({
        id: 1201,
        title: "Apply for a school place",
        meta: {
          type: "publication.PublicationPage",
          locale: "en",
          slug: "apply-for-a-school-place",
          alias_of: null,
          parent: null,
        },
        body: [
          {
            type: "paragraph",
            value: "<p>Use this service to apply.</p>",
            id: "p1",
          },
          {
            type: "button_link",
            value: [
              {
                type: "external_link",
                value: {
                  link_url: SCHOOL_PLACE_JOURNEY_URL,
                  link_text: "Start application",
                },
                id: "b1",
              },
            ],
            id: "btn",
          },
        ],
      })
      for (const id of [LIFE_EVENT, GA_LIFE_EVENT]) {
        page(fixtures, id).services[0].value.link = [
          {
            type: "internal_link",
            value: {
              page: 1201,
              link_text: "",
              url: "https://www.gov.ie/en/publication/apply-for-a-school-place/",
            },
            id: "svc",
          },
        ]
      }
    })

    expect(issues.errors).toEqual([])
    expect(issues.warnings).toContainEqual(
      expect.objectContaining({ rule: "service-untranslated" }),
    )
    for (const locale of ["en", "ga"] as const) {
      expect(schoolStart(content, locale).services[0]).toMatchObject({
        link: {
          text: "Apply for a school place",
          href: "/discovery/child-starting-school/apply-for-a-school-place",
          internal: true,
        },
        detail: {
          slug: "apply-for-a-school-place",
          title: "Apply for a school place",
          body: [
            expect.objectContaining({ type: "richText" }),
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
        },
      })
    }
    expect(schoolStart(content, "en").services[4].link.internal).toBe(false)
  })

  it("accepts email links in services, guidance and buttons", async () => {
    const email = "mailto:schools@education.gov.ie"
    const { content, issues } = await build((fixtures) => {
      page(fixtures, LIFE_EVENT).guidance[0].value.link_url = email
    })
    expect(issues.errors).toEqual([])
    expect(schoolStart(content, "en").guidance[0]).toEqual({
      text: "Choosing a primary school",
      href: email,
      internal: false,
    })
  })

  it("drops empty service descriptions", async () => {
    const { content } = await build((fixtures) => {
      page(fixtures, LIFE_EVENT).services[0].value.description = " "
    })
    expect(schoolStart(content, "en").services[0]).not.toHaveProperty(
      "description",
    )
  })

  it("keeps rich-text links to discovery pages in the app, in both locales", async () => {
    const { content } = await build()

    for (const locale of ["en", "ga"] as const) {
      const found = schoolStart(content, locale).body.flatMap((block) =>
        block.type === "richText" ? links(block.nodes) : [],
      )
      expect(found).toEqual([
        expect.objectContaining({
          href: "/discovery/transition-from-secondary-to-tertiary-education",
          internal: true,
        }),
      ])
    }
  })

  it("builds an untranslated GA alias from its EN content, with a warning", async () => {
    const { content, issues } = await build((fixtures) => {
      page(fixtures, GA_LIFE_EVENT).meta.alias_of = { id: LIFE_EVENT }
    })

    expect(issues.errors).toEqual([])
    expect(issues.warnings).toContainEqual({
      document: 'en:1104 LifeEventPage "child-starting-school"',
      path: "",
      rule: "translation-alias",
      message:
        "isn't translated yet: its ga page 2104 is an alias, so it shows the en content",
    })
    expect(schoolStart(content, "ga").title).toBe("Child starting school")
  })
})

describe("buildDiscoveryContent failures", () => {
  it.each<[string, string, (fixtures: Fixtures) => void]>([
    [
      "a missing GA page",
      "missing-translation",
      (fixtures) => remove(fixtures, GA_LIFE_EVENT),
    ],
    [
      "a GA alias of a different page",
      "translation-alias",
      (fixtures) => {
        page(fixtures, GA_LIFE_EVENT).meta.alias_of = { id: 1105 }
      },
    ],
    [
      "an EN page that is an alias",
      "alias",
      (fixtures) => {
        page(fixtures, LIFE_EVENT).meta.alias_of = { id: 1 }
      },
    ],
    [
      "an invalid GA field",
      "schema",
      (fixtures) => {
        page(fixtures, GA_LIFE_EVENT).title = ""
      },
    ],
    [
      "a service with two links",
      "schema",
      (fixtures) => {
        const { link } = page(fixtures, LIFE_EVENT).services[0].value
        link.push(link[0])
      },
    ],
    [
      "an unknown block type",
      "unknown-block-type",
      (fixtures) => {
        page(fixtures, LIFE_EVENT).body.push({
          type: "image",
          value: 1,
          id: "x",
        })
      },
    ],
    [
      "a wrong page type",
      "page-type",
      (fixtures) => {
        page(fixtures, LIST).meta.type = "publication.PublicationPage"
      },
    ],
    [
      "a life event in two categories",
      "life-event-category-count",
      (fixtures) => {
        page(fixtures, LIST).categories.push({
          type: "category",
          value: {
            title: "Benefits",
            icon: "home",
            life_events: [{ id: LIFE_EVENT }],
          },
          id: "category-benefits",
        })
      },
    ],
    [
      "a life event in no category",
      "life-event-category-count",
      (fixtures) => {
        page(fixtures, LIST).categories[1].value.life_events = []
      },
    ],
    [
      "a category referencing an unknown page",
      "category-unknown-life-event",
      (fixtures) =>
        page(fixtures, LIST).categories[0].value.life_events.push({
          id: 424242,
        }),
    ],
    [
      "a duplicate category ID",
      "category-key-unique",
      (fixtures) => {
        page(fixtures, LIST).categories.push({
          type: "category",
          value: { title: "Homes", icon: "home", life_events: [] },
          id: "category-housing",
        })
      },
    ],
    [
      "a GA category that doesn't match EN",
      "category-translation",
      (fixtures) => {
        page(fixtures, GA_LIST).categories[0].id = "category-homes"
      },
    ],
    [
      "a malformed slug",
      "slug-format",
      (fixtures) => {
        page(fixtures, LIFE_EVENT).meta.slug = "Child_Starting_School"
      },
    ],
    [
      "a duplicate life-event slug",
      "slug-unique",
      (fixtures) => {
        const copy = {
          ...structuredClone(page(fixtures, LIFE_EVENT)),
          id: 1199,
        }
        const gaCopy = {
          ...structuredClone(page(fixtures, GA_LIFE_EVENT)),
          id: 2199,
          _translation_of: 1199,
        }
        fixtures.pages.push(copy, gaCopy)
        page(fixtures, LIST).categories[1].value.life_events.push({ id: 1199 })
      },
    ],
    [
      "an http service link",
      "external-link-https",
      (fixtures) => {
        page(fixtures, GA_LIFE_EVENT).services[0].value.link[0].value.link_url =
          "http://forms.uat.services.gov.ie/ga/x"
      },
    ],
  ])("fails on %s", async (_, rule, mutate) => {
    const { content, issues } = await build(mutate)
    expect(content).toBeUndefined()
    expect(issues.errors.map((e) => e.rule)).toContain(rule)
  })

  it("names the document and the JSON path of each error", async () => {
    const { issues } = await build((fixtures) => {
      page(fixtures, GA_LIFE_EVENT).services[0].value.link[0].value.link_url =
        "http://example.ie"
    })
    expect(issues.errors).toEqual([
      {
        document: 'ga:2104 LifeEventPage "child-starting-school"',
        path: "services[0].value.link[0].value.link_url",
        rule: "external-link-https",
        message:
          '"http://example.ie" isn\'t an absolute https URL or a mailto: email address',
      },
    ])
  })

  it("reports every page error in one run", async () => {
    const { issues } = await build((fixtures) => {
      remove(fixtures, GA_LIFE_EVENT)
      page(fixtures, GA_LIST).title = ""
    })
    expect(issues.errors.map((e) => [e.document, e.rule])).toEqual([
      ['en:1104 LifeEventPage "child-starting-school"', "missing-translation"],
      ['ga:2000 LifeEventsLandingPage "life-events"', "schema"],
    ])
  })

  it("throws when the list page can't be fetched", async () => {
    await expect(
      buildDiscoveryContent({
        transport: createInMemoryTransport(
          await loadFixtures(MOCK_FIXTURES_DIR),
        ),
        indexPageId: 999999,
      }),
    ).rejects.toThrow(ContentFetchError)
  })
})
