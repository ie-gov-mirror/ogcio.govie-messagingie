import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  DISCOVERY_CONTENT_SCHEMA_VERSION,
  type DiscoveryContent,
  type DiscoveryLocale,
  STATIC_CONTENT_FILES,
  type StaticContentManifest,
} from "../../src/lib/discovery/index.ts"
import type { StaticContentMode } from "./config.ts"

export async function writeStaticContent(options: {
  outputDir: string
  mode: StaticContentMode
  content: Record<DiscoveryLocale, DiscoveryContent>
  now?: Date
}): Promise<string[]> {
  const { outputDir, mode, content } = options
  const locales = Object.keys(content) as DiscoveryLocale[]
  const manifest: StaticContentManifest = {
    schemaVersion: DISCOVERY_CONTENT_SCHEMA_VERSION,
    mode,
    generatedAt: (options.now ?? new Date()).toISOString(),
    locales,
  }

  const files: Array<[string, unknown]> = [
    [STATIC_CONTENT_FILES.manifest, manifest],
    ...locales.map((locale): [string, unknown] => [
      STATIC_CONTENT_FILES.discovery(locale),
      content[locale],
    ]),
  ]

  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })
  for (const [name, data] of files) {
    await writeFile(join(outputDir, name), `${JSON.stringify(data, null, 2)}\n`)
  }
  return files.map(([name]) => join(outputDir, name))
}
