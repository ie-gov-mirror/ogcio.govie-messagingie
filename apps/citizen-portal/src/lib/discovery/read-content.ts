import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type DiscoveryContent,
  discoveryContentSchema,
  discoveryLocaleSchema,
  type LifeEvent,
  type Service,
  type ServiceDetail,
  STATIC_CONTENT_FILES,
} from "./content-model.ts"

// Build-time only: reads what `pnpm fetch:static-content` wrote. Parsing
// with the schema turns stale or foreign output into a clear build error.
export function getDiscovery(
  locale: string,
  dir = join(process.cwd(), ".static-content"),
): DiscoveryContent {
  const file = STATIC_CONTENT_FILES.discovery(
    discoveryLocaleSchema.parse(locale),
  )
  return discoveryContentSchema.parse(
    JSON.parse(readFileSync(join(dir, file), "utf8")),
  )
}

export interface DashboardLifeEvent {
  slug: string
  title: string
  category: string
  icon: string
}

// The design shows four cards but no selection rule. Highlighted
// first, then one per category in CMS order. Replace when content decides.
export function getDashboardLifeEvents(
  discovery: DiscoveryContent,
  limit = 4,
): DashboardLifeEvent[] {
  const bySlug = new Map(discovery.lifeEvents.map((le) => [le.slug, le]))
  const categoryOf = (slug: string) =>
    discovery.categories.find((c) => c.lifeEventSlugs.includes(slug))
  const slugs = [
    ...discovery.lifeEvents.filter((le) => le.highlighted).map((le) => le.slug),
    ...discovery.categories.flatMap((c) => c.lifeEventSlugs.slice(0, 1)),
  ]
  return [...new Set(slugs)]
    .flatMap((slug) => {
      const lifeEvent = bySlug.get(slug)
      const category = categoryOf(slug)
      if (!lifeEvent || !category) return []
      return [
        {
          slug,
          title: lifeEvent.title,
          category: category.title,
          icon: category.icon,
        },
      ]
    })
    .slice(0, limit)
}

export function getLifeEvent(
  discovery: DiscoveryContent,
  slug: string,
): LifeEvent {
  const lifeEvent = discovery.lifeEvents.find((le) => le.slug === slug)
  if (!lifeEvent) throw new Error(`Unknown life event "${slug}"`)
  return lifeEvent
}

export function getService(
  lifeEvent: LifeEvent,
  slug: string,
): Service & { detail: ServiceDetail } {
  const service = lifeEvent.services.find((item) => item.detail?.slug === slug)
  if (!service?.detail) {
    throw new Error(`Unknown service "${lifeEvent.slug}/${slug}"`)
  }
  return { ...service, detail: service.detail }
}
