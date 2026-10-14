import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type DiscoveryContent,
  discoveryContentSchema,
  discoveryLocaleSchema,
  type LifeEvent,
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

export function getLifeEvent(
  discovery: DiscoveryContent,
  slug: string,
): LifeEvent {
  const lifeEvent = discovery.lifeEvents.find((le) => le.slug === slug)
  if (!lifeEvent) throw new Error(`Unknown life event "${slug}"`)
  return lifeEvent
}
