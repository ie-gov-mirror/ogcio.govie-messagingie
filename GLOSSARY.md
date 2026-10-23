# MessagingIE

Secure government-to-citizen messaging for Ireland: public servants compose and send messages (email and the secure inbox); citizens read them in a unified inbox. This context also covers the observability language used to audit and instrument the product.

## Language

### Platform

**MessagingIE**:
The Gov.IE messaging platform: **Public Service Bodies** send messages, citizens read them in one inbox.
_Avoid_: Life Events Messaging platform, Gov.IE Messaging Service, Messaging Service

**Life event**:
An item of gov.ie discovery content, grouped into categories and journeys, that the Citizen Portal fetches from the CMS.
_Avoid_: "life event" for the in-platform inbox channel or for the Life Events programme

### People and organisations

**Citizen**:
A member of the public with a profile on MessagingIE.
_Avoid_: user, account; "anyone who is not a public servant"

**Onboarded citizen**:
A **Citizen** whose identity MyGovID verified at SAFE level 2. A citizen a PSB imported who has not signed in yet is not onboarded, but can still be messaged.
_Avoid_: "Citizen" as the role name, Pre-Approved, Undefined

**Onboarding**:
The SAFE level check that turns a **Citizen** into an **Onboarded citizen**.
_Avoid_: registration, sign-up

**Public Service Body (PSB)**:
A government organisation, such as a department or agency, that sends messages to citizens.
_Avoid_: Public Sector Body, Department

**Organisation**:
The platform's record of a **Public Service Body**, identified by its Logto organisation ID. Messages, templates, email providers and imported profiles each belong to one.
_Avoid_: organization (in prose), Department Id, org

**Recipient**:
The profile a message is addressed to; every message has exactly one.
_Avoid_: receiver, user

**Profile ID**:
The identifier of a profile, and so of a **Recipient**.
_Avoid_: recipient user ID, receiver ID, user ID

**Service user**:
A **Citizen** as one **Organisation** sees them: the profile plus the details that PSB holds.
_Avoid_: imported user, PSB profile

**Public servant**:
A PSB staff member who signs in with Entra ID to send messages or manage profiles in the **Public Servant Portal**. New accounts wait for review.
_Avoid_: PS, admin user, staff

**M2M application**:
A PSB's backend system that sends messages with its own credentials, without a signed-in person.
_Avoid_: system client, system-to-system application

**Sender**:
Who created a message: a **Public servant**, an **M2M application**, or MessagingIE itself.
_Avoid_: From (UI label)

**PPSN**:
The Personal Public Service Number. It identifies a citizen and matches imported profiles to sign-ins.
_Avoid_: Public Services Card (the card, not the number), public identity ID

**SAFE level**:
How strongly MyGovID has verified a citizen's identity; level 2 is required to use MessagingIE.
_Avoid_: security level (that is a message's **Security level**)

**Public name**:
The display name a citizen chooses for the platform, independent of their MyGovID name.

### Profiles and consent

**Primary profile**:
The profile that stands for the person; their other profiles point to it.
_Avoid_: parent profile, primary user

**Linked profile**:
Another profile of the same person, attached to their **Primary profile**, such as one a PSB imported under a different email. Its messages appear in the same inbox.
_Avoid_: linked account, child profile, secondary profile, mailbox; "linked" for a profile made visible to an organisation (dp-proxy's Organisation link)

**Consent**:
A profile's recorded decision on one subject, given against a version of that subject's **Consent statement**. The latest decision is current; earlier ones are its history.
_Avoid_: consent preference

**Messaging consent**:
**Consent** on the `messaging` subject: the citizen's permission to be sent messages on MessagingIE. Unrelated to cookies or analytics; Matomo tracking is not gated by it.
_Avoid_: reading "consent" as ePrivacy/cookie consent; Metadata consent (the public API's per-organisation agreement)

**Consent status**:
One of undefined, pending, pre-approved, opted-in or opted-out. Opted-in and pre-approved allow messages.
_Avoid_: enabled/disabled (UI labels that group the five statuses)

**Consent statement**:
The versioned, bilingual text a **Consent** is given against. Once published it cannot be edited, only disabled.

**Consent cascade**:
Copying a consent decision from a **Primary profile** to its **Linked profiles**.

**Interim profile**:
A profile an organisation's import created that nobody has signed in to yet; it waits to be matched by **PPSN**.
_Avoid_: interim user, imported profile

**Account linking**:
Attaching a profile to a **Primary profile**: automatically when a sign-in's **PPSN** matches an **Interim profile**, by an operator in the **Super User Console**, or in bulk.
_Avoid_: merge, link (alone)

**Profile import**:
A PSB's bulk upload of citizen records (CSV or API). It adds the PSB's details to existing profiles or creates **Interim profiles**.
_Avoid_: service user import, recipient list, upload

**Profile status**:
Active, disabled (being deleted) or deleted.
_Avoid_: "disabled" for consent (see **Consent status**)

**Blocklisted profile**:
A profile an operator forced to opted-out on **Messaging consent**.
_Avoid_: blacklist; "ineligible recipient" (dp-proxy's term for any recipient its consent or status rules exclude)

### Messages

**Message**:
A communication from a PSB to one **Recipient**, in English or Irish, with a subject, a short excerpt, a body and up to three attachments. Sending to many recipients creates one message each.
_Avoid_: bulk message (there is none: one message per recipient)

**Security level**:
Whether a message is **Secure** (its content is shown only in MessagingIE, after sign-in) or **Non-secure** (its content is also sent by email).
_Avoid_: confidential/public (API values), Secured/Non-secured, Message type, high

**Secure notification**:
The email sent instead of a **Secure** message's content: it names the sending organisation and links to the secure messages page, without attachments.
_Avoid_: smart link

**Attachment**:
A file sent with a message, at most three per message; the upload service stores it, scans it for viruses and shares it with the **Recipient**.
_Avoid_: upload, file (for the message's attachment)

**Scheduled time**:
When a message is to be sent. Every message has one, immediate sends included.
_Avoid_: send date

**Message event**:
One entry in a message's audit trail: what happened (created, scheduled, delivered, read…) and whether it succeeded, failed or is pending.
_Avoid_: status (that is the **Message status** derived from the latest event)

**Message status**:
What a message's latest **Message event** says: Scheduled, Delivered, Read or Failed. It is derived, never stored. Delivered: the **Inbox delivery** and, when there is one, the **Email delivery** succeeded. Failed: either of them failed, so the message may still be in the **Inbox**.
_Avoid_: opened (an API filter value for Read)

**Read**:
Whether the **Recipient** has opened a message; the opposite is Unread.
_Avoid_: seen, opened

**Support message**:
A message sent by MessagingIE itself, shown to citizens with MessagingIE as the **Sender**.

**Consent bypass**:
Sending a message regardless of the recipient's **Messaging consent**. It needs a dedicated permission and is recorded on the message's events.
_Avoid_: consent override (the permission's name, not the act)

### Delivery

**Transport**:
How a message leaves MessagingIE to reach its recipient: **Email** is the only one. Every message is in the recipient's **Inbox** regardless.
_Avoid_: channel, provider; lifeEvent, SMS, postal (not transports)

**Email provider**:
A PSB's email-sending configuration: SMTP server and sender address. One per organisation is primary.
_Avoid_: provider (alone), delivery provider

**Inbox delivery**:
A message reaching its recipient's **Inbox**, at its **Scheduled time**, whatever happens to its **Email**. It fails when the recipient's profile cannot be found or checked.
_Avoid_: delivery (alone), delivered (for the email)

**Email delivery**:
The outcome of a message's **Email**: accepted by the **Email provider**, or failed.
_Avoid_: delivered (for the email), notification status

### Inbox

**Inbox**:
A citizen's list of messages that are not in a **Folder**.
_Avoid_: mailbox, unified inbox (code name)

**Folder**:
A citizen-owned, nestable container for messages; a message is in at most one.
_Avoid_: tag

**Deleted message**:
A message the citizen deleted: hidden from the **Inbox** and listed under Deleted.
_Avoid_: "deleted folder" (it is not a **Folder**)

### Templates

**Message template**:
A reusable, bilingual message owned by an **Organisation**.

**Template variable**:
A named placeholder declared on a **Message template** and filled per recipient at send time.
_Avoid_: illegal variable (an undeclared placeholder, which is rejected)

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

### Operations

**Support line**:
One tier of production support: first line triages and resolves known issues, second line owns the hosting platform and infrastructure, third line owns the MessagingIE application.
_Avoid_: bare "support" or "support team" (collides with **Support message** and **Super User Console**)

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

**Citizen Portal**:
The consolidated citizen-facing app (`apps/citizen-portal`: messages, profile, dashboard zones) — the canonical surface for citizen-side instrumentation.
_Avoid_: "both citizen apps" (true at audit time, no longer the target)

**Super User Console**:
The operator-facing support app (`apps/messaging-support`) for acting on citizen profiles: view, search, link/unlink, delete.
_Avoid_: "support portal", "admin console" (that's the **Public Servant Portal**)

**Public Servant Portal**:
The consolidated public-servant app (`apps/public-servant-portal`), with the messaging-admin and profile-admin **Zones**.
_Avoid_: messaging-admin, Admin UI

**Zone**:
A section of a consolidated portal with its own hostname: messages, profile and dashboard in the **Citizen Portal**; messaging-admin and profile-admin in the **Public Servant Portal**.
_Avoid_: "zone" as a network or security zone

**Announcement**:
A bilingual product-update notice shown to citizens until they acknowledge it, and listed in What's new.

**Account Deletion**:
Deletion of a citizen account, requested by the citizen via support ticket and executed by an operator in the **Super User Console**.
_Avoid_: "self-service deletion" (does not exist)

**Data Export**:
Citizen self-service export of their own data. The request/download UI lives in the **Citizen Portal** (`components/lifecycle-tasks`); task execution and the audit trail live in `profile-api`, also in this repo. Operators can also request an export through the **Super User Console**.
_Avoid_: bundling with **Account Deletion** as one "Account Export/Deletion" feature — they have different actors and owners

## Relationships

- A **Recipient** is a profile; a **Linked profile**'s messages appear in its **Primary profile**'s inbox
- A message is sent only to a recipient whose **Messaging consent** has an allowing **Consent status**
- A **Consent cascade** keeps a person's **Linked profiles** in line with their **Primary profile**
- Every message is in the recipient's **Inbox**; **Email** carries a **Non-secure** message's content, or a **Secure notification** for a **Secure** one
- A **Profile import** creates **Interim profiles**; **Account linking** attaches one to a **Primary profile** when its **PPSN** signs in
- A **Service user** is a **Citizen** as one **Organisation** sees them
- A signal must be **Emitted** before it can be **Observed**
- A **Coverage gap** exists per feature area per **Metric source**
- **DB event_log** can backfill **OTel/Grafana** series (see `apps/messaging-api/src/scripts/metrics-backfill`)

## Example dialogue

> **Dev:** "Is `messages_read` covered?"
> **Domain expert:** "It's **emitted** — the counter exists in code — but if no Grafana panel queries it, it's not **observed**, so the audit records it as a gap."

## Flagged ambiguities

- "Citizen" had four definitions in code (not a public servant; holds the `citizen` role; has no organisation roles; signed in with MyGovID) — resolved: **Citizen** is a member of the public with a profile; **Onboarded citizen** is the verified subset.
- "Life event" meant four things (CMS discovery content, the `lifeEvent` inbox channel, the Life Events programme, an API title) — resolved: **Life event** is the discovery content only.
- "Consent" was this platform's messaging consent and also the public API's per-organisation agreement — resolved: **Consent**/**Messaging consent** here, Metadata consent in the public API.
- "Linked" also meant "visible to an organisation" in dp-proxy — resolved: **Linked profile** is another profile of the same person; dp-proxy says Organisation link.
- "PSB" was expanded as both "Public Sector Body" and "Public Service Body" — resolved: **Public Service Body**.
- One flag had three names (`isSeen` in code, Read/Unread for citizens, Opened/Unopened in admin events) — resolved: **Read**.
- The API and database say "tag", the citizen UI says "folder" — resolved: **Folder**.
- The security level was `confidential`/`public` (API), "Secured"/"Non-secured" (admin UI) and `high` (database default) — resolved: **Secure**/**Non-secure**.
- Code lists `lifeEvent` as a transport, SMS code exists but is switched off, and this glossary once claimed a postal fallback — resolved: **Email** is the only **Transport**.
- "Blacklisted" meant a profile forced to opted-out (profile-api) and any recipient excluded by consent or status (dp-proxy) — resolved: **Blocklisted profile** here, Ineligible recipient in dp-proxy.
- "Grafana" was used to mean both "we emit an OTel metric" and "there is a dashboard" — resolved: record **Emitted** and **Observed** as separate columns in the coverage map.
- "Matamo" appears in planning docs — resolved: the product is **Matomo**.
- "Account Export/Deletion" was treated as one feature — resolved: **Data Export** (citizen self-service, profile repo) and **Account Deletion** (operator via **Super User Console**) are distinct rows in the coverage map.
- "Delivered" meant the message reached the Inbox, its email was sent, or no email was needed — resolved: **Inbox delivery** is the first; the email's outcome is separate.
