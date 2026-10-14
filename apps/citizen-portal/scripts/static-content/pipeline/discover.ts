import {
  MAX_CONCURRENT_REQUESTS,
  PAGE_TYPES,
  SOURCE_LOCALE,
  TRANSLATION_LOCALE,
} from "../config.ts"
import type { PageRef, WagtailClient } from "../wagtail/index.ts"
import { mapWithConcurrency } from "./concurrency.ts"
import { describePage, type IssueCollector } from "./issues.ts"

export type RawTree = {
  list: PageRef
  lifeEvents: Array<{ page: PageRef; journeys: PageRef[] }>
}

export async function discoverTree(
  client: WagtailClient,
  indexPageId: number,
): Promise<RawTree> {
  const list = await client.getPage(indexPageId)
  // Translations share their EN page's ID, so a parent's children must be
  // filtered by locale too.
  const lifeEvents = await client.listChildren(
    list.id,
    PAGE_TYPES.lifeEvent,
    SOURCE_LOCALE,
  )
  const journeys = await mapWithConcurrency(
    lifeEvents,
    MAX_CONCURRENT_REQUESTS,
    (lifeEvent) =>
      client.listChildren(lifeEvent.id, PAGE_TYPES.journey, SOURCE_LOCALE),
  )
  return {
    list,
    lifeEvents: lifeEvents.map((page, i) => ({ page, journeys: journeys[i] })),
  }
}

export function allPages(tree: RawTree): PageRef[] {
  return [
    tree.list,
    ...tree.lifeEvents.flatMap(({ page, journeys }) => [page, ...journeys]),
  ]
}

export async function findTranslations(
  client: WagtailClient,
  pages: readonly PageRef[],
  issues: IssueCollector,
): Promise<Map<number, PageRef>> {
  const results = await mapWithConcurrency(
    pages,
    MAX_CONCURRENT_REQUESTS,
    (page) =>
      client.findTranslations(page.id, TRANSLATION_LOCALE, page.meta.type),
  )

  const translations = new Map<number, PageRef>()
  pages.forEach((page, i) => {
    const found = results[i]
    const document = describePage(page)
    if (found.length === 0) {
      issues.error({
        document,
        path: "",
        rule: "missing-translation",
        message: `has no ${TRANSLATION_LOCALE} page`,
      })
    } else if (found.length > 1) {
      issues.error({
        document,
        path: "",
        rule: "ambiguous-translation",
        message: `has ${found.length} ${TRANSLATION_LOCALE} pages (${found.map((p) => p.id).join(", ")})`,
      })
    } else if (found[0].meta.alias_of != null) {
      issues.error({
        document,
        path: "",
        rule: "missing-translation",
        message: `its ${TRANSLATION_LOCALE} page ${found[0].id} is an alias, not a translation`,
      })
    } else {
      translations.set(page.id, found[0])
    }
  })
  return translations
}
