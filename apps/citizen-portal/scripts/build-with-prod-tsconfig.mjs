#!/usr/bin/env node

/**
 * Build script that uses tsconfig.prod.json for production builds
 * Merges the exclude patterns from tsconfig.prod.json into tsconfig.json
 *
 * This mirrors the per-zone script the messages/profile/dashboard zones
 * ship today. Once the zones are deleted in Phase E, this becomes the
 * single source of truth for citizen-portal production builds.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const appDir = join(__dirname, "..")

const tsconfigPath = join(appDir, "tsconfig.json")
const tsconfigProdPath = join(appDir, "tsconfig.prod.json")
const tsconfigBackupPath = join(appDir, "tsconfig.json.backup")

try {
  if (!existsSync(tsconfigProdPath)) {
    console.error("Error: tsconfig.prod.json not found")
    process.exit(1)
  }

  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"))
  const tsconfigProd = JSON.parse(readFileSync(tsconfigProdPath, "utf-8"))

  writeFileSync(tsconfigBackupPath, JSON.stringify(tsconfig, null, 2))

  if (tsconfigProd.exclude) {
    tsconfig.exclude = tsconfigProd.exclude
  }

  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2))

  console.log("✓ Updated tsconfig.json with production excludes")

  const { execSync } = await import("node:child_process")
  execSync("pnpm run build", {
    stdio: "inherit",
    cwd: appDir,
  })
} catch (error) {
  console.error("Build failed:", error)
  process.exit(1)
} finally {
  if (existsSync(tsconfigBackupPath)) {
    const original = readFileSync(tsconfigBackupPath, "utf-8")
    writeFileSync(tsconfigPath, original)
    const { unlinkSync } = await import("node:fs")
    unlinkSync(tsconfigBackupPath)
    console.log("✓ Restored original tsconfig.json")
  }
}
