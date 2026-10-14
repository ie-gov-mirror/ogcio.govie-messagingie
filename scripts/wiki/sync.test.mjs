// E2E tests for the wiki sync script — driven through the CLI against a
// local bare git repo standing in for the ADO wiki. No network, no mocks of
// git.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"
import { buildSyncCommitMessage, SYNC_MARKER_TRAILER } from "./paths.mjs"
import { runSync } from "./sync.mjs"
import {
  createWorkspace,
  editWikiDirectly as editWikiDirectlyIn,
  git,
  initBareWiki as initBareWikiIn,
  initSourceRoot as initSourceRootIn,
  readWikiFile,
  seedWiki,
} from "./test-helpers.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYNC_SCRIPT = join(__dirname, "sync.mjs")
const PULL_SCRIPT = join(__dirname, "pull.mjs")

let ws

before(() => {
  ws = createWorkspace("wiki-sync-test")
})

after(() => {
  ws.cleanup()
})

const freshDir = (label) => ws.freshDir(label)
const initBareWiki = () => initBareWikiIn(freshDir)
const initSourceRoot = (pages, context) =>
  context === undefined
    ? initSourceRootIn(freshDir, pages)
    : initSourceRootIn(freshDir, pages, context)
const editWikiDirectly = (bare, files, message) =>
  editWikiDirectlyIn(freshDir, bare, files, message)
const seedSyncedWiki = (bare, subtree, pages, sourceSha = "0".repeat(40)) =>
  seedWiki(freshDir, bare, subtree, pages, sourceSha)

function runSyncCli(root, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [SYNC_SCRIPT, "--root", root, "--source-sha", "a".repeat(40), ...extraArgs],
    { encoding: "utf8" },
  )
}

function runPullCli(root, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [PULL_SCRIPT, "--root", root, ...extraArgs],
    { encoding: "utf8" },
  )
}

test("first sync without --bootstrap is refused when no sync marker exists", () => {
  const bare = initBareWiki()
  const root = initSourceRoot({ "metrics-coverage.md": "# Metrics\n" })

  const result = runSyncCli(root, ["--repo", bare, "--subtree", "Team/Docs"])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /bootstrap/i)
})

test("clean first sync with --bootstrap creates pages and a sync-marker commit", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  const root = initSourceRoot(
    { "metrics-coverage.md": "# Metrics coverage\n" },
    "# Domain glossary\n",
  )

  const result = runSyncCli(root, [
    "--repo",
    bare,
    "--subtree",
    subtree,
    "--bootstrap",
  ])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readWikiFile(bare, subtree, "metrics-coverage.md"),
    "# Metrics coverage\n",
  )
  assert.equal(readWikiFile(bare, subtree, "Glossary.md"), "# Domain glossary\n")
  const log = git(bare, ["log", "-1", "--format=%B"])
  assert.match(log, new RegExp(`${SYNC_MARKER_TRAILER}: ${"a".repeat(40)}`))
})

test("incremental sync creates, updates, and deletes pages", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  seedSyncedWiki(bare, subtree, {
    "kept.md": "old kept\n",
    "removed.md": "going away\n",
  })

  const root = initSourceRoot({
    "kept.md": "new kept\n",
    "added.md": "brand new\n",
  })
  const result = runSyncCli(root, ["--repo", bare, "--subtree", subtree])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readWikiFile(bare, subtree, "kept.md"), "new kept\n")
  assert.equal(readWikiFile(bare, subtree, "added.md"), "brand new\n")
  assert.throws(() => readWikiFile(bare, subtree, "removed.md"))
})

test("immediate second sync with no repo changes is a no-op (no empty commit)", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  const root = initSourceRoot({ "page.md": "content\n" })

  const first = runSyncCli(root, [
    "--repo",
    bare,
    "--subtree",
    subtree,
    "--bootstrap",
  ])
  assert.equal(first.status, 0, first.stderr)
  const shaAfterFirst = git(bare, ["rev-parse", "HEAD"]).trim()

  const second = runSyncCli(root, ["--repo", bare, "--subtree", subtree])
  assert.equal(second.status, 0, second.stderr)
  assert.equal(git(bare, ["rev-parse", "HEAD"]).trim(), shaAfterFirst)
})

test("sync conflict: a wiki-side edit to the subtree since the last sync fails loudly with the diff", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  seedSyncedWiki(bare, subtree, { "page.md": "original\n" })
  editWikiDirectly(bare, {
    [join(subtree, "page.md")]: "edited on the wiki\n",
  })

  const root = initSourceRoot({ "page.md": "new content from repo\n" })
  const before = git(bare, ["rev-parse", "HEAD"]).trim()
  const result = runSyncCli(root, ["--repo", bare, "--subtree", subtree])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /conflict/i)
  assert.match(result.stderr, /edited on the wiki/)
  assert.equal(git(bare, ["rev-parse", "HEAD"]).trim(), before)
})

test("moved subtree: a sync marker recorded under the old subtree does not count as already-synced", () => {
  const bare = initBareWiki()
  // A prior sync ran against a different (old) subtree path.
  seedSyncedWiki(bare, "Old/Docs", { "page.md": "old\n" })

  const root = initSourceRoot({ "page.md": "content\n" })
  const result = runSyncCli(root, ["--repo", bare, "--subtree", "New/Docs"])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /bootstrap/i)
})

test("refuses a filename ADO rejects, before touching the wiki", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  seedSyncedWiki(bare, subtree, { "page.md": "original\n" })
  const before = git(bare, ["rev-parse", "HEAD"]).trim()

  const root = initSourceRoot({ "Has Space.md": "content\n" })
  const result = runSyncCli(root, ["--repo", bare, "--subtree", subtree])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /break Azure DevOps wiki rules/i)
  assert.match(result.stderr, /Has Space\.md/)
  assert.equal(git(bare, ["rev-parse", "HEAD"]).trim(), before)
})

// sync replaces whatever subtree it resolves to, so a degenerate value must
// stop before the clone rather than defaulting or targeting the repo root.
for (const badSubtree of [".", "/", "", "./", "a/../..", "  "]) {
  test(`refuses subtree ${JSON.stringify(badSubtree)} and leaves the wiki untouched`, () => {
    const bare = initBareWiki()
    seedSyncedWiki(bare, "Team/Docs", { "page.md": "original\n" })
    const before = git(bare, ["rev-parse", "HEAD"]).trim()

    const root = initSourceRoot({ "page.md": "updated\n" })
    const result = runSyncCli(root, [
      "--repo",
      bare,
      "--subtree",
      badSubtree,
      "--bootstrap",
    ])

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /must name a path inside the wiki/i)
    assert.equal(git(bare, ["rev-parse", "HEAD"]).trim(), before)
  })
}

test("a sync marker on a ref outside the pushed branch does not mask a wiki edit", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  seedSyncedWiki(bare, subtree, { "page.md": "original\n" })

  // A wiki-side edit on main — the conflict the sync must catch.
  editWikiDirectly(bare, {
    [`${subtree}/page.md`]: "edited on the wiki\n",
  })

  // An abandoned branch carries a newer sync marker whose ancestry already
  // contains that edit, so searching every ref would find nothing since it.
  const stray = freshDir("wiki-stray")
  git(stray, ["clone", "--quiet", bare, "."])
  git(stray, ["config", "user.email", "stray@example.com"])
  git(stray, ["config", "user.name", "Stray"])
  git(stray, ["checkout", "--quiet", "-b", "abandoned"])
  writeFileSync(join(stray, subtree, "page.md"), "stray\n")
  git(stray, ["add", "."])
  git(stray, [
    "commit",
    "--quiet",
    "-m",
    buildSyncCommitMessage("1".repeat(40)),
  ])
  git(stray, ["push", "--quiet", "origin", "abandoned"])

  const root = initSourceRoot({ "page.md": "updated\n" })
  const result = runSyncCli(root, ["--repo", bare, "--subtree", subtree])

  assert.notEqual(result.status, 0, "expected a sync conflict")
  assert.match(`${result.stdout}${result.stderr}`, /conflict/i)
})

test("a wiki commit outside the subtree is not a conflict", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  seedSyncedWiki(bare, subtree, { "page.md": "original\n" })
  editWikiDirectly(bare, {
    "Release Notes/Life Events/MessagingIE.md": "release notes\n",
  })

  const root = initSourceRoot({ "page.md": "updated\n" })
  const result = runSyncCli(root, ["--repo", bare, "--subtree", subtree])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readWikiFile(bare, subtree, "page.md"), "updated\n")
})

test("sibling subtree content is untouched by sync", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  seedSyncedWiki(bare, subtree, { "page.md": "original\n" })
  editWikiDirectly(bare, {
    "Release Notes/Life Events/MessagingIE.md": "release notes\n",
  })

  const root = initSourceRoot({ "page.md": "updated\n" })
  const result = runSyncCli(root, ["--repo", bare, "--subtree", subtree])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    git(bare, ["show", "HEAD:Release Notes/Life Events/MessagingIE.md"]),
    "release notes\n",
  )
})

test("round-trip: sync then pull reproduces docs/wiki and GLOSSARY.md exactly", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  const root = initSourceRoot(
    {
      "metrics-coverage.md": "# Metrics coverage\n",
      "observability/usage-dashboards.md": "# Usage dashboards\n",
    },
    "# Domain glossary\n",
  )

  const syncResult = runSyncCli(root, [
    "--repo",
    bare,
    "--subtree",
    subtree,
    "--bootstrap",
  ])
  assert.equal(syncResult.status, 0, syncResult.stderr)

  const pulledRoot = initSourceRoot()
  const pullResult = runPullCli(pulledRoot, [
    "--repo",
    bare,
    "--subtree",
    subtree,
  ])
  assert.equal(pullResult.status, 0, pullResult.stderr)

  assert.equal(
    readFileSync(
      join(pulledRoot, "docs", "wiki", "metrics-coverage.md"),
      "utf8",
    ),
    "# Metrics coverage\n",
  )
  assert.equal(
    readFileSync(
      join(pulledRoot, "docs", "wiki", "observability", "usage-dashboards.md"),
      "utf8",
    ),
    "# Usage dashboards\n",
  )
  assert.equal(
    readFileSync(join(pulledRoot, "GLOSSARY.md"), "utf8"),
    "# Domain glossary\n",
  )
})

test("non-markdown assets (images) are synced verbatim", () => {
  const bare = initBareWiki()
  const subtree = "Team/Docs"
  const root = initSourceRoot({ "diagram.png": "not-really-a-png" })

  const result = runSyncCli(root, [
    "--repo",
    bare,
    "--subtree",
    subtree,
    "--bootstrap",
  ])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readWikiFile(bare, subtree, "diagram.png"), "not-really-a-png")
})

test("exported runSync throws a descriptive error on failure (importable, not just CLI)", () => {
  const bare = initBareWiki()
  const root = initSourceRoot({ "page.md": "content\n" })

  assert.throws(
    () =>
      runSync({
        repo: bare,
        subtree: "Team/Docs",
        root,
        sourceSha: "a".repeat(40),
      }),
    /bootstrap/i,
  )
})
