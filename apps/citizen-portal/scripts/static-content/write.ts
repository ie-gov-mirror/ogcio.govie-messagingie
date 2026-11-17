import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import {
  DISCOVERY_CONTENT_SCHEMA_VERSION,
  type DiscoveryContent,
  type DiscoveryLocale,
  STATIC_CONTENT_FILES,
  type StaticContentManifest,
  staticContentManifestSchema,
} from "../../src/lib/discovery/index.ts"
import { ConfigError } from "./config.ts"

export async function writeStaticContent(options: {
  outputDir: string
  mode: StaticContentManifest["mode"]
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

export async function readPrebuiltManifest(
  outputDir: string,
): Promise<StaticContentManifest> {
  const file = join(outputDir, STATIC_CONTENT_FILES.manifest)
  let raw: string
  try {
    raw = await readFile(file, "utf8")
  } catch {
    throw new ConfigError(
      `STATIC_CONTENT_MODE=prebuilt found no content in ${outputDir}: the fetch job's artifact isn't there`,
    )
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new ConfigError(`${file} isn't valid JSON`)
  }
  const parsed = staticContentManifestSchema.safeParse(json)
  if (!parsed.success) {
    throw new ConfigError(
      `${file} doesn't match this build's content schema:\n${z.prettifyError(parsed.error)}`,
    )
  }
  const manifest = parsed.data
  if (manifest.mode !== "proxy") {
    throw new ConfigError(
      `${file} was written in ${manifest.mode} mode, not proxy: prebuilt content must come from the CMS`,
    )
  }

  for (const locale of manifest.locales) {
    const name = STATIC_CONTENT_FILES.discovery(locale)
    try {
      await access(join(outputDir, name))
    } catch {
      throw new ConfigError(`prebuilt content in ${outputDir} has no ${name}`)
    }
  }
  return manifest
}
