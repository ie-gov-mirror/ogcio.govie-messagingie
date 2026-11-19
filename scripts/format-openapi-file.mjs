// Formats one OpenAPI file the same way `pnpm format` does (`biome check --write`).
// Called after a dev server writes the raw swagger YAML. Production images do
// not ship this script; callers skip it when it is absent.
import { execFile } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

const file = process.argv[2]
if (!file) {
  process.stderr.write("usage: format-openapi-file.mjs <file>\n")
  process.exit(1)
}

const biome = join(
  dirname(require.resolve("@biomejs/biome/package.json")),
  "bin/biome",
)

await execFileAsync(biome, ["check", "--write", file])
