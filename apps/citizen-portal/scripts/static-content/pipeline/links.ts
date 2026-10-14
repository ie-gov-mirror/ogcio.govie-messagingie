import { DISCOVERY_BASE_PATH } from "../config.ts"
import type { ContentTree, Localised } from "./validate.ts"

// Both locales share slugs, so a page's EN and GA IDs map to the same
// locale-relative path; the renderer adds the locale prefix.
export function buildLinkTargets(tree: ContentTree): Map<number, string> {
  const targets = new Map<number, string>()
  const add = (page: Localised<{ id: number }>, path: string) => {
    targets.set(page.en.id, path)
    targets.set(page.ga.id, path)
  }

  add(tree.list, DISCOVERY_BASE_PATH)
  for (const { page, journeys } of tree.lifeEvents) {
    const lifeEventPath = `${DISCOVERY_BASE_PATH}/${page.en.meta.slug}`
    add(page, lifeEventPath)
    for (const journey of journeys) {
      add(journey, `${lifeEventPath}/${journey.en.meta.slug}`)
    }
  }
  return targets
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname !== ""
  } catch {
    return false
  }
}
