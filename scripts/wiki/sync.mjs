#!/usr/bin/env node
// Publishes the Wiki docs (docs/wiki/** + root GLOSSARY.md) into the
// configured subtree of the ADO wiki git repo. Refuses to destroy a
// wiki-side edit: a wiki change to the subtree since the last sync marker
// that the repo does not carry yet is a Sync conflict, and the script fails
// loudly with the diff instead of pushing.
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

function commitsTouching(wikiDir, range, paths) {
  return git(wikiDir, ["log", "--oneline", range, "--", ...paths])
    .split("\n")
    .filter(Boolean)
}

// Repo file published as the wiki page at `relPath` in the subtree, mirroring
// writeGeneratedSubtree: Glossary.md comes from root GLOSSARY.md.
function sourceFileFor(root, relPath) {
  if (relPath === GLOSSARY_PAGE_NAME) {
    return join(root, GLOSSARY_FILE_NAME)
  }
  return join(root, "docs", "wiki", relPath)
}

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file) : null
}

// Wiki file at `rev:path`, or null when it does not exist there. The clone is
// blob:none, so the blob may be fetched on demand: hence `env` for the auth.
function wikiBlobAt(wikiDir, rev, path, env) {
  try {
    return execFileSync("git", ["show", `${rev}:${path}`], {
      cwd: wikiDir,
      env,
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return null
  }
}

function sameContent(a, b) {
  if (a === null || b === null) {
    return a === b
  }
  return a.equals(b)
}

// True when the repo already carries the wiki's edit from `base` to `wiki`:
// merging that edit onto the repo version leaves it unchanged. e.g. the wiki
// fixed line 2 and the repo has that fix plus its own change to line 5.
function carriesWikiEdit(base, wiki, repo, scratchDir) {
  if (sameContent(wiki, repo)) {
    return true
  }
  if (base === null || wiki === null || repo === null) {
    return false
  }

  const files = { repo, base, wiki }
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(scratchDir, name), content)
  }
  try {
    // Non-zero exit (conflicts, binary input) throws: not carried.
    const merged = execFileSync(
      "git",
      ["merge-file", "-p", "repo", "base", "wiki"],
      { cwd: scratchDir, stdio: ["ignore", "pipe", "ignore"] },
    )
    return merged.equals(repo)
  } catch {
    return false
  }
}

// Wiki paths changed since the last sync, each with the path it had at the
// sync marker (the old name for a rename, null for an added page). Rename
// detection reads blobs the blob:none clone may lack: hence `env` for the auth.
//   R100\0old\0new\0  M\0path\0  →  [{ path: old, basePath: old },
//   { path: new, basePath: old }, { path, basePath: path }]
function wikiChanges(wikiDir, range, subtree, env) {
  const fields = git(
    wikiDir,
    ["diff", "--name-status", "-M", "-z", range, "--", subtree],
    env,
  ).split("\0")

  const changes = []
  for (let i = 0; i < fields.length - 1; ) {
    const status = fields[i++]
    if (status.startsWith("R")) {
      const from = fields[i++]
      const to = fields[i++]
      changes.push({ path: from, basePath: from }, { path: to, basePath: from })
      continue
    }
    const path = fields[i++]
    changes.push({ path, basePath: status === "A" ? null : path })
  }
  return changes
}

// Subtree paths whose wiki-side edit since the last sync is not carried by
// what this sync would publish. An edit already pulled into the repo, even
// alongside repo-side changes to the same page, is no longer a conflict.
function unresolvedWikiEdits(wikiDir, lastSyncCommit, subtree, root, env) {
  const scratchDir = mkdtempSync(join(tmpdir(), "wiki-merge-"))
  try {
    const range = `${lastSyncCommit}..HEAD`
    return wikiChanges(wikiDir, range, subtree, env)
      .filter(({ path, basePath }) => {
        const base = basePath
          ? wikiBlobAt(wikiDir, lastSyncCommit, basePath, env)
          : null
        const wiki = readIfExists(join(wikiDir, path))
        const repo = readIfExists(sourceFileFor(root, relative(subtree, path)))
        return !carriesWikiEdit(base, wiki, repo, scratchDir)
      })
      .map(({ path }) => path)
  } finally {
    rmSync(scratchDir, { recursive: true, force: true })
  }
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
      const unresolved = unresolvedWikiEdits(
        tmp,
        lastSyncCommit,
        resolvedSubtree,
        resolvedRoot,
        gitEnv,
      )
      if (unresolved.length > 0) {
        const conflicting = commitsTouching(tmp, range, unresolved)
        const diff = git(tmp, ["diff", range, "--", ...unresolved], gitEnv)
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
