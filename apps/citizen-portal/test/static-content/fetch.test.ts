// @vitest-environment node
import { execFile } from "node:child_process"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = join(process.cwd(), "scripts/static-content/fetch.ts")

let root: string
let outputDir: string

function fetchStaticContent(env: Record<string, string>) {
  return promisify(execFile)(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", SCRIPT],
    { env: { ...process.env, STATIC_CONTENT_DIR: outputDir, ...env } },
  )
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "static-content-fetch-"))
  outputDir = join(root, ".static-content")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("fetch:static-content", () => {
  it.each(["", "false"])(
    "skips without writing when NEXT_PUBLIC_ENABLE_LEA is %j",
    async (lea) => {
      const { stdout } = await fetchStaticContent({
        NEXT_PUBLIC_ENABLE_LEA: lea,
      })
      expect(stdout).toContain("skipped, NEXT_PUBLIC_ENABLE_LEA is off")
      expect(await readdir(root)).toEqual([])
    },
  )

  it("can't fail the build with LEA off", async () => {
    await expect(
      fetchStaticContent({
        NEXT_PUBLIC_ENABLE_LEA: "true",
        STATIC_CONTENT_MODE: "live",
      }),
    ).rejects.toThrow()

    const { stdout } = await fetchStaticContent({
      NEXT_PUBLIC_ENABLE_LEA: "false",
      STATIC_CONTENT_MODE: "live",
    })
    expect(stdout).toContain("skipped")
  })

  it("writes the content when NEXT_PUBLIC_ENABLE_LEA is on", async () => {
    await fetchStaticContent({ NEXT_PUBLIC_ENABLE_LEA: "true" })
    expect((await readdir(outputDir)).sort()).toEqual([
      "discovery.en.json",
      "discovery.ga.json",
      "manifest.json",
    ])
  })
})
