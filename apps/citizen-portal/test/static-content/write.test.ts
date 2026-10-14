// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { staticContentManifestSchema } from "@/lib/discovery"
import {
  MOCK_FIXTURES_DIR,
  MOCK_INDEX_PAGE_ID,
  readConfig,
} from "../../scripts/static-content/config.ts"
import { buildDiscoveryContent } from "../../scripts/static-content/pipeline/index.ts"
import { createMockTransport } from "../../scripts/static-content/wagtail/index.ts"
import { writeStaticContent } from "../../scripts/static-content/write.ts"

describe("writeStaticContent", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "static-content-"))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("replaces the output directory with the manifest and one file per locale", async () => {
    const outputDir = join(root, ".static-content")
    await writeFile(join(root, "stale"), "")
    const { content } = await buildDiscoveryContent({
      transport: createMockTransport(MOCK_FIXTURES_DIR),
      indexPageId: MOCK_INDEX_PAGE_ID,
    })
    if (!content) throw new Error("mock content should build")

    await writeStaticContent({ outputDir, mode: "mock", content })
    await writeFile(join(outputDir, "leftover.json"), "{}")
    const written = await writeStaticContent({
      outputDir,
      mode: "mock",
      content,
      now: new Date("2026-09-30T10:00:00.000Z"),
    })

    expect(written.map((f) => f.slice(outputDir.length + 1))).toEqual([
      "manifest.json",
      "discovery.en.json",
      "discovery.ga.json",
    ])
    expect((await readdir(outputDir)).sort()).toEqual([
      "discovery.en.json",
      "discovery.ga.json",
      "manifest.json",
    ])
    expect((await readdir(root)).sort()).toEqual([".static-content", "stale"])

    const manifest = staticContentManifestSchema.parse(
      JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8")),
    )
    expect(manifest).toEqual({
      schemaVersion: 1,
      mode: "mock",
      generatedAt: "2026-09-30T10:00:00.000Z",
      locales: ["en", "ga"],
    })
    expect(
      JSON.parse(await readFile(join(outputDir, "discovery.ga.json"), "utf8")),
    ).toEqual(content.ga)
  })
})

describe("readConfig", () => {
  it("defaults to mock mode and the app's .static-content directory", () => {
    const config = readConfig({})
    expect(config.mode).toBe("mock")
    expect(config.indexPageId).toBe(MOCK_INDEX_PAGE_ID)
    expect(config.outputDir).toBe(resolve(process.cwd(), ".static-content"))
  })

  it("honours STATIC_CONTENT_DIR", () => {
    expect(readConfig({ STATIC_CONTENT_DIR: "/tmp/out" }).outputDir).toBe(
      "/tmp/out",
    )
  })

  it("rejects proxy mode until Infomed lands, and unknown modes", () => {
    expect(() => readConfig({ STATIC_CONTENT_MODE: "proxy" })).toThrow(
      /not implemented/,
    )
    expect(() => readConfig({ STATIC_CONTENT_MODE: "live" })).toThrow(
      /must be "mock" or "proxy"/,
    )
  })
})
