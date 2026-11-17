// @vitest-environment node
import { execFile } from "node:child_process"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
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

  it("fails proxy mode without its API settings, writing nothing", async () => {
    const error = await fetchStaticContent({
      NEXT_PUBLIC_ENABLE_LEA: "true",
      STATIC_CONTENT_MODE: "proxy",
    }).catch((e: { stderr: string }) => e)
    expect(error.stderr).toContain(
      "static-content: failed: STATIC_CONTENT_MODE=proxy needs STATIC_CONTENT_API_URL",
    )
    expect(await readdir(root)).toEqual([])
  })

  it("writes the content when NEXT_PUBLIC_ENABLE_LEA is on", async () => {
    await fetchStaticContent({ NEXT_PUBLIC_ENABLE_LEA: "true" })
    expect((await readdir(outputDir)).sort()).toEqual([
      "discovery.en.json",
      "discovery.ga.json",
      "manifest.json",
    ])
  })

  describe("prebuilt mode", () => {
    const prebuilt = {
      NEXT_PUBLIC_ENABLE_LEA: "true",
      STATIC_CONTENT_MODE: "prebuilt",
    }

    async function writeProxyContent() {
      await fetchStaticContent({ NEXT_PUBLIC_ENABLE_LEA: "true" })
      const file = join(outputDir, "manifest.json")
      const manifest = JSON.parse(await readFile(file, "utf8"))
      await writeFile(file, JSON.stringify({ ...manifest, mode: "proxy" }))
    }

    it("uses the content already in place, unchanged", async () => {
      await writeProxyContent()
      const before = await readFile(
        join(outputDir, "discovery.en.json"),
        "utf8",
      )

      const { stdout } = await fetchStaticContent(prebuilt)

      expect(stdout).toContain("static-content: using prebuilt content")
      expect(await readFile(join(outputDir, "discovery.en.json"), "utf8")).toBe(
        before,
      )
    })

    it("fails without the content, writing nothing", async () => {
      const error = await fetchStaticContent(prebuilt).catch(
        (e: { stderr: string }) => e,
      )
      expect(error.stderr).toContain(
        "static-content: failed: STATIC_CONTENT_MODE=prebuilt found no content",
      )
      expect(await readdir(root)).toEqual([])
    })

    it("fails on content that wasn't fetched from the CMS", async () => {
      await fetchStaticContent({ NEXT_PUBLIC_ENABLE_LEA: "true" })

      const error = await fetchStaticContent(prebuilt).catch(
        (e: { stderr: string }) => e,
      )
      expect(error.stderr).toContain("was written in mock mode, not proxy")
    })

    it("fails on content missing a locale file", async () => {
      await writeProxyContent()
      await rm(join(outputDir, "discovery.ga.json"))

      const error = await fetchStaticContent(prebuilt).catch(
        (e: { stderr: string }) => e,
      )
      expect(error.stderr).toContain("discovery.ga.json")
    })
  })
})
