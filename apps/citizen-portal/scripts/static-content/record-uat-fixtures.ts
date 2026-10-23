// Re-records fixtures/uat from the UAT CMS: every page the pipeline requests,
// as the mock transport serves it. One detail response per page (listings
// leave out `meta.parent`, which the mock needs for `child_of`), and each GA
// page names its EN page in `_translation_of`. Read-only against the CMS.
// Needs the VPN and the proxy-mode variables (see README). Runs under Node's
// type stripping, like fetch.ts.
// TODO: remove with fixtures/uat once UAT is flagged as stable.
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  PAGE_TYPES,
  readConfig,
  SOURCE_LOCALE,
  TRANSLATION_LOCALE,
  UAT_FIXTURES_DIR,
  UAT_INDEX_PAGE_ID,
} from "./config.ts"
import {
  createClientCredentialsTokenSource,
  createHttpTransport,
  createWagtailClient,
  type PageRef,
} from "./wagtail/index.ts"

type Page = PageRef & Record<string, unknown>
type Recorded = Page & { _translation_of?: number }

async function main(): Promise<void> {
  const config = readConfig({ ...process.env, STATIC_CONTENT_MODE: "proxy" })
  if (config.mode !== "proxy") throw new Error("unreachable")
  const client = createWagtailClient(
    createHttpTransport({
      baseUrl: config.api.baseUrl,
      tokens: createClientCredentialsTokenSource(config.api),
    }),
  )
  const detail = async (id: number) => (await client.getPage(id)) as Page

  async function translation(page: Page): Promise<Recorded[]> {
    const found = await client.findTranslations(
      page.id,
      TRANSLATION_LOCALE,
      page.meta.type,
    )
    return Promise.all(
      found.map(async (ga) => ({
        ...(await detail(ga.id)),
        _translation_of: page.id,
      })),
    )
  }

  const landing = await detail(UAT_INDEX_PAGE_ID)
  const children = await client.listChildren(
    landing.id,
    PAGE_TYPES.lifeEvent,
    SOURCE_LOCALE,
  )
  const lifeEvents = await Promise.all(children.map((page) => detail(page.id)))
  const sources = [landing, ...lifeEvents]
  const translations = (await Promise.all(sources.map(translation))).flat()

  // The pages services link to, as loadServicePages requests them.
  const discovery = new Set([...sources, ...translations].map((p) => p.id))
  const linkedIds = new Set<number>()
  for (const page of [...lifeEvents, ...translations]) {
    for (const id of serviceLinks(page)) {
      if (!discovery.has(id)) linkedIds.add(id)
    }
  }
  const servicePages: Recorded[] = []
  for (const id of linkedIds) {
    const page = await detail(id)
    servicePages.push(page)
    if (page.meta.locale === SOURCE_LOCALE) {
      servicePages.push(...(await translation(page)))
    }
  }

  const pages: Recorded[] = [...sources, ...translations, ...servicePages]
  const dir = join(UAT_FIXTURES_DIR, "pages")
  await rm(dir, { recursive: true, force: true })
  for (const page of pages) {
    await mkdir(join(dir, page.meta.locale), { recursive: true })
    await writeFile(
      join(dir, page.meta.locale, `${page.id}.json`),
      `${JSON.stringify(page, null, 2)}\n`,
    )
  }

  const withBody = servicePages.filter(
    (page) =>
      page.meta.locale === SOURCE_LOCALE &&
      Array.isArray(page.body) &&
      page.body.length > 0,
  )
  console.log(
    `record-uat-fixtures: wrote ${pages.length} pages from ${config.api.baseUrl}: ` +
      `the landing page, ${lifeEvents.length} life events, ` +
      `${servicePages.length} service pages, and their translations`,
  )
  if (withBody.length === 0) {
    console.warn(
      "record-uat-fixtures: warning: no service links to a CMS page with a body, " +
        "so `next build` generates no /discovery/<life-event>/<service> page and " +
        'fails under `output: "export"`. Patch a service in by hand; see fixtures/uat/README.md.',
    )
  }
  console.log(
    "record-uat-fixtures: update the date and notes in fixtures/uat/README.md",
  )
}

function serviceLinks(page: Page): number[] {
  const services = Array.isArray(page.services) ? page.services : []
  return services.flatMap((service) => {
    const link = service?.value?.link?.[0]
    return link?.type === "internal_link" &&
      typeof link.value?.page === "number"
      ? [link.value.page]
      : []
  })
}

main().catch((error: unknown) => {
  console.error(
    `record-uat-fixtures: failed: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
})
