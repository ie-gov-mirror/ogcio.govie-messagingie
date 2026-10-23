import {
  type ContentBlock,
  type ContentLink,
  DISCOVERY_CONTENT_SCHEMA_VERSION,
  type DiscoveryContent,
  type DiscoveryLocale,
  discoveryLocaleSchema,
  type LifeEvent,
  type Service,
} from "../../../src/lib/discovery/index.ts"
import { DISCOVERY_BASE_PATH, SOURCE_LOCALE } from "../config.ts"
import type {
  Block,
  LifeEventPage,
  LinkBlock,
  ServiceBlock,
  ServicePage,
} from "../wagtail/index.ts"
import { describePage, type IssueCollector } from "./issues.ts"
import { EXTERNAL_HREF_RULE, isExternalHref, type LinkTarget } from "./links.ts"
import { parseRichText } from "./rich-text.ts"
import type { ContentTree, Localised } from "./validate.ts"

type MapContext = {
  locale: DiscoveryLocale
  linkTargets: ReadonlyMap<number, LinkTarget>
  servicePages: ReadonlyMap<number, Localised<ServicePage>>
  issues: IssueCollector
}

export function mapContent(
  tree: ContentTree,
  linkTargets: ReadonlyMap<number, LinkTarget>,
  servicePages: ReadonlyMap<number, Localised<ServicePage>>,
  issues: IssueCollector,
): Record<DiscoveryLocale, DiscoveryContent> {
  const entries = discoveryLocaleSchema.options.map((locale) => [
    locale,
    mapLocale(tree, { locale, linkTargets, servicePages, issues }),
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
    tree.lifeEvents.map((page) => [page.en.id, page]),
  )
  const titleByKey = new Map(list.categories.map((c) => [c.id, c.value.title]))

  const categories = tree.list[SOURCE_LOCALE].categories.map((category) => ({
    key: category.id,
    title: titleByKey.get(category.id) ?? category.value.title,
    icon: category.value.icon,
    lifeEventIds: category.value.life_events.map(({ id }) => id),
  }))

  const lifeEvents = categories.flatMap(({ lifeEventIds }) =>
    lifeEventIds.flatMap((id) => {
      const pages = lifeEventsById.get(id)
      return pages ? [mapLifeEvent(pages, context)] : []
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
        const pages = lifeEventsById.get(id)
        return pages ? [pages.en.meta.slug] : []
      }),
    })),
    lifeEvents,
  }
}

function mapLifeEvent(
  pages: Localised<LifeEventPage>,
  context: MapContext,
): LifeEvent {
  const page = pages[context.locale]
  const document = describePage(page)
  return {
    id: pages.en.id,
    slug: pages.en.meta.slug,
    title: page.title.trim(),
    highlighted: pages.en.highlighted ?? false,
    body: mapBlocks(page.body, document, context),
    services: page.services.map((service, i) =>
      mapService(
        service,
        pages.en.meta.slug,
        document,
        `services[${i}]`,
        context,
      ),
    ),
    guidance: page.guidance.map((link, i) =>
      mapLink(link, document, `guidance[${i}]`, context),
    ),
  }
}

function mapService(
  service: ServiceBlock,
  lifeEventSlug: string,
  document: string,
  path: string,
  context: MapContext,
): Service {
  const description = service.value.description?.trim()
  const link = service.value.link[0]
  const linked =
    link.type === "internal_link"
      ? context.servicePages.get(link.value.page)
      : undefined
  if (linked) {
    const page = linked[context.locale]
    const text = link.value.link_text.trim()
    return {
      link: {
        text: text || page.title.trim(),
        href: `${DISCOVERY_BASE_PATH}/${lifeEventSlug}/${linked.en.meta.slug}`,
        internal: true,
      },
      ...(description ? { description } : {}),
      detail: {
        slug: linked.en.meta.slug,
        title: page.title.trim(),
        body: mapBlocks(page.body, describePage(page), context),
      },
    }
  }
  return {
    link: mapLink(link, document, `${path}.value.link[0]`, context),
    ...(description ? { description } : {}),
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
      links: block.value.map((link, j) =>
        mapLink(link, document, `${path}[${j}]`, context),
      ),
    }
  })
}

// A link to a discovery page stays in the app; any other page or URL opens
// on its own site. A link with no text shows the discovery page's title or,
// for any other link, its URL. Errors are recorded and the build stops
// before the returned link is used.
function mapLink(
  link: LinkBlock,
  document: string,
  path: string,
  context: MapContext,
): ContentLink {
  const { issues } = context
  const text = link.value.link_text.trim()

  if (link.type === "internal_link") {
    const target = context.linkTargets.get(link.value.page)
    if (target) {
      return {
        text: text || target.title[context.locale],
        href: target.path,
        internal: true,
      }
    }
  }

  const [href, field] =
    link.type === "external_link"
      ? [link.value.link_url, "link_url"]
      : [link.value.url, "url"]
  if (!isExternalHref(href)) {
    issues.error({
      document,
      path: `${path}.value.${field}`,
      rule: "external-link-https",
      message: `"${href}" ${EXTERNAL_HREF_RULE}`,
    })
  }
  if (!text) {
    issues.warn({
      document,
      path: `${path}.value.link_text`,
      rule: "link-text-missing",
      message: `has no link text, so it shows its URL (${href})`,
    })
  }
  return { text: text || href, href, internal: false }
}
