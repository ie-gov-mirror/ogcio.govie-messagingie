# MessagingIE

Secure government-to-citizen messaging for Ireland: public servants compose and send messages (email, secure inbox, postal fallback); citizens read them in a unified inbox. This context also covers the observability language used to audit and instrument the product.

## Language

### Observability

**Metric source**:
A system that can answer a quantitative question about the product; one of **OTel/Grafana**, **Matomo**, **Faro RUM**, **DB event_log**, or **none**.
_Avoid_: "Grafana or Matomo" as an exhaustive pair, "Matamo" (misspelling)

**Emitted**:
A signal is emitted when code produces it (a counter increments, an event is tracked).
_Avoid_: "covered" (ambiguous — see **Observed**)

**Observed**:
An emitted signal is observed when a dashboard, alert, or report actually consumes it.
_Avoid_: "covered" without qualifying emitted vs observed

**Coverage gap**:
Any signal a stakeholder needs that is not observed; "emitted but not observed" is the cheapest gap class to close.

**Coverage map**:
The audit deliverable: a dated snapshot (with audited commit SHA) living at `docs/wiki/Analytics/MessagingIE-Metrics-Coverage-Map.md` in this repo, synced to the Azure DevOps wiki by the **Wiki sync** pipeline; gap rows link to the backlog items created from them.
_Avoid_: treating the wiki copy as the source of truth, or the map as a living document

**Gap priority**:
`max(stakeholder visibility, operational importance)`, each scored high/medium/low — visibility by the PM, operational importance by engineering, in one shared session; the map shows a single collapsed Priority value plus a coarse effort tag (trivial / real work).
_Avoid_: assigning a priority without the two-axis session behind it

**Emission inventory**:
The scope of the first coverage audit: what is **Emitted** only. **Observed** is deliberately deferred to a later audit.
_Avoid_: calling the first audit a full "coverage" audit — it inventories emission, not observation

**Observation pairing**:
The rule that a backlog item introducing a new signal includes its observation artifact (Matomo report / Grafana panel) as acceptance criteria — emission and observation ship as one unit of done.
_Avoid_: "we'll dashboard it later" follow-up tickets

**DB event_log**:
The messaging-api database table recording message lifecycle events; a queryable analytics source in its own right (used as source of truth by the metrics backfill).

### Engineering

**Test coverage**:
The vitest/SonarQube line-statement-function-branch percentages for an app's suite, measured against the **Honest denominator**. Always say "test coverage" — unqualified "coverage" belongs to observability (**Coverage gap**, **Coverage map**).
_Avoid_: bare "coverage" when talking about tests

**Honest denominator**:
A `coverage.include` pinned to every source file SonarQube counts, so untested modules are visible and vitest and Sonar report the same number. Without it, vitest counts only files the tests happened to load. See ADR-0001.
_Avoid_: silently adding coverage `exclude` entries (each one needs human sign-off)

**Ratchet floor**:
A vitest `coverage.thresholds` value set just under the CI-measured **test coverage**; each PR that adds tests raises the floor to just under its new CI number. CI is the arbiter, not local runs. Goal per app: 80/80/80/70 (lines/statements/functions/branches).

### Documentation

**Wiki docs**:
The documentation set mirrored to the Azure DevOps wiki: everything under `docs/wiki/` plus the root `GLOSSARY.md`. The repository copy is the only maintained one; the wiki is a read-only mirror.
_Avoid_: editing these pages on the wiki (any wiki-side change fails the next sync)

**Internal docs**:
Repo-only documentation under `docs/internal/` — never synced to the wiki, never published to the public mirror. The default home for any doc not deliberately promoted to **Wiki docs**.
_Avoid_: "private docs" (all of `docs/` is excluded from the public mirror; internal means "not on the wiki")

**Wiki sync**:
The one-way pipeline that pushes **Wiki docs** from `main` into a parameterised subtree of the programme wiki (`Digital-Services-Programme.wiki`).
_Avoid_: "two-way sync", "wiki backup" (the repo is the source, not a copy)

**Sync conflict**:
Any wiki-side commit touching the mirrored subtree since the last sync commit. It fails the **Wiki sync**; resolution is a local **Wiki pull**, triage into the repo (keep or discard), and a merge to `main`.
_Avoid_: reading "conflict" as a textual git merge collision — any wiki edit at all is a conflict

**Wiki pull**:
The local command (`pnpm wiki:pull`) that overwrites `docs/wiki/` with the current wiki subtree so plain `git diff` shows what changed; used for the initial import and for resolving a **Sync conflict**.

### Features

**Feature area**:
A user-facing surface as a stakeholder would name it; one row of the coverage map. Rows come from the full code-derived inventory, not only the areas named in the originating story.
_Avoid_: per-service or per-capability rows (a cross-cutting capability like attachments is one row with multiple owning services)

**Consent**:
The citizen's permission to be sent government messages (the `MESSAGING_CONSENT_SUBJECT` flow in the Citizen Portal shell). Unrelated to cookies or analytics — Matomo tracking is not gated by it.
_Avoid_: reading "consent" as ePrivacy/cookie consent

**Citizen Portal**:
The consolidated citizen-facing app (`apps/citizen-portal`: messages, profile, dashboard zones) — the canonical surface for citizen-side instrumentation. `apps/messaging-next` is deprecated and receives no new instrumentation.
_Avoid_: "both citizen apps" (true at audit time, no longer the target)

**Super User Console**:
The operator-facing support app (`apps/messaging-support`) for acting on citizen profiles: view, search, link/unlink, delete.
_Avoid_: "support portal", "admin console" (that's `messaging-admin`, for public servants)

**Account Deletion**:
Deletion of a citizen account, requested by the citizen via support ticket and executed by an operator in the **Super User Console**.
_Avoid_: "self-service deletion" (does not exist)

**Data Export**:
Citizen self-service export of their own data. The request/download UI lives in the **Citizen Portal** (`components/lifecycle-tasks`, this repo); task execution and the audit trail live in the profile repo (`profile-api` lifecycle-tasks). Frontend usage events are therefore emittable from this repo.
_Avoid_: bundling with **Account Deletion** as one "Account Export/Deletion" feature — they have different actors and owners; "owned by the profile repo" without qualifying that the UI is here

## Relationships

- A signal must be **Emitted** before it can be **Observed**
- A **Coverage gap** exists per feature area per **Metric source**
- **DB event_log** can backfill **OTel/Grafana** series (see `apps/messaging-api/src/scripts/metrics-backfill`)

## Example dialogue

> **Dev:** "Is `messages_read` covered?"
> **Domain expert:** "It's **emitted** — the counter exists in code — but if no Grafana panel queries it, it's not **observed**, so the audit records it as a gap."

## Flagged ambiguities

- "Grafana" was used to mean both "we emit an OTel metric" and "there is a dashboard" — resolved: record **Emitted** and **Observed** as separate columns in the coverage map.
- "Matamo" appears in planning docs — resolved: the product is **Matomo**.
- "Account Export/Deletion" was treated as one feature — resolved: **Data Export** (citizen self-service, profile repo) and **Account Deletion** (operator via **Super User Console**) are distinct rows in the coverage map.
