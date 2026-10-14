#!/usr/bin/env node
// CI drift guard: regenerate every spec into a temp file and fail if the
// committed output differs from a fresh run. Keeps the checked-in `*.d.ts`
// honest without depending on git state.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** Each committed output paired with the spec it is generated from. */
const SPECS = [
  {
    name: "messaging",
    spec: resolve(pkgRoot, "../../apps/messaging-api/openapi-definition.yml"),
    out: resolve(pkgRoot, "src/messaging.d.ts"),
  },
  {
    name: "profile",
    spec: resolve(pkgRoot, "../../apps/profile-api/openapi-definition.yml"),
    out: resolve(pkgRoot, "src/profile.d.ts"),
  },
  {
    name: "upload",
    spec: resolve(pkgRoot, "../../apps/upload-api/openapi-definition.yml"),
    out: resolve(pkgRoot, "src/upload.d.ts"),
  },
  {
    name: "scheduler",
    spec: resolve(pkgRoot, "../../apps/scheduler-api/openapi-definition.yml"),
    out: resolve(pkgRoot, "src/scheduler.d.ts"),
  },
]

const tmp = mkdtempSync(join(tmpdir(), "api-types-drift-"))
let drift = false

try {
  for (const { name, spec, out } of SPECS) {
    const fresh = join(tmp, `${name}.d.ts`)
    execFileSync("openapi-typescript", [spec, "-o", fresh], {
      cwd: pkgRoot,
      stdio: ["ignore", "ignore", "inherit"],
    })

    let committed = ""
    try {
      committed = readFileSync(out, "utf8")
    } catch {
      console.error(
        `[api-types] Missing committed output for "${name}": ${out}\n` +
          `Run "pnpm --filter @ogcio/api-types codegen".`,
      )
      drift = true
      continue
    }

    if (readFileSync(fresh, "utf8") !== committed) {
      console.error(
        `[api-types] Drift detected for "${name}". The committed ${out} is ` +
          `out of date with ${spec}.\n` +
          `Run "pnpm --filter @ogcio/api-types codegen" and commit the result.`,
      )
      drift = true
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

if (drift) process.exit(1)
console.log("[api-types] Generated types are up to date.")
