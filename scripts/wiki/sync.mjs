#!/usr/bin/env node
// Publishes the Wiki docs (docs/wiki/** + root GLOSSARY.md) into the
// configured subtree of the ADO wiki git repo. Refuses to destroy a
// wiki-side edit: any wiki commit touching the subtree since the last sync
// marker is a Sync conflict, and the script fails loudly with the diff
// instead of pushing.
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { checkPageNames } from "./page-names.mjs"
import {
  buildSyncCommitMessage,
  GLOSSARY_FILE_NAME,
  GLOSSARY_PAGE_NAME,
  gitAuthEnv,
  listFiles,
  parseCliArgs,
  resolveRepo,
  resolveSubtree,
  SYNC_MARKER_TRAILER,
} from "./paths.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT_DEFAULT = join(__dirname, "..", "..")

function parseArgs(argv) {
  return {
    root: REPO_ROOT_DEFAULT,
    bootstrap: false,
    ...parseCliArgs(argv, {
      valueFlags: {
        "--repo": "repo",
        "--subtree": "subtree",
        "--root": "root",
        "--source-sha": "sourceSha",
      },
      boolFlags: ["--bootstrap"],
    }),
  }
}

function git(cwd, gitArgs, env) {
  return execFileSync("git", gitArgs, { cwd, encoding: "utf8", env })
}

// Scoped to the subtree so a marker from a previously-configured (moved)
// subtree never counts as "already synced" for the current one.
function findLastSyncCommit(wikiDir, subtree) {
  let sha
  try {
    sha = execFileSync(
      "git",
      // Scoped to HEAD's ancestry, not --all: a marker on a ref outside the
      // branch being pushed makes the "commits since last sync" range
      // meaningless, which can hide a wiki-side edit.
      [
        "log",
        "-1",
        `--grep=${SYNC_MARKER_TRAILER}:`,
        "--format=%H",
        "--",
        subtree,
      ],
      // stderr silenced: an empty wiki's unborn HEAD is an expected path
      // here, and git's "fatal:" for it would read as a real failure.
      { cwd: wikiDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim()
  } catch {
    // An empty wiki has an unborn HEAD, which `git log` treats as fatal
    // rather than "no matches". No commits means no marker.
    return null
  }
  return sha || null
}

function commitsTouchingSubtree(wikiDir, range, subtree) {
  return git(wikiDir, ["log", "--oneline", range, "--", subtree])
    .split("\n")
    .filter(Boolean)
}

// Builds the generated subtree content in place: docs/wiki/** copied verbatim
// 1:1, plus root GLOSSARY.md as the Glossary page. Pages go up byte-for-byte as
// they are in the repo, so what a wiki reader sees is what is committed.
function writeGeneratedSubtree(subtreeDir, root) {
  mkdirSync(subtreeDir, { recursive: true })

  const docsWikiDir = join(root, "docs", "wiki")
  if (existsSync(docsWikiDir)) {
    for (const file of listFiles(docsWikiDir)) {
      const relPath = relative(docsWikiDir, file)
      const target = join(subtreeDir, relPath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, readFileSync(file))
    }
  }

  const contextFile = join(root, GLOSSARY_FILE_NAME)
  if (existsSync(contextFile)) {
    writeFileSync(
      join(subtreeDir, GLOSSARY_PAGE_NAME),
      readFileSync(contextFile),
    )
  }
}

export function runSync({ repo, subtree, root, sourceSha, bootstrap } = {}) {
  const resolvedRepo = resolveRepo(repo)
  const resolvedSubtree = resolveSubtree(subtree)
  const resolvedRoot = root || REPO_ROOT_DEFAULT
  const resolvedSha =
    sourceSha || git(resolvedRoot, ["rev-parse", "HEAD"]).trim()

  // Before any network work: a filename ADO rejects would publish as a broken
  // or unreachable page, and the push is the expensive half to undo.
  const nameProblems = checkPageNames(resolvedRoot, resolvedSubtree)
  if (nameProblems.length > 0) {
    throw new Error(
      `${nameProblems.length} docs/wiki filename(s) break Azure DevOps wiki rules:\n` +
        nameProblems.map((p) => `  ${p}`).join("\n") +
        "\n\nNothing was changed. Run `pnpm wiki:check` for the full list.",
    )
  }

  const gitEnv = { ...process.env, ...gitAuthEnv() }

  const tmp = mkdtempSync(join(tmpdir(), "wiki-sync-"))
  try {
    console.log(`Cloning wiki to sync "${resolvedSubtree}" ...`)
    // Full history, deliberately: findLastSyncCommit walks it for the sync
    // marker, so a shallow clone would silently lose conflict detection.
    // Sparse, though — only the target subtree is materialised, instead of
    // checking out every page and attachment in the programme wiki. Paths
    // outside the cone stay SKIP_WORKTREE in the index, so the commit still
    // carries the whole tree and sibling subtrees are untouched.
    // stdio inherited (and no --quiet) so the clone reports progress instead
    // of looking hung, and so git can prompt for credentials if it needs to.
    execFileSync(
      "git",
      [
        "clone",
        "--filter=blob:none",
        "--sparse",
        "--progress",
        resolvedRepo,
        tmp,
      ],
      { stdio: "inherit", env: gitEnv },
    )
    execFileSync(
      "git",
      ["-C", tmp, "sparse-checkout", "set", resolvedSubtree],
      {
        stdio: "inherit",
        env: gitEnv,
      },
    )
    const branch = git(tmp, ["symbolic-ref", "--short", "HEAD"]).trim()

    const lastSyncCommit = findLastSyncCommit(tmp, resolvedSubtree)
    if (!lastSyncCommit) {
      if (!bootstrap) {
        throw new Error(
          "No sync marker found in the wiki history — this looks like the " +
            'first sync (or the target subtree moved). Pass --bootstrap to write "' +
            `${resolvedSubtree}" for the first time. Nothing was changed.`,
        )
      }
    } else {
      const range = `${lastSyncCommit}..HEAD`
      const conflicting = commitsTouchingSubtree(tmp, range, resolvedSubtree)
      if (conflicting.length > 0) {
        const diff = git(tmp, ["diff", range, "--", resolvedSubtree], gitEnv)
        throw new Error(
          "Sync conflict: the wiki subtree has been edited since the last sync.\n\n" +
            `Conflicting commit(s):\n${conflicting.join("\n")}\n\n${diff}`,
        )
      }
    }

    const subtreeDir = join(tmp, resolvedSubtree)
    if (existsSync(subtreeDir))
      rmSync(subtreeDir, { recursive: true, force: true })
    writeGeneratedSubtree(subtreeDir, resolvedRoot)

    git(tmp, ["add", "-A", "--", resolvedSubtree])
    const status = git(tmp, [
      "status",
      "--porcelain",
      "--",
      resolvedSubtree,
    ]).trim()
    if (!status) {
      console.log("Wiki already up to date; nothing to sync.")
      return
    }

    git(tmp, ["commit", "--quiet", "-m", buildSyncCommitMessage(resolvedSha)])
    console.log(`Pushing to ${branch} ...`)
    execFileSync("git", ["push", "--progress", "origin", `HEAD:${branch}`], {
      cwd: tmp,
      stdio: "inherit",
      env: gitEnv,
    })
    console.log(`Synced ${resolvedSubtree} from ${resolvedSha}.`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2))
    runSync(args)
  } catch (error) {
    console.error(`wiki:sync failed: ${error.message}`)
    process.exit(1)
  }
}
