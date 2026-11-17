import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FullConfig } from "@playwright/test"

// Next's default build dir, which the app's own server uses
const DEFAULT_DIST_DIR = ".next"

const NEXT_ENV = path.join(__dirname, "..", "..", "next-env.d.ts")

/**
 * `next dev` writes its build dir into the tracked `next-env.d.ts`
 * (`./.next/flags/dev/types/...`). Point it back at `./.next/dev/types/...`
 * so a flags run leaves the tree clean.
 */
export default async function restoreNextEnv(
  config: FullConfig,
): Promise<void> {
  // The flags server's build dir, as the config hands it to `next dev`
  const flagsDistDir = config.webServer?.env?.CITIZEN_PORTAL_DIST_DIR
  if (!flagsDistDir) {
    return
  }

  const content = await readFile(NEXT_ENV, "utf8")
  const restored = content.replaceAll(
    `./${flagsDistDir}/`,
    `./${DEFAULT_DIST_DIR}/`,
  )
  await writeFile(NEXT_ENV, restored)
}
