# public-servant-portal

Single Next.js application that serves the **messaging-admin** and
**profile-admin** admin zones from one deployment. Each zone keeps its
own canonical hostname
(`messaging-admin.<env>.services.gov.ie`,
`profile-admin.<env>.services.gov.ie`); nginx in front of the static
export canonicalises off-zone URLs so URL-content parity is preserved
without leaking a zone prefix into the browser.

Mirrors the `citizen-portal` consolidation pattern: one static export,
two `server_name`s, per-zone `ClientShell` picked at runtime by
`AuthenticatedShellDispatcher` from `window.location.hostname`.

## Auth model

- Client-side auth only, via `@ogcio/sag-client/react` (no server-side
  auth, no middleware).
- Public-servant sign-in: both zones call
  `signIn({ connector: CONNECTOR_ENTRAID, redirectUrl })`. SAG maps that
  to Logto `direct_sign_in`. The Entra connector sends
  `prompt=select_account`, so the account picker appears instead of a
  silent Microsoft reauth. The portal does not set `connectorsToShow`.
- Per-zone `SagClientProvider` is mounted by the
  `AuthenticatedShellDispatcher` (see `components/authenticated-shell-dispatcher.tsx`)
  once JS reads `window.location.hostname`, so each zone talks to SAG
  under its own `appName` (`messaging-admin` / `profile-admin`).

## Local dev

```bash
# unified Next.js dev server (PORT=4002 by default)
pnpm dev:public-servant-portal
# equivalent: pnpm --filter public-servant-portal dev
```

To exercise the two-hostname behaviour locally, add to `/etc/hosts`:

```
127.0.0.1 messaging-admin.local.test profile-admin.local.test sag.local.test
```

`sag.local.test` is required alongside the two admin hostnames: SAG
dev runs with `SESSION_COOKIE_DOMAIN=.local.test`, so the frontends
must call it on a `.local.test` hostname or the browser drops the
sign-in round-trip cookies (`logto_app`, `logto_redirect`) and the
Logto callback fails with `400 APP_REQUIRED`.

Copy-paste the line above into a `sudo`-edit of `/etc/hosts` (this
step requires root; the app itself never touches `/etc/hosts`). The
existing citizen-portal entries
(`messaging.local.test profile.local.test dashboard.local.test`)
can share the same file — no conflict.

`next dev` alone binds to `localhost:4002`; to exercise the nginx
Host-based canonicalisation between the two admin zones, run the docker
harness (below).

## Local Docker testing

`docker-compose.yaml` boots the consolidated image (`Dockerfile.local`)
and serves both admin hostnames on the same port (8080) via the
unified nginx server block.

### 1. Add the test hostnames to `/etc/hosts`

```
127.0.0.1 messaging-admin.local.test profile-admin.local.test
```

### 2. Build the shared `base-deps` image once

The Dockerfile pulls `FROM base-deps`, a thin
`node:24-alpine + libc6-compat` layer shared by all monorepo images.

```bash
pnpm docker:build:base
```

### 3. Bring the container up

From the repo root:

```bash
cd apps/public-servant-portal
docker compose up --build public-servant-portal
```

### 4. Verify each zone responds

```bash
curl -H "Host: messaging-admin.local.test" http://localhost:8080/health
curl -H "Host: profile-admin.local.test"   http://localhost:8080/health
```

And in a browser:
- http://messaging-admin.local.test:8080/
- http://profile-admin.local.test:8080/

## Testing

```bash
pnpm --filter public-servant-portal test          # vitest (jsdom) + coverage
pnpm --filter public-servant-portal test:local    # watch mode
pnpm --filter public-servant-portal test:e2e:local # playwright (both zones)
pnpm --filter public-servant-portal test:e2e:local:messaging
pnpm --filter public-servant-portal test:e2e:local:profile
pnpm --filter public-servant-portal test:smoke:e2e
pnpm --filter public-servant-portal test:regression:e2e
```
