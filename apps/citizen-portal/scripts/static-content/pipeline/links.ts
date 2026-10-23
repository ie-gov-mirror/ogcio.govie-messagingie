import type { DiscoveryLocale } from "../../../src/lib/discovery/index.ts"
import { DISCOVERY_BASE_PATH } from "../config.ts"
import type { ContentTree, Localised } from "./validate.ts"

export type LinkTarget = {
  // Locale-relative; the renderer adds the locale prefix.
  path: string
  title: Record<DiscoveryLocale, string>
}

// Both locales share slugs, so a page's EN and GA IDs map to the same path.
export function buildLinkTargets(tree: ContentTree): Map<number, LinkTarget> {
  const targets = new Map<number, LinkTarget>()
  const add = (
    page: Localised<{ id: number; title: string }>,
    path: string,
  ) => {
    const target = {
      path,
      title: { en: page.en.title.trim(), ga: page.ga.title.trim() },
    }
    targets.set(page.en.id, target)
    targets.set(page.ga.id, target)
  }

  add(tree.list, DISCOVERY_BASE_PATH)
  for (const page of tree.lifeEvents) {
    add(page, `${DISCOVERY_BASE_PATH}/${page.en.meta.slug}`)
  }
  return targets
}

// An external link is an absolute https URL or an email address. Other
// schemes, such as http: or javascript:, fail the build.
export function isExternalHref(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === "https:") return url.hostname !== ""
    return (
      url.protocol === "mailto:" &&
      /^[^@\s]+@[^@\s]+$/.test(decodeURIComponent(url.pathname))
    )
  } catch {
    return false
  }
}

export const EXTERNAL_HREF_RULE =
  "isn't an absolute https URL or a mailto: email address"
