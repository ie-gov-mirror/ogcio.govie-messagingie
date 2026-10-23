# Cleanup in plain words

_A non-technical summary of what this cleanup does and why. For the step-by-step
technical runbook, see [`README.md`](./README.md)._

## What happened

When we moved files over from the old Digital Postbox system, a bug in the
migration accidentally linked each file to **every** person in a batch, instead
of only to the person it actually belonged to. The result: some people could see
files that were never meant for them.

## What this cleanup does

It **removes the wrong "who can see this file" links** — nothing else. The files
themselves are not deleted or changed; we only take away access that shouldn't
exist.

## How we know which links are wrong

A file legitimately belongs to someone if it was **attached to a message sent to
them**. We use the message history as the source of truth:
- **Keep** every file-to-person link that matches a real message.
- **Remove** links where a person has a file but no message ever gave it to them.

Only files that came from the migration are looked at, so normal, everyday
uploads and shares are left untouched. Family/linked accounts also keep their
access — that's handled automatically elsewhere and isn't affected.

## How we make it safe

- **Report first, then act.** We first run a _read-only report_ that lists what
  would be removed. Nobody's access changes at this stage. A person reviews and
  signs off before anything is deleted.
- **Step by step across environments.** We run it on our test systems (dev, then
  uat) first, and only then in production.
- **Small batches.** The cleanup runs in small chunks rather than all at once, so
  the live service keeps working normally throughout.
- **Backup + undo.** Everything removed is backed up first, so it can be fully
  restored if needed.

## The procedure, step by step

The cleanup is a short sequence of scripts, run in order. The first ones only
_look_; only one of them actually _removes_ anything.
1. **Build the "correct list."** We read the message history and make a list of
   every file paired with the person who legitimately received it. This is our
   reference for what's allowed.
2. **Prepare a safe workspace + backup.** We set up a temporary area to compare
   against, and take a backup so anything removed can be restored.
3. **Produce the report (no changes yet).** We generate a read-only list of the
   access links that _would_ be removed. Someone reviews it and signs off. If the
   numbers look wrong, we stop here — nothing has changed.
4. **Re-check the export for a small group of affected people.** With the export
   fix now in place, we re-run the data export for a small batch of the people we
   know were affected and inspect it, to confirm no one else's files show up.
5. **Repeat for a larger group.** We do the same check for a bigger batch of
   affected people. Only when neither export shows a leak do we continue.
6. **Remove the wrong links, a few people at a time.** Once confirmed, we take
   away the wrong access — in small batches of people rather than all at once, so
   the live service keeps running smoothly and each batch can be undone on its own.
7. **Check the result.** After each batch we confirm the wrong links are gone and
   the correct ones remain.

If anything ever looks off afterwards, a **restore** step can put back exactly
what was removed, using the backup from step 2.

We do this whole sequence on our test systems first (dev, then uat), and only
then in production — where we always run the report and get sign-off _before_ the
removal step.

## The result

After the cleanup, each migrated file is visible only to the people who
legitimately received it — closing the accidental exposure created by the
original migration bug.
