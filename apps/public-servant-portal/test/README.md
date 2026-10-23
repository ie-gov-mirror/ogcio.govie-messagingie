# Testing the public-servant-portal app

The canonical testing guide for the consolidated public-servant-portal
lives at the repo root:

> **[`docs/testing.md`](../../../docs/testing.md)**

That file covers:
- the full test pyramid (vitest → smoke e2e → regression e2e → dev e2e)
- every `pnpm` script the suite ships and what infra each needs
- coverage targets (80 % lines/statements/functions/branches; CI fails below)
- tag conventions, and a failure-triage flowchart
- worked examples for adding new vitest helpers, component tests, and
  Playwright specs

This README is intentionally short — keeping a single source of truth
stops the per-app guide and the repo-level guide from drifting apart
(which is what happened with the historical `messaging-next` README
that lived here before the consolidation).

Tests:
- Colocated `src/**/*.test.*` — React Testing Library + vitest (jsdom)
- `test/util/**` — pure-function vitest specs
- `test/hooks/**` — `@testing-library/react`-style hook tests
- `test/utils/**` — shared test helpers and module mocks
- `vitest.setup.ts` — global mocks (ResizeObserver, jest-dom matchers)
