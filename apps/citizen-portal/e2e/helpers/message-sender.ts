import { type Browser, expect, type Page, test } from "@playwright/test"
import { type PortalUser, templates } from "../fixtures"
import { giveConsent } from "../utils/consent-helper"
import {
  type Attachment,
  sendE2ETemplateMessage,
  sendMessageToDevCitizen,
} from "../utils/functions"
import { addNewRecipient } from "../utils/recipient-helpers"
import { authenticateUser } from "./auth"
import { createPageWithVideo } from "./browser-context"
import { createAuthenticatedPage } from "./user-auth.helper"

const ROW_LINK = "message-row-link-"
const EMPTY_INBOX = "messages-empty"
// Messaging API route the public servant's send posts each message to
const SEND_PATH = "/messaging/api/v1/messages"
// Covers the whole send form, including an upload
const SEND_TIMEOUT = 120_000
// Sends reach the inbox asynchronously, through the worker
const DELIVERY_TIMEOUT = 60_000
// The organisation lists a newly added recipient asynchronously
const IMPORT_TIMEOUT = 60_000

/** Subject of the "Test Template E2E" template the public servant sends. */
export const MESSAGE_SUBJECT = "Test Subject"

/** Covers two sign-ins, a send and its delivery. */
export const SENDER_SETUP_TIMEOUT = 300_000

/** A public servant sending the E2E template to one citizen. */
export type MessageSender = {
  /** The citizen, signed in to the portal. */
  citizen: Page
  /** Sends the template, with the attachment when given; resolves to the message id once it is in the inbox. */
  send: (attachment?: Attachment) => Promise<string>
  close: () => Promise<void>
}

/**
 * Opts the citizen in to messaging: a public servant can only add an
 * opted-in recipient. A first sign-in leaves the consent unanswered, so the
 * consent dialog is forced open and accepted; an opted-in citizen stays so.
 */
async function optIn(citizen: Page) {
  await citizen.goto("/en/messages?force-consent=1")
  await expect(citizen.getByRole("dialog")).toBeVisible()
  await giveConsent(citizen)
  await expect(
    citizen.getByRole("alert", { name: "Consent Updated" }),
  ).toBeVisible()
}

/**
 * Makes the citizen a recipient of the public servant's organisation: the
 * send searches the organisation's recipients only. A citizen the
 * organisation does not list yet, e.g. on a fresh local stack, is added as
 * a new recipient, which links their existing profile by email.
 */
async function joinOrganisation(admin: Page, citizen: PortalUser) {
  // The portal signs in to its gateway after landing; navigating before it
  // lists the templates aborts that sign-in and loses the session
  await expect(
    admin.getByRole("option", { name: templates.e2e, exact: true }),
  ).toBeAttached()
  await sendE2ETemplateMessage(admin)

  const panel = admin.getByRole("tabpanel", { name: "Search" })
  const row = admin.getByRole("row").filter({ hasText: citizen.email }).first()
  const empty = admin.getByLabel("Search").getByRole("cell", {
    name: "List is empty",
  })
  const search = async () => {
    await panel.locator('input[name="email"]').fill(citizen.email)
    await admin.getByRole("button", { name: "Search" }).click()
    await expect(row.or(empty)).toBeVisible()
    return row.isVisible()
  }

  if (await search()) {
    return
  }

  await addNewRecipient(admin, citizen)
  await admin.getByRole("tab", { name: "Search" }).click()
  await expect.poll(search, { timeout: IMPORT_TIMEOUT }).toBe(true)
}

/** True once the message's row is on the first inbox page. */
async function inboxHas(citizen: Page, id: string): Promise<boolean> {
  await citizen.goto("/en/messages")

  // Wait for the list, or for an inbox with no messages at all
  const anyRow = citizen.getByTestId(new RegExp(`^${ROW_LINK}`)).first()
  await expect(anyRow.or(citizen.getByTestId(EMPTY_INBOX))).toBeVisible()

  return citizen.getByTestId(`${ROW_LINK}${id}`).isVisible()
}

/**
 * Sends the template to the citizen and returns the message id once it
 * appears in the inbox. The id comes from the send itself: the template
 * subject is fixed, so another send to the same citizen looks the same in
 * the inbox.
 */
async function sendAndFind(
  admin: Page,
  citizen: Page,
  email: string,
  attachment?: Attachment,
): Promise<string> {
  const created = admin.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      new URL(res.url()).pathname.endsWith(SEND_PATH),
    { timeout: SEND_TIMEOUT },
  )
  await sendMessageToDevCitizen(admin, false, email, attachment)
  const { data } = (await (await created).json()) as { data: { id: string } }

  await expect
    .poll(() => inboxHas(citizen, data.id), { timeout: DELIVERY_TIMEOUT })
    .toBe(true)
  return data.id
}

/**
 * Signs in the citizen and the public servant and makes the citizen a
 * recipient the public servant can send to. The first sign-in creates the
 * citizen the public servant searches for, so it goes first.
 */
export async function openMessageSender(
  browser: Browser,
  user: PortalUser,
): Promise<MessageSender> {
  const citizen = await createAuthenticatedPage(browser, user.email)
  let admin: Page | undefined
  const close = async () => {
    await Promise.all([admin?.close(), citizen.close()])
  }

  // A failed setup closes what it opened: the caller gets no sender to close
  try {
    await optIn(citizen)

    admin = await createPageWithVideo(browser)
    await authenticateUser(admin)
    await joinOrganisation(admin, user)
  } catch (error) {
    await close()
    throw error
  }

  const servant = admin
  return {
    citizen,
    send: (attachment) => sendAndFind(servant, citizen, user.email, attachment),
    close,
  }
}

/**
 * Sends the citizen one message of their own and returns its id, for a
 * test that only needs a message to open. Extends the running test's
 * timeout by the setup's.
 */
async function sendOwnMessage(
  browser: Browser,
  user: PortalUser,
): Promise<string> {
  test.info().setTimeout(test.info().timeout + SENDER_SETUP_TIMEOUT)

  const sender = await openMessageSender(browser, user)
  try {
    return await sender.send()
  } finally {
    await sender.close()
  }
}

/**
 * Query string `?id=<message id>` of a message of the citizen's own.
 * Canonical `?id=` avoids the legacy path redirect in next.config.
 */
export async function ownMessageQuery(
  browser: Browser,
  user: PortalUser,
): Promise<string> {
  return `?id=${await sendOwnMessage(browser, user)}`
}
