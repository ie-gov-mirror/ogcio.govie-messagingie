import { exec, execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import { parse as parseYaml } from "yaml"

const execAsync = promisify(exec)

interface PackageRules {
  /** Applies to all workspace packages. */
  global: string[]
  /** Applies only to deps found in specific workspace packages (by package.json name). */
  scoped: Record<string, string[]>
}

/**
 * Packages that should NEVER be upgraded automatically.
 *
 * - `global`: skipped everywhere
 * - `scoped`: skipped only when found in the listed workspace packages
 */
const SKIP: PackageRules = {
  global: [
    "@logto/node",
    "@logto/react",
    "@logto/next",
    "@ogcio/design-system-react",
    "@ogcio/theme-govie",
  ],
  scoped: {
    // Example:
    // "@govie-services/profile-api": ["pg"],
    "messaging-next": ["@ogcio/consent"],
  },
}

/**
 * Packages that should only be upgraded within their current semver range
 * (i.e. `pnpm update` without `--latest`).
 *
 * - `global`: semver-only everywhere
 * - `scoped`: semver-only when found in the listed workspace packages
 */
const SEMVER_ONLY: PackageRules = {
  global: [
    "next",
    "react",
    "react-dom",
    "next-intl",
    "zod",
    "@types/react",
    "@types/react-dom",
    "@ogcio/nextjs-logging-wrapper",
    "@fastify/type-provider-typebox",
    "@tanstack/react-table",
    "@tanstack/table-core",
    "typescript",
  ],
  scoped: {
    "messaging-next": ["use-intl"],
    "messaging-admin-next": ["use-intl"],
    // Example:
    // "@govie-services/profile": ["swr"],
  },
}

function isRuleMatch(
  rules: PackageRules,
  dep: string,
  pkgName: string,
): boolean {
  if (rules.global.includes(dep)) return true
  return rules.scoped[pkgName]?.includes(dep) ?? false
}

function readWorkspaceConfig(root: string): {
  minimumReleaseAge: number | null
  ageExclude: string[]
} {
  const wsPath = path.join(root, "pnpm-workspace.yaml")
  if (!fs.existsSync(wsPath)) return { minimumReleaseAge: null, ageExclude: [] }

  const config = parseYaml(fs.readFileSync(wsPath, "utf-8"))
  const age =
    typeof config?.minimumReleaseAge === "number"
      ? config.minimumReleaseAge
      : null
  const exclude = Array.isArray(config?.minimumReleaseAgeExclude)
    ? config.minimumReleaseAgeExclude
    : []

  return { minimumReleaseAge: age, ageExclude: exclude }
}

/** Max concurrent registry lookups. */
const CONCURRENCY = 15

function run(cmd: string) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: "inherit" })
}

function tryRun(cmd: string): boolean {
  try {
    run(cmd)
    return true
  } catch {
    return false
  }
}

function isLocalVersion(version: string): boolean {
  return (
    version.startsWith("workspace:") ||
    version.startsWith("link:") ||
    version.startsWith("file:")
  )
}

function matchesGlob(name: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
  return new RegExp(`^${escaped}$`).test(name)
}

function findWorkspacePackageJsons(root: string): string[] {
  const targets = ["apps", "packages"]
  const results: string[] = []

  for (const target of targets) {
    const base = path.join(root, target)
    if (!fs.existsSync(base)) continue

    for (const entry of fs.readdirSync(base)) {
      const fullPath = path.join(base, entry)
      if (fullPath.includes("node_modules")) continue

      const pkgJsonPath = path.join(fullPath, "package.json")
      if (fs.existsSync(pkgJsonPath)) results.push(pkgJsonPath)
    }
  }

  return results
}

function collectUniqueDeps(packageJsonFiles: string[]): {
  latest: Set<string>
  semverOnly: Set<string>
} {
  const latest = new Set<string>()
  const semverOnly = new Set<string>()

  for (const file of packageJsonFiles) {
    const pkg = JSON.parse(fs.readFileSync(file, "utf-8"))
    const pkgName: string = pkg.name ?? ""
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

    for (const [dep, ver] of Object.entries(allDeps)) {
      if (isRuleMatch(SKIP, dep, pkgName)) continue
      if (isLocalVersion(String(ver))) continue

      if (isRuleMatch(SEMVER_ONLY, dep, pkgName)) {
        semverOnly.add(dep)
      } else {
        latest.add(dep)
      }
    }
  }

  // A dep that is semver-only in one package but latest-eligible in another
  // should not appear in both sets — keep it as latest only.
  for (const dep of latest) {
    semverOnly.delete(dep)
  }

  return { latest, semverOnly }
}

async function isLatestMature(
  pkg: string,
  minimumReleaseAge: number,
  ageExclude: string[],
): Promise<boolean> {
  if (ageExclude.some((p) => matchesGlob(pkg, p))) return true

  try {
    const { stdout } = await execAsync(`npm view ${pkg} --json`, {
      timeout: 30_000,
    })
    const info = JSON.parse(stdout)
    const latest = info.version
    const publishDate = info.time?.[latest]
    if (!publishDate) return false

    const ageSeconds = (Date.now() - new Date(publishDate).getTime()) / 1000
    return ageSeconds >= minimumReleaseAge
  } catch {
    console.log(`  Could not check age for ${pkg}, skipping`)
    return false
  }
}

async function filterMature(
  deps: Set<string>,
  minimumReleaseAge: number,
  ageExclude: string[],
): Promise<string[]> {
  const all = [...deps]
  const eligible: string[] = []
  const skipped: string[] = []

  for (let i = 0; i < all.length; i += CONCURRENCY) {
    const batch = all.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (dep) => ({
        dep,
        ok: await isLatestMature(dep, minimumReleaseAge, ageExclude),
      })),
    )

    for (const { dep, ok } of results) {
      if (ok) eligible.push(dep)
      else skipped.push(dep)
    }

    const done = Math.min(i + CONCURRENCY, all.length)
    process.stdout.write(`\r  Checked ${done}/${all.length} packages`)
  }

  console.log()

  if (skipped.length) {
    console.log(
      `\nSkipped (too recent or unreachable):\n  ${skipped.join("\n  ")}`,
    )
  }

  return eligible
}

async function main() {
  const root = process.cwd()
  const { minimumReleaseAge, ageExclude } = readWorkspaceConfig(root)

  const packageJsonFiles = [
    path.join(root, "package.json"),
    ...findWorkspacePackageJsons(root),
  ]

  console.log("Collecting dependencies...")
  const { latest, semverOnly } = collectUniqueDeps(packageJsonFiles)
  console.log(
    `Found ${latest.size} deps for latest, ${semverOnly.size} for semver-only\n`,
  )

  let eligible: string[]

  if (minimumReleaseAge !== null) {
    console.log(
      `Checking release ages (minimumReleaseAge: ${minimumReleaseAge}s)...`,
    )
    eligible = await filterMature(latest, minimumReleaseAge, ageExclude)
    console.log(`\n${eligible.length} deps eligible for latest update\n`)
  } else {
    console.log("No minimumReleaseAge set, skipping age check\n")
    eligible = [...latest]
  }

  if (eligible.length > 0) {
    console.log("Trying batch update to latest...")
    const batchOk = tryRun(
      `pnpm update --recursive --latest ${eligible.join(" ")}`,
    )

    if (!batchOk) {
      console.log(
        "\nBatch update failed (likely a transitive dep blocked by minimumReleaseAge).",
      )
      console.log("Falling back to one-by-one updates...\n")

      const failed: string[] = []
      const total = eligible.length
      let current = 0
      for (const dep of eligible) {
        console.log(`Updating ${dep} (${++current}/${total})...`)
        if (!tryRun(`pnpm update --recursive --latest ${dep}`)) {
          failed.push(dep)
        }
      }

      if (failed.length > 0) {
        console.log(
          `\nFailed to update (transitive deps too recent):\n  ${failed.join("\n  ")}`,
        )
      }
    }
  }

  if (semverOnly.size > 0) {
    const semverPkgs = [...semverOnly].join(" ")
    console.log(
      `\nUpdating ${semverOnly.size} semver-only deps within range...`,
    )
    tryRun(`pnpm update --recursive ${semverPkgs}`)
  }

  run("pnpm dedupe")
  console.log("\nDone")
}

main()
