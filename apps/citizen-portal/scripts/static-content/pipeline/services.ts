import {
  MAX_CONCURRENT_REQUESTS,
  SLUG_PATTERN,
  SOURCE_LOCALE,
  TRANSLATION_LOCALE,
} from "../config.ts"
import {
  type ServicePage,
  servicePageSchema,
  type WagtailClient,
} from "../wagtail/index.ts"
import { mapWithConcurrency } from "./concurrency.ts"
import { describePage, type IssueCollector, reportZodError } from "./issues.ts"
import type { ContentTree, Localised } from "./validate.ts"

// ponytail: a service page is the EN page id on the link. A GA-only
// publication id stays an outbound link until the EN page links to it too.
export async function loadServicePages(
  client: WagtailClient,
  tree: ContentTree,
  issues: IssueCollector,
): Promise<Map<number, Localised<ServicePage>>> {
  const known = new Set([
    tree.list.en.id,
    tree.list.ga.id,
    ...tree.lifeEvents.flatMap((page) => [page.en.id, page.ga.id]),
  ])
  const ids = [
    ...new Set(
      tree.lifeEvents.flatMap((page) =>
        [page.en, page.ga].flatMap((localised) =>
          localised.services.flatMap((service) => {
            const link = service.value.link[0]
            return link.type === "internal_link" && !known.has(link.value.page)
              ? [link.value.page]
              : []
          }),
        ),
      ),
    ),
  ]

  const fetched = await mapWithConcurrency(ids, MAX_CONCURRENT_REQUESTS, (id) =>
    client.getPage(id),
  )
  const pages = new Map<number, Localised<ServicePage>>()
  for (const raw of fetched) {
    const parsed = servicePageSchema.safeParse(raw)
    if (!parsed.success) {
      reportZodError(issues, describePage(raw), parsed.error)
      continue
    }
    const page = parsed.data
    if (page.meta.locale !== SOURCE_LOCALE || page.body.length === 0) continue
    pages.set(page.id, {
      en: page,
      ga: await translationOf(client, page, issues),
    })
  }
  checkServiceSlugs(tree, pages, issues)
  return pages
}

async function translationOf(
  client: WagtailClient,
  page: ServicePage,
  issues: IssueCollector,
): Promise<ServicePage> {
  const found = await client.findTranslations(
    page.id,
    TRANSLATION_LOCALE,
    page.meta.type,
  )
  const document = describePage(page)
  if (found.length === 0) {
    issues.warn({
      document,
      path: "",
      rule: "service-untranslated",
      message: `has no ${TRANSLATION_LOCALE} page, so it shows the ${SOURCE_LOCALE} content`,
    })
    return page
  }
  if (found.length > 1) {
    issues.error({
      document,
      path: "",
      rule: "ambiguous-translation",
      message: `has ${found.length} ${TRANSLATION_LOCALE} pages (${found.map((item) => item.id).join(", ")})`,
    })
    return page
  }

  const translation = found[0]
  const aliasOf = translation.meta.alias_of?.id
  if (aliasOf !== undefined && aliasOf !== page.id) {
    issues.error({
      document,
      path: "",
      rule: "translation-alias",
      message: `its ${TRANSLATION_LOCALE} page ${translation.id} is an alias of page ${aliasOf}, not of this page`,
    })
    return page
  }
  if (aliasOf !== undefined) {
    issues.warn({
      document,
      path: "",
      rule: "translation-alias",
      message: `isn't translated yet: its ${TRANSLATION_LOCALE} page ${translation.id} is an alias, so it shows the ${SOURCE_LOCALE} content`,
    })
  }
  const parsed = servicePageSchema.safeParse(translation)
  if (!parsed.success) {
    reportZodError(issues, describePage(translation), parsed.error)
    return page
  }
  if (parsed.data.meta.locale !== TRANSLATION_LOCALE) {
    issues.error({
      document: describePage(translation),
      path: "meta.locale",
      rule: "page-locale",
      message: `expected "${TRANSLATION_LOCALE}", got "${parsed.data.meta.locale}"`,
    })
    return page
  }
  return parsed.data
}

function checkServiceSlugs(
  tree: ContentTree,
  pages: ReadonlyMap<number, Localised<ServicePage>>,
  issues: IssueCollector,
): void {
  for (const lifeEvent of tree.lifeEvents) {
    const seen = new Set<string>()
    for (const service of lifeEvent.en.services) {
      const link = service.value.link[0]
      if (link.type !== "internal_link") continue
      const detail = pages.get(link.value.page)
      if (!detail) continue
      const slug = detail.en.meta.slug
      const document = describePage(detail.en)
      if (!SLUG_PATTERN.test(slug)) {
        issues.error({
          document,
          path: "meta.slug",
          rule: "slug-format",
          message: `"${slug}" must match ${SLUG_PATTERN}`,
        })
      }
      if (seen.has(slug)) {
        issues.error({
          document,
          path: "meta.slug",
          rule: "slug-unique",
          message: `"${slug}" is used by another service of ${describePage(lifeEvent.en)}`,
        })
      }
      seen.add(slug)
    }
  }
}
