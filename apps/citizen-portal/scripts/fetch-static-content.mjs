#!/usr/bin/env node
/**
 * Build-time content for the LEA discovery section (AB#43539). See the ADR
 * `docs/wiki/ADRs/ADR%3A-LifeEvents-build-content-from-cms.md`.
 *
 * Walks the gov.ie Wagtail API v2 tree (list page → life events → journeys),
 * pairs each EN page with its GA translation, validates the fields we read,
 * parses rich text into an allowlisted node tree and writes one model per
 * locale to `.static-content/discovery.<locale>.json`. `next build` reads
 * only that output. Any contract breach throws, so the build fails.
 *
 * Modes (CMS_MODE): `mock` reads `static-content/fixtures/`; `proxy` calls
 * Infomed at CMS_API_BASE_URL (M2, AB#43550).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseFragment } from "parse5"
import { z } from "zod"

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")
const PAGE_LIMIT = 20
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
// OQ2: Carbon hasn't named the page types yet.
const TYPES = {
  list: "lea.ListPage",
  lifeEvent: "lea.LifeEventPage",
  journey: "lea.JourneyPage",
}
const RICH_TEXT_TAGS = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "b",
  "i",
  "strong",
  "em",
  "br",
])

class ContentError extends Error {}

function fail(doc, path, rule) {
  throw new ContentError(`${doc} ${path}: ${rule}`)
}

// --- sources -------------------------------------------------------------

export function mockSource(
  fixturesDir = join(APP_DIR, "static-content/fixtures"),
) {
  const load = async () => ({
    en: JSON.parse(await readFile(join(fixturesDir, "en.json"), "utf8")),
    ga: JSON.parse(await readFile(join(fixturesDir, "ga.json"), "utf8")),
  })
  let fixtures
  return {
    async get(path) {
      fixtures ??= await load()
      const url = new URL(path, "http://mock")
      const detail = url.pathname.match(/^\/v2\/pages\/(\d+)\/$/)
      if (detail) {
        const page = fixtures.en.find((p) => p.id === Number(detail[1]))
        if (!page) throw new ContentError(`GET ${path}: 404`)
        return page
      }
      const q = url.searchParams
      const limit = Number(q.get("limit") ?? PAGE_LIMIT)
      if (limit > PAGE_LIMIT) throw new ContentError(`GET ${path}: 400`)
      const offset = Number(q.get("offset") ?? 0)
      const type = q.get("type")
      let items
      if (q.has("translation_of")) {
        const ga = fixtures.ga[q.get("translation_of")]
        items = ga && ga.meta.type === type ? [ga] : []
      } else {
        const parent = Number(q.get("child_of"))
        items = fixtures.en.filter(
          (p) => p.meta.parent?.id === parent && p.meta.type === type,
        )
      }
      return {
        meta: { total_count: items.length },
        items: items.slice(offset, offset + limit),
      }
    },
  }
}

// ponytail: no retry, backoff or concurrency cap yet; A.6 lands with M2 (AB#43550).
export function proxySource(baseUrl, token) {
  return {
    async get(path) {
      const res = await fetch(new URL(path, baseUrl), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new ContentError(`GET ${path}: ${res.status}`)
      return res.json()
    },
  }
}

// --- contract (Annex A.3 / A.4) -----------------------------------------

const meta = z.looseObject({
  type: z.string(),
  slug: z.string(),
  locale: z.enum(["en", "ga"]),
  alias_of: z.unknown().nullable(),
})
const block = z.looseObject({ type: z.string(), value: z.unknown() })
const page = z.looseObject({
  id: z.number().int(),
  title: z.string().min(1),
  meta,
  body: z.array(block),
  summary: z.string().optional(),
  highlighted: z.boolean().optional(),
})
const listPage = page.extend({
  categories: z.array(
    z.looseObject({
      key: z.string().min(1),
      title: z.string().min(1),
      icon: z.string().min(1),
      life_events: z.array(z.number().int()),
    }),
  ),
})
const listing = z.looseObject({
  meta: z.looseObject({ total_count: z.number().int() }),
  items: z.array(z.unknown()),
})
const buttonLinks = z.array(
  z.looseObject({
    type: z.literal("external_link"),
    value: z.looseObject({
      link_url: z.string(),
      link_text: z.string().min(1),
    }),
  }),
)

function parse(schema, value, doc) {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    fail(doc, `$.${issue.path.join(".")}`, issue.message)
  }
  return result.data
}

function label(p) {
  return `page ${p?.id ?? "?"} (${p?.meta?.locale ?? "?"})`
}

// --- discovery -----------------------------------------------------------

async function listAll(source, query) {
  const items = []
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const res = parse(
      listing,
      await source.get(
        `/v2/pages/?${query}&fields=*&limit=${PAGE_LIMIT}&offset=${offset}`,
      ),
      `listing ${query}`,
    )
    items.push(...res.items)
    if (items.length >= res.meta.total_count || res.items.length === 0)
      return items
  }
}

async function translation(source, en) {
  const items = await listAll(
    source,
    `translation_of=${en.id}&locale=ga&type=${en.meta.type}`,
  )
  if (items.length !== 1) fail(label(en), "$", "missing GA translation")
  const ga = parse(page, items[0], `GA of ${label(en)}`)
  if (ga.meta.alias_of !== null)
    fail(label(ga), "$.meta.alias_of", "GA page is an alias")
  if (ga.meta.locale !== "ga") fail(label(ga), "$.meta.locale", "expected ga")
  return ga
}

function checkEnPage(p) {
  if (p.meta.alias_of !== null)
    fail(label(p), "$.meta.alias_of", "page is an alias")
  if (p.meta.locale !== "en") fail(label(p), "$.meta.locale", "expected en")
  if (!SLUG.test(p.meta.slug))
    fail(label(p), "$.meta.slug", `bad slug "${p.meta.slug}"`)
}

// --- rich text (A.5) and blocks (A.4) ------------------------------------

function richText(html, ctx, path) {
  const walk = (node, at) => {
    if (node.nodeName === "#text") return { text: node.value }
    const tag = node.tagName
    const attrs = Object.fromEntries(node.attrs.map((a) => [a.name, a.value]))
    // Wagtail's draftail editor stamps every block element with this.
    delete attrs["data-block-key"]
    const children = () => node.childNodes.map((c, i) => walk(c, `${at}.${i}`))
    if (tag === "a") {
      if (
        attrs.linktype === "page" &&
        attrs.id &&
        Object.keys(attrs).length === 2
      ) {
        const target = ctx.paths.get(Number(attrs.id))
        if (!target)
          fail(ctx.doc, at, `internal link to unknown page ${attrs.id}`)
        return { tag, href: `/${ctx.locale}${target}`, children: children() }
      }
      if (attrs.href && Object.keys(attrs).length === 1) {
        if (!attrs.href.startsWith("https://"))
          fail(ctx.doc, at, `link must be absolute https: ${attrs.href}`)
        return { tag, href: attrs.href, children: children() }
      }
      fail(ctx.doc, at, `unsupported link ${JSON.stringify(attrs)}`)
    }
    if (!RICH_TEXT_TAGS.has(tag))
      fail(ctx.doc, at, `element <${tag}> is not allowed`)
    if (Object.keys(attrs).length)
      fail(ctx.doc, at, `<${tag}> attributes are not allowed`)
    return { tag, children: children() }
  }
  return parseFragment(html).childNodes.map((n, i) => walk(n, `${path}.${i}`))
}

function blocks(body, ctx) {
  return body.map((b, i) => {
    const at = `$.body.${i}`
    switch (b.type) {
      case "heading":
        return {
          type: "heading",
          text: parse(z.string().min(1), b.value, `${ctx.doc} ${at}`),
        }
      case "paragraph":
        return {
          type: "paragraph",
          nodes: richText(
            parse(z.string(), b.value, `${ctx.doc} ${at}`),
            ctx,
            `${at}.value`,
          ),
        }
      case "button_link":
        return {
          type: "buttons",
          links: parse(buttonLinks, b.value, `${ctx.doc} ${at}`).map((l, j) => {
            if (!l.value.link_url.startsWith("https://")) {
              fail(
                ctx.doc,
                `${at}.value.${j}.value.link_url`,
                "link must be absolute https",
              )
            }
            return { href: l.value.link_url, text: l.value.link_text }
          }),
        }
      default:
        return fail(ctx.doc, `${at}.type`, `unknown block type "${b.type}"`)
    }
  })
}

// --- main ----------------------------------------------------------------

export async function fetchStaticContent({
  source,
  indexPageId,
  outDir,
  log = console,
}) {
  const list = parse(
    listPage,
    await source.get(`/v2/pages/${indexPageId}/`),
    `page ${indexPageId}`,
  )
  checkEnPage(list)
  if (list.meta.type !== TYPES.list)
    fail(label(list), "$.meta.type", `expected ${TYPES.list}`)

  const lifeEvents = (
    await listAll(source, `child_of=${list.id}&type=${TYPES.lifeEvent}`)
  ).map((p) => parse(page, p, label(p)))
  const journeysOf = new Map()
  for (const le of lifeEvents) {
    checkEnPage(le)
    const journeys = (
      await listAll(source, `child_of=${le.id}&type=${TYPES.journey}`)
    ).map((p) => parse(page, p, label(p)))
    const seen = new Set()
    for (const j of journeys) {
      checkEnPage(j)
      if (seen.has(j.meta.slug))
        fail(
          label(j),
          "$.meta.slug",
          `duplicate journey slug in ${le.meta.slug}`,
        )
      seen.add(j.meta.slug)
    }
    journeysOf.set(le.id, journeys)
  }
  const empty = lifeEvents.filter((le) => journeysOf.get(le.id).length === 0)
  if (empty.length === lifeEvents.length) {
    fail(
      label(list),
      "$",
      "no journeys at all (empty generateStaticParams fails the export)",
    )
  }
  if (empty.length) {
    log.warn(
      `[static-content] ${empty.length} life events have no journeys: ${empty.map((le) => le.meta.slug).join(", ")}`,
    )
  }

  const leSlugs = new Set()
  for (const le of lifeEvents) {
    if (leSlugs.has(le.meta.slug))
      fail(label(le), "$.meta.slug", "duplicate life-event slug")
    leSlugs.add(le.meta.slug)
  }
  const categoryOf = new Map()
  list.categories.forEach((c, i) => {
    for (const id of c.life_events) {
      if (!lifeEvents.some((le) => le.id === id)) {
        fail(
          label(list),
          `$.categories.${i}.life_events`,
          `unknown life event ${id}`,
        )
      }
      if (categoryOf.has(id))
        fail(
          label(list),
          `$.categories.${i}.life_events`,
          `life event ${id} is in two categories`,
        )
      categoryOf.set(id, c.key)
    }
  })
  for (const le of lifeEvents) {
    if (!categoryOf.has(le.id))
      fail(label(le), "$", "life event is in no category")
  }

  // EN is the source of structure and slugs; GA only supplies text.
  const ga = new Map()
  const paths = new Map()
  const addPath = async (en, path) => {
    const t = await translation(source, en)
    ga.set(en.id, t)
    paths.set(en.id, path).set(t.id, path)
  }
  await addPath(list, "/discovery")
  for (const le of lifeEvents) {
    await addPath(le, `/discovery/${le.meta.slug}`)
    for (const j of journeysOf.get(le.id))
      await addPath(j, `/discovery/${le.meta.slug}/${j.meta.slug}`)
  }
  const gaList = parse(listPage, ga.get(list.id), `GA of ${label(list)}`)

  await mkdir(outDir, { recursive: true })
  for (const locale of ["en", "ga"]) {
    const text = (en) => (locale === "en" ? en : ga.get(en.id))
    const ctxFor = (en) => ({ locale, paths, doc: label(text(en)) })
    const categoryTitle = (c) =>
      locale === "en"
        ? c.title
        : (gaList.categories.find((g) => g.key === c.key)?.title ??
          fail(label(gaList), "$.categories", `no GA title for ${c.key}`))
    const model = {
      locale,
      title: text(list).title,
      intro: blocks(text(list).body, ctxFor(list)),
      categories: list.categories.map((c) => ({
        key: c.key,
        title: categoryTitle(c),
        icon: c.icon,
        lifeEvents: c.life_events.map(
          (id) => lifeEvents.find((le) => le.id === id).meta.slug,
        ),
      })),
      lifeEvents: lifeEvents.map((le) => ({
        slug: le.meta.slug,
        title: text(le).title,
        summary: text(le).summary ?? null,
        categoryKey: categoryOf.get(le.id),
        body: blocks(text(le).body, ctxFor(le)),
        journeys: journeysOf.get(le.id).map((j) => ({
          slug: j.meta.slug,
          title: text(j).title,
          summary: text(j).summary ?? null,
          body: blocks(text(j).body, ctxFor(j)),
        })),
      })),
    }
    await writeFile(
      join(outDir, `discovery.${locale}.json`),
      `${JSON.stringify(model, null, 2)}\n`,
    )
  }

  const journeyCount = [...journeysOf.values()].reduce(
    (n, j) => n + j.length,
    0,
  )
  log.info(
    `[static-content] wrote ${outDir}: ${list.categories.length} categories, ${lifeEvents.length} life events, ${journeyCount} journeys × en/ga`,
  )
}

async function main() {
  const lea = String(process.env.NEXT_PUBLIC_ENABLE_LEA ?? "")
    .trim()
    .toLowerCase()
  if (!["true", "1", "yes", "on"].includes(lea)) {
    console.info("[static-content] NEXT_PUBLIC_ENABLE_LEA is off, skipping")
    return
  }
  const mode = process.env.CMS_MODE ?? "mock"
  const source =
    mode === "proxy"
      ? proxySource(process.env.CMS_API_BASE_URL, process.env.CMS_API_TOKEN)
      : mockSource()
  await fetchStaticContent({
    source,
    indexPageId: process.env.CMS_INDEX_PAGE_ID ?? "1000",
    outDir: join(APP_DIR, ".static-content"),
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[static-content] ${error.message}`)
    process.exit(1)
  })
}
