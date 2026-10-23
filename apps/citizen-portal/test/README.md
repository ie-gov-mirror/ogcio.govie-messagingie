# Testing the citizen-portal app

The canonical testing guide for the consolidated citizen-portal lives
at the repo root:

> **[`docs/internal/testing.md`](../../../docs/internal/testing.md)**

That file covers:
- the full test pyramid (vitest → smoke e2e → full local e2e → dev e2e)
- every `pnpm` script the suite ships and what infra each needs
- how to stand up the local-auth chain (Logto + mygovid-mock + SAG +
  postgres + redis) via `docker-compose.local-auth.yaml`
- coverage targets, tag conventions, and a failure-triage flowchart
- worked examples for adding new vitest helpers, component tests, and
  Playwright specs

This README is intentionally short — keeping a single source of truth
stops the per-app guide and the repo-level guide from drifting apart
(which is what happened with the historical `messaging-next` README
that lived here before the consolidation).

Tests under this directory:
- `test/components/**` — React Testing Library + vitest (jsdom)
- `test/util/**` — pure-function vitest specs
- `test/hooks/**` — `@testing-library/react`-style hook tests
- `test/lib/**` — config-table assertions (e.g. `ZONE_CONFIG`)
- `vitest.setup.ts` — global mocks (matchMedia, etc.)
