import {
  type ContentBlock,
  DISCOVERY_CONTENT_SCHEMA_VERSION,
  type DiscoveryContent,
  type DiscoveryLocale,
  discoveryLocaleSchema,
  type Journey,
  type LifeEvent,
} from "../../../src/lib/discovery/index.ts"
import { SOURCE_LOCALE } from "../config.ts"
import type { Block, JourneyPage, LifeEventPage } from "../wagtail/index.ts"
import { describePage, type IssueCollector } from "./issues.ts"
import { isHttpsUrl } from "./links.ts"
import { parseRichText } from "./rich-text.ts"
import type { ContentTree, Localised } from "./validate.ts"

type MapContext = {
  locale: DiscoveryLocale
  linkTargets: ReadonlyMap<number, string>
  issues: IssueCollector
}

export function mapContent(
  tree: ContentTree,
  linkTargets: ReadonlyMap<number, string>,
  issues: IssueCollector,
): Record<DiscoveryLocale, DiscoveryContent> {
  const entries = discoveryLocaleSchema.options.map((locale) => [
    locale,
    mapLocale(tree, { locale, linkTargets, issues }),
  ])
  return Object.fromEntries(entries) as Record<
    DiscoveryLocale,
    DiscoveryContent
  >
}

function mapLocale(tree: ContentTree, context: MapContext): DiscoveryContent {
  const { locale } = context
  const list = tree.list[locale]
  const lifeEventsById = new Map(
    tree.lifeEvents.map((entry) => [entry.page.en.id, entry]),
  )
  const titleByKey = new Map(list.categories.map((c) => [c.key, c.title]))

  const categories = tree.list[SOURCE_LOCALE].categories.map((category) => ({
    key: category.key,
    title: titleByKey.get(category.key) ?? category.title,
    icon: category.icon,
    lifeEventIds: category.life_events,
  }))

  const lifeEvents = categories.flatMap(({ lifeEventIds }) =>
    lifeEventIds.flatMap((id) => {
      const entry = lifeEventsById.get(id)
      return entry ? [mapLifeEvent(entry, context)] : []
    }),
  )

  return {
    schemaVersion: DISCOVERY_CONTENT_SCHEMA_VERSION,
    locale,
    title: list.title,
    body: mapBlocks(list.body, describePage(list), context),
    categories: categories.map(({ lifeEventIds, ...category }) => ({
      ...category,
      lifeEventSlugs: lifeEventIds.flatMap((id) => {
        const entry = lifeEventsById.get(id)
        return entry ? [entry.page.en.meta.slug] : []
      }),
    })),
    lifeEvents,
  }
}

function mapLifeEvent(
  entry: ContentTree["lifeEvents"][number],
  context: MapContext,
): LifeEvent {
  return {
    ...mapPage(entry.page, context),
    journeys: entry.journeys.map((journey) => mapPage(journey, context)),
  }
}

function mapPage(
  pages: Localised<LifeEventPage | JourneyPage>,
  context: MapContext,
): Journey {
  const page = pages[context.locale]
  const summary = page.summary?.trim()
  return {
    id: pages.en.id,
    slug: pages.en.meta.slug,
    title: page.title.trim(),
    ...(summary ? { summary } : {}),
    highlighted: pages.en.highlighted ?? false,
    body: mapBlocks(page.body, describePage(page), context),
  }
}

function mapBlocks(
  blocks: readonly Block[],
  document: string,
  context: MapContext,
): ContentBlock[] {
  return blocks.map((block, i): ContentBlock => {
    const path = `body[${i}].value`
    if (block.type === "heading") {
      return { type: "heading", text: block.value.trim() }
    }
    if (block.type === "paragraph") {
      return {
        type: "richText",
        nodes: parseRichText(block.value, {
          document,
          path,
          linkTargets: context.linkTargets,
          issues: context.issues,
        }),
      }
    }
    return {
      type: "buttonLinks",
      links: block.value.map((item, j) => {
        const href = item.value.link_url
        if (!isHttpsUrl(href)) {
          context.issues.error({
            document,
            path: `${path}[${j}].value.link_url`,
            rule: "external-link-https",
            message: `"${href}" isn't an absolute https URL`,
          })
        }
        return { text: item.value.link_text.trim(), href, internal: false }
      }),
    }
  })
}
