// Runs under Node's type stripping: relative `.ts` imports only (no `@/`
// alias) and no non-erasable TypeScript such as enums.
import { isLeaEnabled } from "../../src/lib/feature-config.ts"
import { ConfigError, MOCK_FIXTURES_DIR, readConfig } from "./config.ts"
import { buildDiscoveryContent, formatIssue } from "./pipeline/index.ts"
import { ContentFetchError, createMockTransport } from "./wagtail/index.ts"
import { writeStaticContent } from "./write.ts"

async function main(): Promise<number> {
  // Flag off, the discovery routes aren't built, so their content mustn't be
  // able to fail the build (ADR §7).
  if (!isLeaEnabled()) {
    console.log("static-content: skipped, NEXT_PUBLIC_ENABLE_LEA is off")
    return 0
  }

  const config = readConfig(process.env)
  console.log(
    `static-content: fetching discovery content (mode=${config.mode})`,
  )

  const { content, issues } = await buildDiscoveryContent({
    transport: createMockTransport(MOCK_FIXTURES_DIR),
    indexPageId: config.indexPageId,
  })

  for (const warning of issues.warnings) {
    console.warn(`static-content: warning: ${formatIssue(warning)}`)
  }
  if (!content) {
    for (const error of issues.errors) {
      console.error(`static-content: error: ${formatIssue(error)}`)
    }
    console.error(
      `static-content: ${issues.errors.length} content error(s); nothing written`,
    )
    return 1
  }

  const written = await writeStaticContent({
    outputDir: config.outputDir,
    mode: config.mode,
    content,
  })
  for (const file of written) console.log(`static-content: wrote ${file}`)
  return 0
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    const message =
      error instanceof ConfigError || error instanceof ContentFetchError
        ? error.message
        : error instanceof Error
          ? (error.stack ?? error.message)
          : String(error)
    console.error(`static-content: failed: ${message}`)
    process.exitCode = 1
  },
)
