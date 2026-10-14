// @vitest-environment node
import { describe, expect, it } from "vitest"
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
} from "../../scripts/static-content/wagtail/index.ts"

type Locale = "en" | "ga"
type Fixtures = { pages: FixturePage[] }
type Body = Array<{ type: string; value: unknown; id: string }>
type Category = {
  key: string
  title: string
  icon: string
  life_events: number[]
}

const LIST = 1000
const LIFE_EVENT = 1104
const JOURNEY = 1201
const APPEAL_JOURNEY = 1205

async function build(mutate: (fixtures: Fixtures) => void = () => {}) {
  const fixtures: Fixtures = {
    pages: structuredClone(await loadFixtures(MOCK_FIXTURES_DIR)),
  }
  mutate(fixtures)
  return buildDiscoveryContent({
    transport: createInMemoryTransport(fixtures.pages),
    indexPageId: MOCK_INDEX_PAGE_ID,
  })
}

function page({ pages }: Fixtures, id: number, locale: Locale = "en") {
  const found = pages.find((p) => p.id === id && p.meta.locale === locale)
  if (!found) throw new Error(`no fixture page ${locale}:${id}`)
  return found as FixturePage & { body: Body; categories: Category[] }
}

function remove(fixtures: Fixtures, id: number, locale: Locale) {
  fixtures.pages = fixtures.pages.filter(
    (p) => !(p.id === id && p.meta.locale === locale),
  )
}

function cta(fixtures: Fixtures, id: number, locale: Locale = "en") {
  const block = page(fixtures, id, locale).body.find(
    (b) => b.type === "button_link",
  )
  return block?.value as Array<{ value: { link_url: string } }>
}

function addCopy(fixtures: Fixtures, from: number, to: number) {
  for (const locale of ["en", "ga"] as const) {
    const copy = structuredClone(page(fixtures, from, locale))
    copy.id = to
    fixtures.pages.push(copy)
  }
}

function schoolStart(content: BuildResult["content"], locale: "en" | "ga") {
  const lifeEvent = content?.[locale].lifeEvents.find(
    (le) => le.id === LIFE_EVENT,
  )
  if (!lifeEvent) throw new Error(`no child-starting-school in ${locale}`)
  return lifeEvent
}

function journey(
  content: BuildResult["content"],
  locale: "en" | "ga",
  id: number,
) {
  const found = schoolStart(content, locale).journeys.find((j) => j.id === id)
  if (!found) throw new Error(`no journey ${id} in ${locale}`)
  return found
}

function links(nodes: RichTextNode[]): RichTextNode[] {
  return nodes.flatMap((node) => [
    ...(node.type === "link" ? [node] : []),
    ...("children" in node ? links(node.children) : []),
  ])
}

describe("buildDiscoveryContent on the mock fixtures", () => {
  it("builds valid EN and GA content, warning about empty life events", async () => {
    const { content, issues } = await build()

    expect(issues.errors).toEqual([])
    expect(issues.warnings).toHaveLength(20)
    expect(
      issues.warnings.every((w) => w.rule === "life-event-no-journeys"),
    ).toBe(true)
    expect(issues.warnings[0].document).toBe(
      'en:1101 LifeEventPage "birth-of-a-child"',
    )
    for (const locale of ["en", "ga"] as const) {
      const localised = discoveryContentSchema.parse(content?.[locale])
      expect(localised.locale).toBe(locale)
      expect(localised.categories.map((c) => c.key)).toEqual([
        "family",
        "education",
        "transport",
        "housing",
        "work",
        "relationships",
        "health",
        "later-life",
        "bereavement",
      ])
      expect(localised.lifeEvents).toHaveLength(21)
      expect(schoolStart(content, locale).journeys).toHaveLength(5)
      expect(localised.lifeEvents.flatMap((le) => le.journeys)).toHaveLength(5)
    }
  })

  it("takes structure and slugs from EN, and text from GA", async () => {
    const { content } = await build((fixtures) => {
      page(fixtures, LIST, "ga").categories[1].title = "Oideachas"
      page(fixtures, LIFE_EVENT, "ga").title = "Leanbh ag tosú ar scoil"
      page(fixtures, LIFE_EVENT, "ga").meta.slug = "leanbh-ag-tosu-ar-scoil"
    })

    expect(content?.en.categories[1]).toEqual({
      key: "education",
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

  it("drops empty summaries", async () => {
    const { content } = await build((fixtures) => {
      page(fixtures, JOURNEY).summary = ""
      page(fixtures, JOURNEY, "ga").summary = ""
    })
    expect(journey(content, "en", JOURNEY)).not.toHaveProperty("summary")
  })

  it("resolves internal links to app paths in both locales", async () => {
    const { content } = await build()

    for (const locale of ["en", "ga"] as const) {
      const found = journey(content, locale, APPEAL_JOURNEY).body.flatMap(
        (block) => (block.type === "richText" ? links(block.nodes) : []),
      )
      expect(found).toEqual([
        expect.objectContaining({
          href: "/discovery/child-starting-school/apply-for-a-school-place",
          internal: true,
        }),
      ])
    }
  })

  it("exposes CTAs as button links", async () => {
    const { content } = await build()
    expect(
      journey(content, "en", JOURNEY).body.find(
        (block) => block.type === "buttonLinks",
      ),
    ).toEqual({
      type: "buttonLinks",
      links: [
        {
          text: "Start application",
          href: "https://journey.uat.services.gov.ie/journey/d48b8b19-7c36-4f90-b9a0-94daaf9e73a4",
          internal: false,
        },
      ],
    })
  })

  it("keeps a life event with no journeys, with an empty list", async () => {
    const { content } = await build()
    expect(
      content?.en.lifeEvents.find((le) => le.slug === "birth-of-a-child")
        ?.journeys,
    ).toEqual([])
  })
})

describe("buildDiscoveryContent failures", () => {
  it.each<[string, string, (fixtures: Fixtures) => void]>([
    [
      "a missing GA page",
      "missing-translation",
      (fixtures) => remove(fixtures, JOURNEY, "ga"),
    ],
    [
      "a GA page that is an alias",
      "missing-translation",
      (fixtures) => {
        page(fixtures, JOURNEY, "ga").meta.alias_of = { id: JOURNEY }
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
        page(fixtures, LIFE_EVENT, "ga").title = ""
      },
    ],
    [
      "an unknown block type",
      "unknown-block-type",
      (fixtures) => {
        page(fixtures, JOURNEY).body.push({ type: "image", value: 1, id: "x" })
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
          key: "benefits",
          title: "Benefits",
          icon: "home",
          life_events: [LIFE_EVENT],
        })
      },
    ],
    [
      "a life event in no category",
      "life-event-category-count",
      (fixtures) => {
        page(fixtures, LIST).categories[1].life_events = []
      },
    ],
    [
      "a category referencing an unknown page",
      "category-unknown-life-event",
      (fixtures) => page(fixtures, LIST).categories[0].life_events.push(424242),
    ],
    [
      "a duplicate category key",
      "category-key-unique",
      (fixtures) => {
        page(fixtures, LIST).categories.push({
          key: "housing",
          title: "Homes",
          icon: "home",
          life_events: [],
        })
      },
    ],
    [
      "a GA category that doesn't match EN",
      "category-translation",
      (fixtures) => {
        page(fixtures, LIST, "ga").categories[0].key = "homes"
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
      "a duplicate journey slug in one life event",
      "slug-unique",
      (fixtures) => addCopy(fixtures, JOURNEY, 1299),
    ],
    [
      "a duplicate life-event slug",
      "slug-unique",
      (fixtures) => {
        addCopy(fixtures, LIFE_EVENT, 1199)
        page(fixtures, LIST).categories[1].life_events.push(1199)
        page(fixtures, LIST, "ga").categories[1].life_events.push(1199)
      },
    ],
    [
      "an http CTA",
      "external-link-https",
      (fixtures) => {
        cta(fixtures, JOURNEY, "ga")[0].value.link_url =
          "http://forms.uat.services.gov.ie/ga/x"
      },
    ],
    [
      "an internal link to an unknown page",
      "internal-link-unknown-page",
      (fixtures) => {
        page(fixtures, JOURNEY).body.push({
          type: "paragraph",
          value: '<p><a linktype="page" id="424242">x</a></p>',
          id: "x",
        })
      },
    ],
  ])("fails on %s", async (_, rule, mutate) => {
    const { content, issues } = await build(mutate)
    expect(content).toBeUndefined()
    expect(issues.errors.map((e) => e.rule)).toContain(rule)
  })

  it("names the document and the JSON path of each error", async () => {
    const { issues } = await build((fixtures) => {
      cta(fixtures, JOURNEY, "ga")[0].value.link_url = "http://example.ie"
    })
    expect(issues.errors).toEqual([
      {
        document: 'ga:1201 JourneyPage "apply-for-a-school-place"',
        path: "body[2].value[0].value.link_url",
        rule: "external-link-https",
        message: '"http://example.ie" isn\'t an absolute https URL',
      },
    ])
  })

  it("reports every page error in one run", async () => {
    const { issues } = await build((fixtures) => {
      remove(fixtures, JOURNEY, "ga")
      page(fixtures, LIST, "ga").title = ""
    })
    expect(issues.errors.map((e) => [e.document, e.rule])).toEqual([
      ['en:1201 JourneyPage "apply-for-a-school-place"', "missing-translation"],
      ['ga:1000 ListPage "life-events"', "schema"],
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
