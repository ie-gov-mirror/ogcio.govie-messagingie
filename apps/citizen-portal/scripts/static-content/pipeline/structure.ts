import { SLUG_PATTERN } from "../config.ts"
import { describePage, type IssueCollector } from "./issues.ts"
import type { ContentTree } from "./validate.ts"

export function checkStructure(
  tree: ContentTree,
  issues: IssueCollector,
): void {
  checkAliases(tree, issues)
  checkCategories(tree, issues)
  checkSlugs(tree, issues)
}

function checkAliases(tree: ContentTree, issues: IssueCollector): void {
  const pages = [
    tree.list.en,
    ...tree.lifeEvents.flatMap(({ page, journeys }) => [
      page.en,
      ...journeys.map((journey) => journey.en),
    ]),
  ]
  for (const page of pages) {
    if (page.meta.alias_of !== null) {
      issues.error({
        document: describePage(page),
        path: "meta.alias_of",
        rule: "alias",
        message: "the page is a Wagtail alias; aliases aren't supported",
      })
    }
  }
}

function checkCategories(tree: ContentTree, issues: IssueCollector): void {
  const list = tree.list.en
  const document = describePage(list)
  const lifeEventIds = new Set(tree.lifeEvents.map(({ page }) => page.en.id))
  const membership = new Map<number, string[]>()
  const keys = new Set<string>()

  list.categories.forEach((category, i) => {
    if (keys.has(category.key)) {
      issues.error({
        document,
        path: `categories[${i}].key`,
        rule: "category-key-unique",
        message: `category key "${category.key}" is used more than once`,
      })
    }
    keys.add(category.key)

    category.life_events.forEach((id, j) => {
      if (!lifeEventIds.has(id)) {
        issues.error({
          document,
          path: `categories[${i}].life_events[${j}]`,
          rule: "category-unknown-life-event",
          message: `page ${id} isn't a life event under the list page`,
        })
        return
      }
      membership.set(id, [...(membership.get(id) ?? []), category.key])
    })
  })

  for (const { page } of tree.lifeEvents) {
    const categories = membership.get(page.en.id) ?? []
    if (categories.length !== 1) {
      issues.error({
        document: describePage(page.en),
        path: "",
        rule: "life-event-category-count",
        message: `is in ${categories.length} categories${categories.length ? ` (${categories.join(", ")})` : ""}; it must be in exactly one`,
      })
    }
  }

  const gaKeys = new Set(tree.list.ga.categories.map((c) => c.key))
  const gaDocument = describePage(tree.list.ga)
  for (const key of keys) {
    if (!gaKeys.has(key)) {
      issues.error({
        document: gaDocument,
        path: "categories",
        rule: "category-translation",
        message: `category "${key}" has no translation`,
      })
    }
  }
  for (const key of gaKeys) {
    if (!keys.has(key)) {
      issues.error({
        document: gaDocument,
        path: "categories",
        rule: "category-translation",
        message: `category "${key}" doesn't exist in the ${tree.list.en.meta.locale} list page`,
      })
    }
  }
}

function checkSlugs(tree: ContentTree, issues: IssueCollector): void {
  const lifeEventSlugs = new Set<string>()
  for (const { page, journeys } of tree.lifeEvents) {
    checkSlug(page.en, lifeEventSlugs, "life events", issues)

    if (journeys.length === 0) {
      issues.warn({
        document: describePage(page.en),
        path: "",
        rule: "life-event-no-journeys",
        message: "has no journeys; its page shows an empty state",
      })
    }
    const journeySlugs = new Set<string>()
    for (const journey of journeys) {
      checkSlug(journey.en, journeySlugs, "journeys of its life event", issues)
    }
  }
}

function checkSlug(
  page: { id: number; meta: { type: string; locale: string; slug: string } },
  seen: Set<string>,
  scope: string,
  issues: IssueCollector,
): void {
  const { slug } = page.meta
  if (!SLUG_PATTERN.test(slug)) {
    issues.error({
      document: describePage(page),
      path: "meta.slug",
      rule: "slug-format",
      message: `"${slug}" must match ${SLUG_PATTERN}`,
    })
  }
  if (seen.has(slug)) {
    issues.error({
      document: describePage(page),
      path: "meta.slug",
      rule: "slug-unique",
      message: `"${slug}" is used by another page among the ${scope}`,
    })
  }
  seen.add(slug)
}
