import { z } from "zod"
import { WAGTAIL_PAGE_LIMIT } from "../config.ts"
import { listingSchema, type PageRef, pageRefSchema } from "./schemas.ts"
import type { Query, Transport } from "./transport.ts"

export class ContentFetchError extends Error {
  name = "ContentFetchError"
}

export type WagtailClient = {
  getPage(id: number): Promise<PageRef>
  listChildren(
    parentId: number,
    type: string,
    locale: string,
  ): Promise<PageRef[]>
  findTranslations(
    pageId: number,
    locale: string,
    type: string,
  ): Promise<PageRef[]>
}

export function createWagtailClient(transport: Transport): WagtailClient {
  async function get<T>(
    schema: z.ZodType<T>,
    path: string,
    query?: Query,
  ): Promise<T> {
    const request = describeRequest(path, query)
    const response = await transport.get(path, query)
    if (response.status !== 200) {
      throw new ContentFetchError(
        `${request} returned ${response.status}${describeBody(response.body)}`,
      )
    }
    const parsed = schema.safeParse(response.body)
    if (!parsed.success) {
      throw new ContentFetchError(
        `${request} returned an unexpected response:\n${z.prettifyError(parsed.error)}`,
      )
    }
    return parsed.data
  }

  async function listAll(query: Query): Promise<PageRef[]> {
    const items: PageRef[] = []
    for (let offset = 0; ; offset += WAGTAIL_PAGE_LIMIT) {
      const listing = await get(listingSchema, "/v2/pages/", {
        ...query,
        limit: WAGTAIL_PAGE_LIMIT,
        offset,
      })
      items.push(...listing.items)
      const done =
        listing.items.length === 0 ||
        offset + WAGTAIL_PAGE_LIMIT >= listing.meta.total_count
      if (done) return items
    }
  }

  return {
    getPage: (id) => get(pageRefSchema, `/v2/pages/${id}/`),
    listChildren: (parentId, type, locale) =>
      listAll({ child_of: parentId, type, locale, fields: "*" }),
    findTranslations: (pageId, locale, type) =>
      listAll({ translation_of: pageId, locale, type, fields: "*" }),
  }
}

function describeRequest(path: string, query?: Query): string {
  const search = query
    ? new URLSearchParams(
        Object.entries(query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : ""
  return `GET ${path}${search ? `?${search}` : ""}`
}

// Wagtail's API errors carry `message`; DRF's, such as a rejected token,
// carry `detail`.
function describeBody(body: unknown): string {
  if (body && typeof body === "object") {
    if ("message" in body) return `: ${String(body.message)}`
    if ("detail" in body) return `: ${String(body.detail)}`
  }
  return ""
}
