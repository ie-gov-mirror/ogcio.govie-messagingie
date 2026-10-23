# citizen-portal

Single Next.js application that serves the **messages**, **profile** and
**dashboard** sections of the citizen-facing portal from one deployment.

Each section keeps its own canonical hostname
(`messaging.<env>.services.gov.ie`, `profile.<env>.services.gov.ie`,
`dashboard.<env>.services.gov.ie`); nginx in front of the static export
canonicalises off-zone URLs with a 301 so URL-content parity is preserved
without leaking a path prefix into the browser.

## Layout

```
apps/citizen-portal/
  src/
    app/[locale]/
      (authenticated)/         # messages, my-profile, my-dashboard
      (public)/                # accessibility, contact-support, etc.
      (signout)/               # global-signout
      onboarding/, ...         # locale-less routes inherited from the
                               # profile zone (post-global-signout, etc.)
    components/                # unified ClientShell, PageHeader, etc.
    util/
      get-zone-from-path.ts    # zone detection by URL pathname (server)
      get-zone-from-origin.ts  # zone detection by hostname (client)
    lib/zone-config.ts         # per-zone settings (sagAppName, rootPath, …)
  docker/
    nginx.conf.template        # single server block, canonical_host map
  test/                        # vitest unit tests
  e2e/                         # playwright suite (56 specs)
  k6/                          # perf harness
  Dockerfile / Dockerfile.local
  vitest.config.mts
  playwright.config.ts
```

The package is `@citizen-portal/app`. Cross-zone helpers
(`useCrossZoneLink`, `CitizenSagProvider`, `useEnv`, theme/i18n/faro/
analytics initialisation) live in `packages/citizen-shared` and are
consumed via `@citizen-portal/shared`.

## Why one app, three hostnames

We collapsed three Next.js apps into one unified `@citizen-portal/app`
to simplify the deployment surface (one pod, one CI pipeline, one
lockfile, one e2e suite, one set of cross-cutting concerns) while
keeping each section's canonical hostname for SEO, bookmark
compatibility and operator mental model.

Behind the scenes a single Next.js static export is served by nginx
under three `server_name`s. A `map $uri $canonical_host` rule inside
`docker/nginx.conf.template` routes off-zone paths back to their owner
with a 301 — visiting `messaging.<env>/my-profile` rewrites to
`profile.<env>/my-profile` so the URL always matches the rendered
content.

Inside the app, shared components decide what to render via the active
zone, computed from the URL pathname
(`util/get-zone-from-path.ts`, used by route components and SSR) or the
hostname (`util/get-zone-from-origin.ts`, used at the root landing
page). `lib/zone-config.ts` carries the per-zone settings
(`sagAppName`, `publicServantRoleName`, `rootPath`).

## Local dev

```bash
# unified Next.js dev server (PORT=4001 by default)
pnpm dev:citizen-portal
# equivalent: pnpm --filter @citizen-portal/app dev
```

To exercise the three-hostname behaviour locally, add to `/etc/hosts`:

```
127.0.0.1 messaging.local.test profile.local.test dashboard.local.test sag.local.test
```

The Docker harness (below) is the only way to exercise the nginx
canonicalisation logic and the cross-host SAG cookie flow; `next dev`
alone won't pick up the `Host`-based 301s.

## Build

```bash
# unified app -> apps/citizen-portal/out/
pnpm --filter @citizen-portal/app build

# production build (uses tsconfig.prod.json, drops tests + vitest config
# from the type-check graph) — used by Dockerfile
pnpm --filter @citizen-portal/app build:prod
```

The Docker build copies the single `out/` directory into
`/usr/share/nginx/html/`; nginx serves all three hostnames from that
root using the canonicalisation map.

## Tests

```bash
# unit / component tests (vitest + jsdom)
pnpm --filter @citizen-portal/app test          # CI run (junit + coverage)
pnpm --filter @citizen-portal/app test:local    # watch mode
pnpm --filter @citizen-portal/app test:browser  # vitest --browser (playwright)

# end-to-end (playwright) — drives the docker harness
pnpm --filter @citizen-portal/app test:e2e:local           # http://messaging.local.test:8080 (full suite)
pnpm --filter @citizen-portal/app test:e2e:smoke:local     # nginx canonicalisation + public pages, ~2s, no auth
pnpm --filter @citizen-portal/app test:e2e:webkit:smoke    # login, inbox, message open, mark-as-read only
pnpm --filter @citizen-portal/app test:e2e:dev             # *.dev.services.gov.ie
pnpm --filter @citizen-portal/app test:smoke:e2e
pnpm --filter @citizen-portal/app test:regression:e2e

# perf (k6)
pnpm --filter @citizen-portal/app test:k6:baseline
pnpm --filter @citizen-portal/app test:k6:load
pnpm --filter @citizen-portal/app test:k6:all
```

## Local Docker testing

`docker-compose.yaml` boots the consolidated image (`Dockerfile.local`)
and serves all three hostnames on the same port (8080) using the
unified nginx server block.

### 1. Add the test hostnames to `/etc/hosts`

```
127.0.0.1 messaging.local.test profile.local.test dashboard.local.test sag.local.test
```

`sag.local.test` is needed so SAG cookies (set with `Domain=.local.test`
and `SameSite=Lax`) are sent on `/auth/status` calls from
`messaging.local.test:8080`, etc.

### 2. Build the shared `base-deps` image once

The Dockerfile pulls `FROM base-deps`, a thin
`node:24-alpine + libc6-compat` layer shared by all monorepo images.

```bash
pnpm docker:build:base
```

### 3. Bring the container up

From the repo root:

```bash
pnpm docker:build:citizen-portal:local   # or: cd apps/citizen-portal && docker compose build
cd apps/citizen-portal
docker compose up citizen-portal
```

### 4. Verify canonicalisation

```bash
# in-zone (200 OK)
curl -i http://messaging.local.test:8080/en/messages
curl -i http://profile.local.test:8080/en/my-profile
curl -i http://dashboard.local.test:8080/en/my-dashboard

# off-zone (301 to canonical host, query string preserved)
curl -i http://messaging.local.test:8080/en/my-profile
curl -i http://profile.local.test:8080/en/messages
curl -i http://messaging.local.test:8080/onboarding
curl -i http://messaging.local.test:8080/api/clear-session

# unknown Host -> connection closed (HTTP 444)
curl -i -H "Host: somewhere-else.local.test" http://localhost:8080/
```

If a hostname renders the wrong content, double-check:
- `MESSAGING_HOST` / `PROFILE_HOST` / `DASHBOARD_HOST` in
  `docker-compose.yaml` match your `/etc/hosts` line.
- The `docker compose` build picked up your latest changes
  (`docker compose build --no-cache citizen-portal`).
- Port 8080 isn't already in use (`lsof -i :8080`); override with
  `CITIZEN_PORTAL_PORT=8090 docker compose up`.

### Bare `docker run` (no compose)

For ad-hoc one-shot runs, two thin wrapper scripts call `docker run`
with the same defaults (port 8080, container name `citizen-portal-run`,
`--add-host` entries inside the container so it can reach the host on
those names if needed).

> **Browser access still requires `/etc/hosts`** — `--add-host` only
> populates `/etc/hosts` **inside** the container; your laptop's DNS
> resolver isn't affected. To open
> `http://messaging.local.test:8080/` in a browser, run the
> `/etc/hosts` step above. To probe without `/etc/hosts`, use
> `curl -H "Host: messaging.local.test" http://127.0.0.1:8080/`.

```bash
# Run the local image (defaults from Dockerfile.local apply; auto-detects
# apps/citizen-portal/.env.local if present and forwards it as --env-file).
pnpm docker:run:citizen-portal:local

# Build :local first, then run (handy after editing source).
pnpm docker:up:citizen-portal:local

# Run the production-tag image (requires you to build it locally first
# with pnpm docker:build:citizen-portal, or pull from a registry).
pnpm docker:run:citizen-portal
```

#### Pointing at a specific env file

Both `pnpm` 10 and `node` 20+ intercept the bare `--env-file` flag for
their own env-loading features, so the wrapper supports three
equivalent paths in priority order:

```bash
# 1) ENV_FILE env var (recommended — works everywhere):
ENV_FILE=apps/citizen-portal/.env.local pnpm docker:run:citizen-portal:local

# 2) --env-file flag via the pnpm `--` separator (keeps pnpm's parser out):
pnpm docker:run:citizen-portal:local -- --env-file apps/citizen-portal/.env.local

# 3) Standalone node (use `node --` to bypass node's own --env-file):
node -- scripts/dev/docker-run-citizen-portal.mjs --env-file apps/citizen-portal/.env.local
```

If none is provided and `apps/citizen-portal/.env.local` exists, that
file is picked up automatically. Copy `apps/citizen-portal/.env.sample`
to `.env.local` to seed it.

#### Other wrapper flags

`pnpm docker:run:citizen-portal:local --help` lists everything, but the
common ones:

| Flag              | Default              | Notes                                                                                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <port>`   | `8080`               | Host port mapped to the container's nginx (8080)                                                                                                        |
| `--name <name>`   | `citizen-portal-run` | Container name (kept distinct from docker-compose's `citizen-portal`)                                                                                   |
| `--build`         | off                  | Run `pnpm docker:build:citizen-portal:local` first                                                                                                      |
| `--no-add-host`   | off                  | Skip the auto-injected `*.local.test:host-gateway` entries (use this when you've already added the names to `/etc/hosts` or want to test with real DNS) |
| `--detach` / `-d` | off                  | Run the container detached                                                                                                                              |

> **Note** Because the image is a **static export**, `NEXT_PUBLIC_*`
> values are baked in at **build time** — passing them via `--env-file`
> at run time is a no-op for the browser bundles. Use the env file with
> `docker build --build-arg` (or via CI pipeline variables) when you
> need different baked-in values; `--env-file` here only matters for
> the small set of runtime env vars (`PORT`, `OTEL_*`, etc.) consumed
> inside the container.

## Feature flags & standalone deployments

> Full reference (rationale, touch points, extending, testing):
> [`docs/internal/feature-flags.md`](../../docs/internal/feature-flags.md).

The consolidated app ships every zone and cross-block integration by
default, but a future adopter may want to run a reduced subset (e.g.
MessagingIE without Dashboard, as in the Department of Education
deployment) without exposing UI, links, or redirects that imply the
presence of building blocks that are not deployed (AB#39580).

Two kinds of flag exist:

### Build-time topology flags (`NEXT_PUBLIC_ENABLE_*`)

Baked into the static export, so flipping one needs a rebuild. They are
plain booleans (`true`/`false`, also accepting `1`/`0`/`yes`/`no`/`on`/`off`)
parsed in [`src/env/env.client.ts`](src/env/env.client.ts) and consumed
through the single helper module
[`src/lib/feature-config.ts`](src/lib/feature-config.ts). **All default
`true`**, so every current deployment is unchanged.

| Flag                                      | Default | When `false`                                                                                                                                                                                                                   |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_ENABLE_DASHBOARD`            | `true`  | Dashboard drawer link hidden; `/{locale}/` landing never resolves to dashboard; a direct visit to `/{locale}/my-dashboard` redirects to the first enabled landing zone; unmatched-path fallback no longer points at dashboard. |
| `NEXT_PUBLIC_ENABLE_MESSAGING`            | `true`  | MessagingIE drawer link hidden; the recent-messages (`MyMessages`) widget is omitted from the dashboard landing; messaging is no longer a landing fallback.                                                                    |
| `NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION`  | `true`  | Journey-Builder sign-out iframe is not added to the global-signout fan-out (no reference to a Journey-Builder origin).                                                                                                         |
| `NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION` | `true`  | Payments sign-out iframe is not added to the global-signout fan-out.                                                                                                                                                           |
| `NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION`    | `true`  | Forms sign-out iframe is not added to the global-signout fan-out.                                                                                                                                                              |

Profile has no flag — every building block requires Profile, so the
profile zone is always enabled and is the terminal landing fallback.

These resolve via Docker `ARG`/`ENV` (default `"true"`) in
[`Dockerfile`](Dockerfile) / [`Dockerfile.local`](Dockerfile.local). A
standalone build sets them per scenario, e.g.:

```bash
docker build \
  --build-arg NEXT_PUBLIC_ENABLE_DASHBOARD=false \
  ... apps/citizen-portal
```

The shared `pipeline-citizen-portal.yml` does not pass these build-args,
so the standard CI build inherits the `true` Dockerfile defaults; a
reduced-topology pipeline overrides them at the `--build-arg` level.

#### Deployment scenarios → flag values

| Scenario                                                         | `ENABLE_DASHBOARD` | `ENABLE_MESSAGING` | `ENABLE_JOURNEY_INTEGRATION` |
| ---------------------------------------------------------------- | ------------------ | ------------------ | ---------------------------- |
| Profile + MessagingIE (no Dashboard)                             | `false`            | `true`             | `true`                       |
| Profile + Forms (no Dashboard, no MessagingIE)                   | `false`            | `false`            | `true`                       |
| Profile + Forms + MessagingIE + Journey Builder (no Dashboard)   | `false`            | `true`             | `true`                       |
| Profile + Forms + Journey Builder (no Dashboard, no MessagingIE) | `false`            | `false`            | `true`                       |

(Forms is reached via direct `NEXT_PUBLIC_FORMS_SERVICE_URL` links, not a
citizen-portal zone, so it needs no zone flag. Disabling Journey or
Payments only removes their sign-out fan-out reference; leave them `true`
unless that building block is genuinely absent.)

### Build-time rollout flag — `NEXT_PUBLIC_ENABLE_LEA` (AB#40267)

An environment-specific rollout switch (not a topology flag) for the Life
Events Accelerator (LEA) experience — the new dashboard and the link to an
application submission from the message view. Parsed by the same helper in
[`src/env/env.client.ts`](src/env/env.client.ts) and read via
`isLeaEnabled()` in [`src/lib/feature-config.ts`](src/lib/feature-config.ts).

Unlike the topology flags it **defaults `false`** and the shared pipeline
**does** forward it (`--build-arg NEXT_PUBLIC_ENABLE_LEA=$(nextPublicEnableLea)`),
so its value can differ per environment:

| Flag                     | Default | Dev    | UAT    | Prod    |
| ------------------------ | ------- | ------ | ------ | ------- |
| `NEXT_PUBLIC_ENABLE_LEA` | `false` | `true` | `true` | `false` |

Prod keeps the default (non-LEA) version. Gate the LEA surfaces on
`isLeaEnabled()` when they are built.

### Build-time rollout flag — `NEXT_PUBLIC_ENABLE_FOLDERS` (AB#42582)

Citizen-portal-only switch for the message-folders feature (sidebar, move
actions, mobile folder panel). Parsed by the same helper and read via
`isFoldersEnabled()`. **Defaults `false`** in every environment until
the pipeline `nextPublicEnableFolders` is flipped.

| Flag                         | Default | Dev     | UAT     | Prod    |
| ---------------------------- | ------- | ------- | ------- | ------- |
| `NEXT_PUBLIC_ENABLE_FOLDERS` | `false` | `false` | `false` | `false` |

Folder e2e specs skip unless `NEXT_PUBLIC_ENABLE_FOLDERS` is truthy in
the Playwright process (must match the baked build).

### Runtime flag — `submission-linking` (Unleash)

Defined in
[`src/components/feature-flags-provider.tsx`](src/components/feature-flags-provider.tsx)
and exposed as `isSubmissionLinkingEnabled` from `useFeatureFlags()`. It
is the runtime, per-user gate for messaging surfaces that link a message
to a Journey-Builder submission, and can be turned off **without a
redeploy**.

It defaults **on**: when Unleash is unconfigured or unreachable the
fallback keeps it enabled, matching a fully-flagged deployment whose
`submission-linking` toggle is on. To disable submission-linked UI in a
deployment that does run Unleash, create the `submission-linking` flag
and turn it off. (The build-time `NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION`
decides whether a deployment ships Journey-Builder at all; this decides
the live visibility of the linked UI within such a build.)

> Out of scope for this change (citizen-portal only): the messaging-api
> `externalId` field, the Journey-Builder messaging plugin, and the SAG
> `dashboard` → `journey-builder` allowed-resource. These live outside
> this app and are the next surface to wire behind `submission-linking`
> when bidirectional submission linking is actually implemented.

## Architectural notes

### URL-content parity via canonicalisation

The unified `nginx.conf.template` declares two `map` directives:
- `map $uri $canonical_host` maps every owned URI prefix to the
  hostname that owns it (e.g. `/<locale>/messages*` → `${MESSAGING_HOST}`,
  `/<locale>/my-profile*` → `${PROFILE_HOST}`,
  `/<locale>/my-dashboard*` → `${DASHBOARD_HOST}`, plus
  locale-less `/onboarding`, `/post-global-signout`, `/api/*`).
- `map "$host:$canonical_host" $canonical_decision` decides whether a
  redirect is needed by comparing the current `Host` against the
  canonical owner via a PCRE back-reference.
- `map $http_host $canonical_port_suffix` re-extracts the port from the
  inbound `Host` header and appends it to the 301 `Location`. Production
  behind Istio terminates on :443 and `$http_host` carries no port, so
  the redirect URL stays clean; locally `:8080` is appended so the
  browser actually follows the redirect instead of falling back to :80.

A single `if ($canonical_decision = "yes") { return 301 … }` enforces
the redirect, preserving scheme, path, port and query string. Anything
outside the owned URI set (assets, `_next/*`, healthcheck, etc.) is
served directly from the unified `out/` regardless of hostname.

Smoke coverage for the rule lives in
`apps/citizen-portal/e2e/smoke/canonicalisation.spec.ts` and runs in ~2s
against the docker container:

```bash
pnpm --filter @citizen-portal/app test:e2e:smoke:local
```

### Cross-zone navigation

In-app links between zones still go through `useCrossZoneLink(zone, path)`
from `@citizen-portal/shared`; it expands to the configured
`NEXT_PUBLIC_{MESSAGING,PROFILE,DASHBOARD}_URL`. This keeps the link
target visible at hover-time, lets the canonicalisation rules redirect
mis-targeted clicks if config and reality ever drift, and means the
deployment can split the hostnames out again without code changes.

### SAG / auth

A single `CitizenSagProvider` (`@citizen-portal/shared`) wraps the
authenticated tree. The provider sets `appName` from the active zone
(`getZoneFromPath` -> `ZONE_CONFIG[zone].sagAppName`), so the same
session cookie carries the right role-set on each request. The SAG
session cookie is parent-domain scoped (`Domain=.<env>.services.gov.ie`,
or `Domain=.local.test` in dev) so a sign-in on one hostname is honoured
on the other two without an extra round-trip.
