// Shared fixtures for the wiki CLI tests. Deliberately not named *.test.mjs
// so `node --test scripts/wiki/*.test.mjs` doesn't try to run it as a suite.
// Everything here drives real git against a local bare repo standing in for
// the ADO wiki — no network, no mocks.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { buildSyncCommitMessage } from "./paths.mjs"

export function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" })
}

// One temp workspace per suite; freshDir hands out numbered subdirectories so
// fixtures from different tests can never collide.
export function createWorkspace(name) {
  const workDir = mkdtempSync(join(tmpdir(), `${name}-`))
  let counter = 0
  return {
    workDir,
    freshDir(label) {
      const dir = join(workDir, `${counter++}-${label}`)
      mkdirSync(dir, { recursive: true })
      return dir
    },
    cleanup() {
      rmSync(workDir, { recursive: true, force: true })
    },
  }
}

export function initBareWiki(freshDir) {
  const bare = freshDir("wiki-bare.git")
  git(bare, ["init", "--bare", "--quiet"])
  return bare
}

function writeAll(base, relPathToContent) {
  for (const [relPath, content] of Object.entries(relPathToContent)) {
    const target = join(base, relPath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

// Seeds the empty bare wiki with `pages` under `subtree`. When `sourceSha` is
// given the seed commit carries a sync marker, so the wiki looks as though a
// prior sync produced it; otherwise it is a plain pre-existing wiki.
export function seedWiki(freshDir, bare, subtree, pages, sourceSha) {
  const scratch = freshDir("wiki-seed")
  git(scratch, ["init", "--quiet"])
  git(scratch, ["config", "user.email", "test@example.com"])
  git(scratch, ["config", "user.name", "Test"])
  git(scratch, ["checkout", "--quiet", "-b", "main"])
  writeAll(join(scratch, subtree), pages)
  git(scratch, ["add", "."])
  git(scratch, [
    "commit",
    "--quiet",
    "-m",
    sourceSha ? buildSyncCommitMessage(sourceSha) : "seed",
  ])
  git(scratch, ["remote", "add", "origin", bare])
  git(scratch, ["push", "--quiet", "origin", "main"])
  git(bare, ["symbolic-ref", "HEAD", "refs/heads/main"])
}

// Clones the seeded bare wiki and pushes an extra commit directly, as a wiki
// editor would, touching whatever paths are given.
export function editWikiDirectly(
  freshDir,
  bare,
  relPathToContent,
  message = "wiki edit",
) {
  const scratch = freshDir("wiki-edit")
  git(scratch, ["clone", "--quiet", bare, "."])
  git(scratch, ["config", "user.email", "editor@example.com"])
  git(scratch, ["config", "user.name", "Editor"])
  writeAll(scratch, relPathToContent)
  git(scratch, ["add", "."])
  git(scratch, ["commit", "--quiet", "-m", message])
  git(scratch, ["push", "--quiet", "origin", "main"])
}

// A stand-in for this repo: docs/wiki/** plus the root GLOSSARY.md that sync
// maps to the Glossary page.
export function initSourceRoot(
  freshDir,
  wikiPages = {},
  context = "# Domain glossary\n",
) {
  const root = freshDir("repo-root")
  const docsWikiDir = join(root, "docs", "wiki")
  mkdirSync(docsWikiDir, { recursive: true })
  writeAll(docsWikiDir, wikiPages)
  writeFileSync(join(root, "GLOSSARY.md"), context)
  return root
}

export function readWikiFile(bare, subtree, relPath) {
  return git(bare, ["show", `HEAD:${join(subtree, relPath)}`])
}
