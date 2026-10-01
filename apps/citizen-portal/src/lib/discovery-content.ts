import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The normalised discovery model written by `scripts/fetch-static-content.mjs`
 * (AB#43539). Pages read only this, never Wagtail's format. Build-time only:
 * the discovery routes are statically exported, so nothing here ships to the
 * browser.
 */
export type RichTextNode =
  | { text: string }
  | {
      tag: "p" | "ul" | "ol" | "li" | "b" | "i" | "strong" | "em" | "br"
      children: RichTextNode[]
    }
  | { tag: "a"; href: string; children: RichTextNode[] }

export type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; nodes: RichTextNode[] }
  | { type: "buttons"; links: { href: string; text: string }[] }

export interface Journey {
  slug: string
  title: string
  summary: string | null
  body: ContentBlock[]
}

export interface LifeEvent {
  slug: string
  title: string
  summary: string | null
  categoryKey: string
  body: ContentBlock[]
  journeys: Journey[]
}

export interface DiscoveryCategory {
  key: string
  title: string
  icon: string
  lifeEvents: string[]
}

export interface Discovery {
  locale: string
  title: string
  intro: ContentBlock[]
  categories: DiscoveryCategory[]
  lifeEvents: LifeEvent[]
}

export function getDiscovery(
  locale: string,
  dir = join(process.cwd(), ".static-content"),
): Discovery {
  return JSON.parse(
    readFileSync(join(dir, `discovery.${locale}.json`), "utf8"),
  ) as Discovery
}

export function getLifeEvent(discovery: Discovery, slug: string): LifeEvent {
  const lifeEvent = discovery.lifeEvents.find((le) => le.slug === slug)
  if (!lifeEvent) throw new Error(`Unknown life event "${slug}"`)
  return lifeEvent
}
