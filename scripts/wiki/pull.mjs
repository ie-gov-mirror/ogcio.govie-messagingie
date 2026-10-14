#!/usr/bin/env node
// Overwrites docs/wiki/ (and GLOSSARY.md) with the current content of the
// configured ADO wiki subtree, so `git diff` shows exactly what changed.
// Doubles as the initial-import tool and the Sync-conflict resolution tool.
import { execFileSync } from "node:child_process"
import {
  cpSync,
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
import {
  GLOSSARY_FILE_NAME,
  gitAuthEnv,
  isContextPage,
  listFiles,
  parseCliArgs,
  resolveRepo,
  resolveSubtree,
} from "./paths.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT_DEFAULT = join(__dirname, "..", "..")

function parseArgs(argv) {
  return {
    root: REPO_ROOT_DEFAULT,
    ...parseCliArgs(argv, {
      valueFlags: {
        "--repo": "repo",
        "--subtree": "subtree",
        "--root": "root",
      },
    }),
  }
}

function run() {
  const args = parseArgs(process.argv.slice(2))
  const repo = resolveRepo(args.repo)
  const subtree = resolveSubtree(args.subtree)

  const gitEnv = { ...process.env, ...gitAuthEnv() }

  const tmp = mkdtempSync(join(tmpdir(), "wiki-pull-"))
  try {
    console.log(`Cloning wiki subtree "${subtree}" ...`)
    // Partial + sparse: fetch blobs only for the target subtree instead of the
    // whole programme wiki. stdio inherited (and no --quiet) so git's progress
    // is visible and it can prompt for ADO credentials if it needs to.
    execFileSync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--sparse",
        "--progress",
        repo,
        tmp,
      ],
      { stdio: "inherit", env: gitEnv },
    )
    execFileSync("git", ["-C", tmp, "sparse-checkout", "set", subtree], {
      stdio: "inherit",
      env: gitEnv,
    })

    const subtreeDir = join(tmp, subtree)
    if (!existsSync(subtreeDir)) {
      throw new Error(
        `Wiki subtree not found: "${subtree}" (looked for it at ${subtreeDir} after cloning). ` +
          "Check --subtree / WIKI_DOCS_SUBTREE — nothing was changed.",
      )
    }

    const docsWikiDir = join(args.root, "docs", "wiki")
    const contextFile = join(args.root, GLOSSARY_FILE_NAME)

    let contextContent = null
    const pulled = []
    for (const file of listFiles(subtreeDir)) {
      const relPath = relative(subtreeDir, file)
      if (isContextPage(relPath)) {
        contextContent = readFileSync(file, "utf8")
        continue
      }
      pulled.push({ relPath, file })
    }

    // Overwrite, don't merge: clear the old set so wiki-side deletions show up too.
    if (existsSync(docsWikiDir))
      rmSync(docsWikiDir, { recursive: true, force: true })
    mkdirSync(docsWikiDir, { recursive: true })

    for (const { relPath, file } of pulled) {
      const target = join(docsWikiDir, relPath)
      mkdirSync(dirname(target), { recursive: true })
      cpSync(file, target)
    }
    console.log(`Pulled ${pulled.length} file(s) into docs/wiki/.`)

    if (contextContent !== null) {
      writeFileSync(contextFile, contextContent)
      console.log(`Pulled the Context page into ${GLOSSARY_FILE_NAME}.`)
    } else {
      console.log(
        `No Context page found in the wiki subtree; left ${GLOSSARY_FILE_NAME} untouched.`,
      )
    }

    console.log("Run `git diff` to review, then commit or discard.")
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    run()
  } catch (error) {
    console.error(`wiki:pull failed: ${error.message}`)
    process.exit(1)
  }
}
