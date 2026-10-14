// E2E tests for `pnpm wiki:pull` — driven through the CLI against a local
// bare git repo standing in for the ADO wiki. No network, no mocks of git.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"
import { buildAdoWikiUrl, DEFAULT_SUBTREE, gitAuthEnv } from "./paths.mjs"
import {
  createWorkspace,
  editWikiDirectly,
  initBareWiki as initBareWikiIn,
  seedWiki as seedWikiIn,
} from "./test-helpers.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PULL_SCRIPT = join(__dirname, "pull.mjs")

let ws

before(() => {
  ws = createWorkspace("wiki-pull-test")
})

after(() => {
  ws.cleanup()
})

const freshDir = (label) => ws.freshDir(label)
const initBareWiki = () => initBareWikiIn(freshDir)
const seedWiki = (bare, subtree, pages) =>
  seedWikiIn(freshDir, bare, subtree, pages)
const addToWiki = (bare, files) =>
  editWikiDirectly(freshDir, bare, files, "more")

function initRepoRoot({ withExistingWikiFile } = {}) {
  const root = freshDir("repo-root")
  mkdirSync(join(root, "docs", "wiki"), { recursive: true })
  writeFileSync(join(root, "GLOSSARY.md"), "# Old glossary\n")
  if (withExistingWikiFile) {
    writeFileSync(join(root, "docs", "wiki", "stale.md"), "stale content\n")
  }
  return root
}

function runPull(root, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [PULL_SCRIPT, "--root", root, ...extraArgs],
    { encoding: "utf8" },
  )
}

test("pull round-trip: pages, Glossary -> GLOSSARY.md, nesting preserved", () => {
  const bare = initBareWiki()
  const subtree = "MessagingIE/Docs"
  seedWiki(bare, subtree, {
    "metrics-coverage.md": "# Metrics coverage\n",
    "observability/usage-dashboards.md": "# Usage dashboards\n",
    "Glossary.md": "# Domain glossary\n",
  })

  const root = initRepoRoot()
  const result = runPull(root, ["--repo", bare, "--subtree", subtree])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readFileSync(join(root, "docs", "wiki", "metrics-coverage.md"), "utf8"),
    "# Metrics coverage\n",
  )
  assert.equal(
    readFileSync(
      join(root, "docs", "wiki", "observability", "usage-dashboards.md"),
      "utf8",
    ),
    "# Usage dashboards\n",
  )
  assert.equal(
    readFileSync(join(root, "GLOSSARY.md"), "utf8"),
    "# Domain glossary\n",
  )
  assert.ok(!existsSync(join(root, "docs", "wiki", "Glossary.md")))
})

test("pull overwrites docs/wiki/: stale pages no longer on the wiki are removed", () => {
  const bare = initBareWiki()
  const subtree = "MessagingIE/Docs"
  seedWiki(bare, subtree, { "kept.md": "kept\n" })

  const root = initRepoRoot({ withExistingWikiFile: true })
  const result = runPull(root, ["--repo", bare, "--subtree", subtree])

  assert.equal(result.status, 0, result.stderr)
  assert.ok(!existsSync(join(root, "docs", "wiki", "stale.md")))
  assert.equal(
    readFileSync(join(root, "docs", "wiki", "kept.md"), "utf8"),
    "kept\n",
  )
})

test("sibling subtrees (e.g. release notes) are never pulled in", () => {
  const bare = initBareWiki()
  const subtree = "MessagingIE/Docs"
  seedWiki(bare, subtree, { "page.md": "page\n" })
  // Add a sibling page outside the configured subtree in a second commit.
  addToWiki(bare, {
    "Release Notes/Life Events/MessagingIE.md": "release notes\n",
  })

  const root = initRepoRoot()
  const result = runPull(root, ["--repo", bare, "--subtree", subtree])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readFileSync(join(root, "docs", "wiki", "page.md"), "utf8"),
    "page\n",
  )
  assert.ok(!existsSync(join(root, "docs", "wiki", "Release Notes")))
})

test("missing subtree fails loudly and leaves docs/wiki and GLOSSARY.md untouched", () => {
  const bare = initBareWiki()
  seedWiki(bare, "Somewhere/Else", { "page.md": "page\n" })

  const root = initRepoRoot({ withExistingWikiFile: true })
  const result = runPull(root, [
    "--repo",
    bare,
    "--subtree",
    "MessagingIE/Docs",
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /subtree not found/i)
  assert.ok(existsSync(join(root, "docs", "wiki", "stale.md")))
  assert.equal(
    readFileSync(join(root, "GLOSSARY.md"), "utf8"),
    "# Old glossary\n",
  )
})

test("page content is pulled byte-for-byte unchanged", () => {
  const bare = initBareWiki()
  const subtree = "MessagingIE/Docs"
  seedWiki(bare, subtree, {
    "legacy.md": "# Legacy wiki page\nPlain content.\n",
  })

  const root = initRepoRoot()
  const result = runPull(root, ["--repo", bare, "--subtree", subtree])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readFileSync(join(root, "docs", "wiki", "legacy.md"), "utf8"),
    "# Legacy wiki page\nPlain content.\n",
  )
})

test("non-markdown assets (images) are copied verbatim alongside pages", () => {
  const bare = initBareWiki()
  const subtree = "MessagingIE/Docs"
  seedWiki(bare, subtree, { "diagram.png": "not-really-a-png" })

  const root = initRepoRoot()
  const result = runPull(root, ["--repo", bare, "--subtree", subtree])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readFileSync(join(root, "docs", "wiki", "diagram.png"), "utf8"),
    "not-really-a-png",
  )
})

test("default subtree is used when --subtree is omitted", () => {
  const bare = initBareWiki()
  seedWiki(bare, DEFAULT_SUBTREE, {
    "page.md": "default subtree\n",
  })

  const root = initRepoRoot()
  const result = runPull(root, ["--repo", bare])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readFileSync(join(root, "docs", "wiki", "page.md"), "utf8"),
    "default subtree\n",
  )
})

test("buildAdoWikiUrl falls back to the pipeline's ADO coordinates when unset", () => {
  assert.equal(
    buildAdoWikiUrl({}),
    "https://dev.azure.com/OGCIO-Digital-Services/Digital%20Services%20Programme/_git/Digital-Services-Programme.wiki",
  )
})

test("buildAdoWikiUrl honours env overrides and never embeds the PAT", () => {
  const url = buildAdoWikiUrl({
    ADO_BASE_URL: "https://dev.azure.com",
    ADO_ORG: "my-org",
    ADO_PROJECT: "my-project",
    WIKI_NAME: "my.wiki",
    ADO_PAT: "secret-token",
  })

  // The URL reaches git as argv — visible to `ps` and echoed into CI logs on
  // failure — so the credential must never appear in it.
  assert.equal(url, "https://dev.azure.com/my-org/my-project/_git/my.wiki")
  assert.ok(!url.includes("secret-token"))
})

test("gitAuthEnv carries the PAT as a header, not in argv", () => {
  const env = gitAuthEnv({ ADO_PAT: "secret-token" })

  assert.equal(env.GIT_CONFIG_COUNT, "1")
  assert.equal(env.GIT_CONFIG_KEY_0, "http.extraheader")
  assert.equal(
    env.GIT_CONFIG_VALUE_0,
    `Authorization: Basic ${Buffer.from(":secret-token").toString("base64")}`,
  )
})

test("gitAuthEnv is empty without a PAT, so git uses the ambient credential", () => {
  assert.deepEqual(gitAuthEnv({}), {})
})
