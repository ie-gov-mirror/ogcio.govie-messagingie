import type { z } from "zod"
import type { DiscoveryLocale } from "../../../src/lib/discovery/index.ts"
import { PAGE_TYPES, SOURCE_LOCALE, TRANSLATION_LOCALE } from "../config.ts"
import {
  type JourneyPage,
  journeyPageSchema,
  type LifeEventPage,
  type ListPage,
  lifeEventPageSchema,
  listPageSchema,
  type PageRef,
} from "../wagtail/index.ts"
import type { RawTree } from "./discover.ts"
import { describePage, type IssueCollector, reportZodError } from "./issues.ts"

export type Localised<T> = Record<DiscoveryLocale, T>

export type ContentTree = {
  list: Localised<ListPage>
  lifeEvents: Array<{
    page: Localised<LifeEventPage>
    journeys: Localised<JourneyPage>[]
  }>
}

export function validateTree(
  raw: RawTree,
  translations: ReadonlyMap<number, PageRef>,
  issues: IssueCollector,
): ContentTree | undefined {
  let valid = true

  function localised<T>(
    schema: z.ZodType<T>,
    type: string,
    en: PageRef,
  ): Localised<T> | undefined {
    const ga = translations.get(en.id)
    const enPage = validatePage(schema, type, SOURCE_LOCALE, en, issues)
    const gaPage = ga
      ? validatePage(schema, type, TRANSLATION_LOCALE, ga, issues)
      : undefined
    if (enPage === undefined || gaPage === undefined) {
      valid = false
      return undefined
    }
    return { en: enPage, ga: gaPage }
  }

  const list = localised(listPageSchema, PAGE_TYPES.list, raw.list)
  const lifeEvents = raw.lifeEvents.map(({ page, journeys }) => ({
    page: localised(lifeEventPageSchema, PAGE_TYPES.lifeEvent, page),
    journeys: journeys.map((journey) =>
      localised(journeyPageSchema, PAGE_TYPES.journey, journey),
    ),
  }))

  if (!valid || !list) return undefined
  return {
    list,
    lifeEvents: lifeEvents.map(({ page, journeys }) => ({
      page: page as Localised<LifeEventPage>,
      journeys: journeys as Localised<JourneyPage>[],
    })),
  }
}

function validatePage<T>(
  schema: z.ZodType<T>,
  type: string,
  locale: DiscoveryLocale,
  raw: PageRef,
  issues: IssueCollector,
): T | undefined {
  const document = describePage(raw)
  let valid = true
  if (raw.meta.type !== type) {
    issues.error({
      document,
      path: "meta.type",
      rule: "page-type",
      message: `expected "${type}", got "${raw.meta.type}"`,
    })
    valid = false
  }
  if (raw.meta.locale !== locale) {
    issues.error({
      document,
      path: "meta.locale",
      rule: "page-locale",
      message: `expected "${locale}", got "${raw.meta.locale}"`,
    })
    valid = false
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    reportZodError(issues, document, parsed.error)
    return undefined
  }
  return valid ? parsed.data : undefined
}
