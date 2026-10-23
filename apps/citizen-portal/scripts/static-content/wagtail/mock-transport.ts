import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { PAGE_TYPES, WAGTAIL_PAGE_LIMIT } from "../config.ts"
import type { Query, Transport, TransportResponse } from "./transport.ts"

// Pages live in `pages/<locale>/<id>.json`, each locale with its own IDs as
// the gov.ie CMS has them. Wagtail links a translation to its source with a
// key the API doesn't expose, so fixtures name the source in `_translation_of`
// and responses leave it out. Listings return pages in ID order, standing in
// for Wagtail's tree order.

export type FixturePage = {
  id: number
  title: string
  meta: {
    type: string
    locale: string
    slug?: string
    detail_url?: string
    html_url?: string | null
    first_published_at?: string | null
    parent?: { id: number } | null
    alias_of?: { id: number } | null
  }
  _translation_of?: number
} & Record<string, unknown>

const LISTING_PARAMS = new Set([
  "child_of",
  "type",
  "translation_of",
  "locale",
  "fields",
  "limit",
  "offset",
])

export async function loadFixtures(dir: string): Promise<FixturePage[]> {
  const pagesDir = join(dir, "pages")
  const pages: FixturePage[] = []
  for (const entry of await readdir(pagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const localeDir = join(pagesDir, entry.name)
    for (const file of await readdir(localeDir)) {
      if (!file.endsWith(".json")) continue
      pages.push(JSON.parse(await readFile(join(localeDir, file), "utf8")))
    }
  }
  return pages
}

export function createMockTransport(fixturesDir: string): Transport {
  let fixtures: Promise<FixturePage[]> | undefined
  return {
    async get(path, query = {}) {
      fixtures ??= loadFixtures(fixturesDir)
      return respond(await fixtures, path, query)
    },
  }
}

export function createInMemoryTransport(pages: FixturePage[]): Transport {
  return { get: async (path, query = {}) => respond(pages, path, query) }
}

function respond(
  pages: readonly FixturePage[],
  path: string,
  query: Query,
): TransportResponse {
  const detail = /^\/v2\/pages\/(\d+)\/$/.exec(path)
  if (detail) {
    const page = pages.find((p) => p.id === Number(detail[1]))
    return page
      ? { status: 200, body: withoutMockFields(page) }
      : notFound("No Page matches the given query.")
  }
  if (path === "/v2/pages/") return listing(pages, query)
  return notFound(`No route for ${path}`)
}

function listing(
  pages: readonly FixturePage[],
  query: Query,
): TransportResponse {
  for (const key of Object.keys(query)) {
    if (!LISTING_PARAMS.has(key)) {
      return badRequest(
        `query parameter is not an operation or a recognised field: ${key}`,
      )
    }
  }

  const limit = toInt(query.limit ?? WAGTAIL_PAGE_LIMIT)
  const offset = toInt(query.offset ?? 0)
  if (limit === undefined || offset === undefined) {
    return badRequest("limit and offset must be positive integers")
  }
  if (limit > WAGTAIL_PAGE_LIMIT) {
    return badRequest(`limit cannot be higher than ${WAGTAIL_PAGE_LIMIT}`)
  }

  const exists = (id: number) => pages.some((p) => p.id === id)
  let items = [...pages]

  if (query.type !== undefined) {
    // Wagtail rejects unregistered page models, not types with no pages.
    const registered = [
      ...Object.values(PAGE_TYPES),
      ...items.map((p) => p.meta.type),
    ]
    if (!registered.includes(String(query.type))) {
      return badRequest("type doesn't exist")
    }
    items = items.filter((p) => p.meta.type === query.type)
  }

  if (query.child_of !== undefined) {
    const parentId = toInt(query.child_of)
    if (parentId === undefined || !exists(parentId)) {
      return badRequest("parent page doesn't exist")
    }
    items = items.filter((p) => p.meta.parent?.id === parentId)
  }

  if (query.translation_of !== undefined) {
    const pageId = toInt(query.translation_of)
    if (pageId === undefined || !exists(pageId)) {
      return badRequest("translation_of page doesn't exist")
    }
    items = items.filter((p) => p._translation_of === pageId)
  }

  if (query.locale !== undefined) {
    items = items.filter((p) => p.meta.locale === query.locale)
  }

  items.sort((a, b) => a.id - b.id)
  const page = items.slice(offset, offset + limit)
  return {
    status: 200,
    body: {
      meta: { total_count: items.length },
      items:
        query.fields === "*"
          ? page.map(withoutMockFields)
          : page.map(listingItem),
    },
  }
}

function listingItem(page: FixturePage) {
  const { type, detail_url, html_url, slug, first_published_at, locale } =
    page.meta
  return {
    id: page.id,
    meta: { type, detail_url, html_url, slug, first_published_at, locale },
    title: page.title,
  }
}

function withoutMockFields(page: FixturePage) {
  const { _translation_of, ...rest } = page
  return rest
}

function toInt(value: string | number): number | undefined {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function badRequest(message: string): TransportResponse {
  return { status: 400, body: { message } }
}

function notFound(message: string): TransportResponse {
  return { status: 404, body: { message } }
}
