// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { mapWithConcurrency } from "../../scripts/static-content/pipeline/index.ts"
import {
  ContentFetchError,
  createInMemoryTransport,
  createWagtailClient,
  type FixturePage,
  type Query,
  type Transport,
} from "../../scripts/static-content/wagtail/index.ts"

function fixturePage(
  id: number,
  parentId: number | null,
  type = "lea.LifeEventPage",
  locale = "en",
): FixturePage {
  return {
    id,
    title: `Page ${id}`,
    meta: {
      type,
      locale,
      slug: `page-${id}`,
      parent: parentId === null ? null : { id: parentId },
    },
    body: [],
  }
}

const list = fixturePage(1, null, "lea.ListPage")
const children = Array.from({ length: 21 }, (_, i) => fixturePage(100 + i, 1))
const gaChild = fixturePage(100, 1, "lea.LifeEventPage", "ga")
const transport = createInMemoryTransport([list, ...children, gaChild])

describe("mock transport", () => {
  it("returns a page by ID, and 404 for an unknown one", async () => {
    expect(await transport.get("/v2/pages/1/")).toEqual({
      status: 200,
      body: list,
    })
    expect((await transport.get("/v2/pages/2/")).status).toBe(404)
  })

  it("returns the requested locale of a page that shares its ID", async () => {
    expect((await transport.get("/v2/pages/100/")).body).toBe(children[0])
    expect((await transport.get("/v2/pages/100/", { locale: "ga" })).body).toBe(
      gaChild,
    )
  })

  it("rejects a limit above Wagtail's maximum", async () => {
    const response = await transport.get("/v2/pages/", { limit: 21 })
    expect(response.status).toBe(400)
  })

  it("rejects unknown query parameters, types and parents", async () => {
    const queries: Query[] = [
      { search: "x" },
      { type: "nope.Page" },
      { child_of: 404 },
      { translation_of: 404 },
      { limit: -1 },
    ]
    for (const query of queries) {
      expect((await transport.get("/v2/pages/", query)).status).toBe(400)
    }
  })

  it("returns only default fields unless fields=* is requested", async () => {
    const response = await transport.get("/v2/pages/", { child_of: 1 })
    const body = response.body as { items: Record<string, unknown>[] }
    expect(body.items[0]).not.toHaveProperty("body")
    const full = await transport.get("/v2/pages/", {
      child_of: 1,
      fields: "*",
    })
    expect((full.body as typeof body).items[0]).toHaveProperty("body")
  })
})

describe("wagtail client", () => {
  it("pages through child listings 20 at a time", async () => {
    const spy: Transport = { get: vi.fn(transport.get) }
    const client = createWagtailClient(spy)

    const pages = await client.listChildren(1, "lea.LifeEventPage", "en")

    expect(pages.map((p) => p.id)).toEqual(children.map((p) => p.id))
    expect(pages.every((p) => p.meta.locale === "en")).toBe(true)
    expect(spy.get).toHaveBeenCalledTimes(2)
    expect(spy.get).toHaveBeenLastCalledWith("/v2/pages/", {
      child_of: 1,
      type: "lea.LifeEventPage",
      locale: "en",
      fields: "*",
      limit: 20,
      offset: 20,
    })
  })

  it("finds translations with translation_of and locale", async () => {
    const client = createWagtailClient(transport)
    const found = await client.findTranslations(100, "ga", "lea.LifeEventPage")
    expect(found.map((p) => [p.id, p.meta.locale])).toEqual([[100, "ga"]])
    expect(
      await client.findTranslations(101, "ga", "lea.LifeEventPage"),
    ).toEqual([])
  })

  it("fails on a non-200 response, naming the request", async () => {
    const client = createWagtailClient(transport)
    await expect(client.getPage(2)).rejects.toThrow(ContentFetchError)
    await expect(client.getPage(2)).rejects.toThrow(
      "GET /v2/pages/2/ returned 404: No Page matches the given query.",
    )
  })

  it("fails on a response that isn't a Wagtail page", async () => {
    const client = createWagtailClient({
      get: async () => ({ status: 200, body: { unexpected: true } }),
    })
    await expect(client.getPage(1)).rejects.toThrow(/unexpected response/)
  })
})

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let active = 0
    let peak = 0
    const result = await mapWithConcurrency(
      [5, 1, 4, 2, 3, 0],
      2,
      async (n) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, n))
        active--
        return n * 10
      },
    )
    expect(result).toEqual([50, 10, 40, 20, 30, 0])
    expect(peak).toBe(2)
  })
})
