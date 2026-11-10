# Smart Workspace Update

Automated dependency updater for pnpm monorepos. Runs from the repo root:

```sh
pnpm deps:smart-update
```

## What it does

1. Scans all `package.json` files under `apps/` and `packages/` (+ root).
2. Classifies each dependency into one of three buckets based on the rules in the script:
   - **Skip** — never touched.
   - **Semver-only** — updated within the current range (`pnpm update`).
   - **Latest** — updated to the newest version (`pnpm update --latest`).
3. If `minimumReleaseAge` is set in `pnpm-workspace.yaml`, filters out packages whose latest version was published too recently (avoids bleeding-edge breakage).
4. Runs `pnpm update --recursive [--latest]` for each bucket.
5. Runs `pnpm dedupe` at the end.

If the batch `--latest` update fails, it falls back to updating deps one-by-one and reports which ones failed.

## Configuration

### Rules in the script

Edit `SKIP` and `SEMVER_ONLY` at the top of `scripts/smart-workspace-update.ts`.

Both have the same shape:

```ts
interface PackageRules {
  global: string[]                    // applies everywhere
  scoped: Record<string, string[]>   // applies only in specific workspace packages
}
```

- **`global`** — the dep is matched regardless of which workspace package contains it.
- **`scoped`** — the dep is matched only when found in the listed package (by `name` field in its `package.json`).

#### SKIP

Deps that must **never** be upgraded automatically.

```ts
const SKIP: PackageRules = {
  global: ["some-package"],
  scoped: {
    "my-app": ["pg"],
  },
}
```

#### SEMVER_ONLY

Deps that should only be upgraded **within their current semver range** (no `--latest`).

```ts
const SEMVER_ONLY: PackageRules = {
  global: ["next", "react", "react-dom"],
  scoped: {
    "my-app": ["use-intl"],
  },
}
```

> **Important:** Rules are matched per workspace package. If a dep appears in multiple packages, you must add it to `scoped` for **every** package where you want the rule to apply. Otherwise `pnpm update --recursive` will still update it in the unlisted packages and pnpm may sync it back everywhere.

### Release age gate (`pnpm-workspace.yaml`)

Optional. When set, the script checks `npm view <pkg> --json` and skips any dep whose latest version was published less than `minimumReleaseAge` seconds ago.

```yaml
minimumReleaseAge: 7200            # 2 hours
minimumReleaseAgeExclude:
  - "@ogcio/*"                     # these are always eligible (glob supported)
```

- `minimumReleaseAge` — minimum age in **seconds**. Omit to disable the check.
- `minimumReleaseAgeExclude` — glob patterns for packages that bypass the age check.

## How deps are resolved across packages

The script collects deps from all workspace packages into two global sets (`latest` and `semverOnly`). If a dep is semver-only in one package but latest-eligible in another, it is treated as **latest** (the more permissive bucket wins).

Local references (`workspace:*`, `link:`, `file:`) are always ignored.