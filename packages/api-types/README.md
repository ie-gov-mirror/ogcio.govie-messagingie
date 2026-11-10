# @ogcio/api-types

Layer 3 frontend DTO types for the messaging monorepo. Every type in this
package is **generated** from an API's committed `openapi-definition.yml` via
[`openapi-typescript`](https://openapi-ts.dev) — nothing here is hand-written.

This closes the type loop described in the "Consolidate API Data Model" plan:

```
TypeBox schemas -> @fastify/swagger -> openapi-definition.yml -> openapi-typescript -> @ogcio/api-types -> citizen-portal
```

## Layout

| File                 | Source spec                                 |
| -------------------- | ------------------------------------------- |
| `src/messaging.d.ts` | `apps/messaging-api/openapi-definition.yml` |
| `src/profile.d.ts`   | `apps/profile-api/openapi-definition.yml`   |
| `src/upload.d.ts`    | `apps/upload-api/openapi-definition.yml`    |
| `src/scheduler.d.ts` | `apps/scheduler-api/openapi-definition.yml` |

`src/index.ts` re-exports each spec under a namespace so further specs can
coexist without `paths` / `components` name collisions.

## Usage

```ts
// Per-spec (recommended) — reference the generated `paths` directly:
import type { paths } from "@ogcio/api-types/messaging"

type ListMessages200 =
  paths["/api/v1/messages/"]["get"]["responses"]["200"]["content"]["application/json"]

// Or namespaced via the package root:
import type { messaging } from "@ogcio/api-types"
type Paths = messaging.paths
```

> Note: OpenAPI paths are the API-local paths (`/api/v1/...`). The Secure API
> Gateway prepends a service prefix (e.g. `/messaging`) at call time; that prefix
> is a routing concern owned by the frontend api-client, not the type layer.

## Scripts

- `pnpm codegen` — regenerate every `*.d.ts` from its spec.
- `pnpm codegen:check` — CI drift guard; fails if committed output is stale.
  Run by `.azure/pipeline-api-contracts.yml` on every PR that touches a spec or
  this package.
- `pnpm typecheck` — type-check the entry + generated output.

## What guards what

`codegen:check` only compares a committed `*.d.ts` against a committed spec. It
cannot tell whether a committed spec still matches the API that emits it —
`info.version`, for one, never reaches the generated types. That half is covered
by each API's own `src/test/openapi-definition.test.ts`, which boots the app and
asserts `app.swagger({ yaml: true })` equals the committed file.

## Adding a spec

1. Add the spec + committed output to the `SPECS` list in
   `scripts/check-codegen.mjs` and a matching `codegen` invocation.
2. Add `export type * as <name> from "./<name>.js"` to `src/index.ts`.
3. Run `pnpm codegen` and commit the generated file.
