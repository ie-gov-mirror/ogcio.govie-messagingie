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
  lifeEvents: PageRef[]
}

export async function discoverTree(
  client: WagtailClient,
  indexPageId: number,
): Promise<RawTree> {
  const list = await client.getPage(indexPageId)
  const lifeEvents = await client.listChildren(
    list.id,
    PAGE_TYPES.lifeEvent,
    SOURCE_LOCALE,
  )
  return { list, lifeEvents }
}

export function allPages(tree: RawTree): PageRef[] {
  return [tree.list, ...tree.lifeEvents]
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
      return
    }
    if (found.length > 1) {
      issues.error({
        document,
        path: "",
        rule: "ambiguous-translation",
        message: `has ${found.length} ${TRANSLATION_LOCALE} pages (${found.map((p) => p.id).join(", ")})`,
      })
      return
    }

    // Wagtail keeps an untranslated page as an alias of its source, so its
    // content is the EN copy until someone translates it.
    const translation = found[0]
    const aliasOf = translation.meta.alias_of?.id
    if (aliasOf !== undefined && aliasOf !== page.id) {
      issues.error({
        document,
        path: "",
        rule: "translation-alias",
        message: `its ${TRANSLATION_LOCALE} page ${translation.id} is an alias of page ${aliasOf}, not of this page`,
      })
      return
    }
    if (aliasOf !== undefined) {
      issues.warn({
        document,
        path: "",
        rule: "translation-alias",
        message: `isn't translated yet: its ${TRANSLATION_LOCALE} page ${translation.id} is an alias, so it shows the ${SOURCE_LOCALE} content`,
      })
    }
    translations.set(page.id, translation)
  })
  return translations
}
