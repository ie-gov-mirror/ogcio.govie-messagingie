// Shared conventions between docs/wiki/ and the ADO wiki subtree: page
// name-mapping, the sync commit-marker format, and the default ADO wiki
// coordinates. Used by the pull command (scripts/wiki/pull.mjs) and the
// sync script (scripts/wiki/sync.mjs).
import { readdirSync } from "node:fs"
import { join } from "node:path"

export const GLOSSARY_FILE_NAME = "GLOSSARY.md"
export const GLOSSARY_PAGE_NAME = "Glossary.md"

export const DEFAULT_SUBTREE =
  "/Building-Blocks-%2D-(BB)/General/MessagingIE/Architecture-&-Technical-Documentation"

// Matches the ADOOrg / ADOProject / WikiName / ADOBaseUrl values already
// defined for every environment in .azure/pipeline-variables/*.yml.
export const ADO_DEFAULTS = {
  ADO_BASE_URL: "https://dev.azure.com",
  ADO_ORG: "OGCIO-Digital-Services",
  ADO_PROJECT: "Digital Services Programme",
  WIKI_NAME: "Digital-Services-Programme.wiki",
}

// Marks a sync commit in the wiki history so the sync script can find the
// last one it pushed and detect wiki-side edits since then.
export const SYNC_MARKER_TRAILER = "Wiki-Sync-Source"

export function buildSyncCommitMessage(sourceSha) {
  return `Sync docs from govie-services-messaging\n\n${SYNC_MARKER_TRAILER}: ${sourceSha}`
}

// Minimal shared arg parser for the two wiki CLIs. `valueFlags` take the next
// argv entry; `boolFlags` are presence-only. Unknown flags throw rather than
// being ignored, so a typo can't silently fall back to a default.
export function parseCliArgs(argv, { valueFlags, boolFlags = [] }) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (valueFlags[arg]) args[valueFlags[arg]] = argv[++i]
    else if (boolFlags.includes(arg)) args[arg.replace(/^--/, "")] = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

export function resolveRepo(explicit, env = process.env) {
  return explicit || env.WIKI_GIT_URL || buildAdoWikiUrl(env)
}

// The one destructive knob: sync deletes and replaces whatever subtree this
// resolves to. A degenerate value must fail loudly rather than silently
// targeting the repo root (which would stage the entire wiki) or falling back
// to the default (which would write somewhere the caller did not ask for).
// `explicit === undefined` means "not passed"; an empty string is a mistake.
export function resolveSubtree(explicit, env = process.env) {
  const raw =
    explicit !== undefined
      ? explicit
      : (env.WIKI_DOCS_SUBTREE ?? DEFAULT_SUBTREE)
  const cleaned = String(raw).trim().replace(/^\/+/, "").replace(/\/+$/, "")
  const segments = cleaned.split("/")
  if (
    !cleaned ||
    segments.some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    throw new Error(
      `Refusing to use wiki subtree "${raw}": it must name a path inside the ` +
        "wiki, not the repository root. Nothing was changed.",
    )
  }
  return cleaned
}

export function isContextPage(pageRelPath) {
  return pageRelPath === GLOSSARY_PAGE_NAME
}

// Repo filenames are wiki page names verbatim (ADO renders "-" as a space in
// the displayed title on its own), and page content is copied byte-for-byte in
// both directions — so there is nothing to convert between repo and wiki.

// Auth uses the developer's/pipeline's own ADO credentials: a PAT via
// ADO_PAT, or (with no PAT set) whatever git credential helper / `az login`
// session is already configured for dev.azure.com. The URL never carries the
// credential — see gitAuthEnv.
export function buildAdoWikiUrl(env = process.env) {
  const base = env.ADO_BASE_URL || ADO_DEFAULTS.ADO_BASE_URL
  const org = env.ADO_ORG || ADO_DEFAULTS.ADO_ORG
  const project = env.ADO_PROJECT || ADO_DEFAULTS.ADO_PROJECT
  const wikiName = env.WIKI_NAME || ADO_DEFAULTS.WIKI_NAME
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(wikiName)}`
}

// Passes ADO_PAT to git as an Authorization header via git's env-based config
// rather than embedding it in the clone URL. A URL is passed to git as argv,
// which is visible to `ps` and lands verbatim in CI logs and error messages;
// this keeps the credential out of both. Returns {} when no PAT is set, so
// git falls back to the ambient credential helper / az login session.
export function gitAuthEnv(env = process.env) {
  if (!env.ADO_PAT) return {}
  const basic = Buffer.from(`:${env.ADO_PAT}`).toString("base64")
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraheader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  }
}

export function listFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === ".git") continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(full)
    }
  }
  walk(dir)
  return out
}
