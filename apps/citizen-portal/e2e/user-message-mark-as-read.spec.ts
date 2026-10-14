import { expect, test } from "@playwright/test"
import type { Message } from "@/types"
import { ids, users } from "./fixtures"
import {
  createAuthenticatedPage,
  settleMessagingInbox,
} from "./helpers/user-auth.helper"

/*
 * Locks in the AB#37866 fix: opening a message in the unified inbox must
 * fire `PUT /message-actions/<id>` AND invalidate the cached list so the
 * row's `isSeen` flips on navigate-back. Without the SWR cache bust the
 * list re-mounts with stale `isSeen: false` data and testers see the
 * message stay styled as unread, even though the seen marker did fire.
 *
 * The list, detail and message-actions endpoints are all stubbed so the
 * spec is hermetic against backend state. The list stub flips `isSeen`
 * to `true` server-side once the PUT is observed, mirroring real API
 * behaviour without coupling to it.
 */

const UNREAD_MESSAGE_ID = "e2e-mark-read-1"
const READ_MESSAGE_ID = "e2e-mark-read-2"

const buildMessage = (
  overrides: Partial<Message> & Pick<Message, "id">,
): Message => ({
  subject: "Subject",
  createdAt: "2025-04-01T10:00:00Z",
  threadName: "Department of Social Protection",
  organisationId: ids.organisationPrimary,
  recipientUserId: users.peterParker.username,
  excerpt: "Excerpt",
  isSeen: false,
  attachmentsCount: 0,
  ...overrides,
})

interface StubState {
  /** Mutable: flips to `true` once the message-actions PUT is observed. */
  unreadIsSeen: boolean
  /** Captured PUT bodies for assertion. */
  markedAsSeen: Array<{ id: string; isSeen: boolean }>
}

async function stubMessagingApis(
  page: Awaited<ReturnType<typeof createAuthenticatedPage>>,
  state: StubState,
) {
  // Glob `messages*` does not match `/messages/:id` (`*` stops at `/`), so use
  // a regex that covers list + detail. Build 117050 hung because detail GETs
  // fell through to the real API (422) and mark-as-read never ran.
  await page.route(/\/messaging\/api\/v1\/message-actions\//, async (route, request) => {
    if (request.method() !== "PUT") {
      await route.continue()
      return
    }
    const url = new URL(request.url())
    const id = url.pathname.split("/").pop() ?? ""
    const body =
      (request.postDataJSON() as {
        messageId?: string
        isSeen?: boolean
      } | null) ?? {}
    state.markedAsSeen.push({ id, isSeen: body.isSeen === true })
    if (id === UNREAD_MESSAGE_ID && body.isSeen === true) {
      state.unreadIsSeen = true
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null, error: null }),
    })
  })

  await page.route(/\/messaging\/api\/v1\/messages/, async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue()
      return
    }
    const path = new URL(request.url()).pathname
    const detailMatch = path.match(/\/messages\/([^/]+)$/)
    if (detailMatch) {
      const id = detailMatch[1]
      const isSeen = id === UNREAD_MESSAGE_ID ? state.unreadIsSeen : true
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: buildMessage({
            id,
            subject:
              id === UNREAD_MESSAGE_ID
                ? "Open me to mark as read"
                : "Already read",
            isSeen,
            plainText: "Hello from the e2e stub.",
          }),
          error: null,
        }),
      })
      return
    }
    const messages: Message[] = [
      buildMessage({
        id: UNREAD_MESSAGE_ID,
        subject: "Open me to mark as read",
        isSeen: state.unreadIsSeen,
      }),
      buildMessage({
        id: READ_MESSAGE_ID,
        subject: "Already read",
        threadName: "Revenue",
        organisationId: ids.organisationSecondary,
        isSeen: true,
      }),
    ]
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: messages,
        metadata: { totalCount: messages.length },
        error: null,
      }),
    })
  })
}

test.describe("Unified inbox: mark-as-read on open", () => {
  test("opens a message, fires the seen marker and the row reads as seen on navigate-back @smoke @regression", async ({
    browser,
  }) => {
    const page = await createAuthenticatedPage(browser, users.peterParker.email)
    const state: StubState = { unreadIsSeen: false, markedAsSeen: [] }
    await stubMessagingApis(page, state)

    // Absolute inbox URL. A cross-zone hop can reopen the IdP; settle races
    // the shell against that form (nightly 117543, build 125157).
    await settleMessagingInbox(page, users.peterParker.email)

    // The row's CSS Module class is hashed at build time, but the `unreadRow`
    // substring is preserved by the Next.js CSS Modules loader — making it a
    // safe regex match across local and CI builds.
    const unreadRow = page.getByRole("row", {
      name: /Open me to mark as read/i,
    })
    await expect(unreadRow).toHaveClass(/unreadRow/)

    // Subject <Link> is the real navigation target (row ::after stretches it).
    // Do not key off data-testid — dest may lag the branch that added it.
    await unreadRow
      .getByRole("link", { name: /Open me to mark as read/i })
      .click()

    // Detail view rendered. Asserted before the seen marker so a click that
    // never commits the route transition fails here, on the actual symptom,
    // instead of downstream.
    await expect(
      page.getByRole("heading", { name: "Open me to mark as read" }),
    ).toBeVisible()

    // The seen marker fired exactly once with the matching id + isSeen=true,
    // and is observed before navigating back so the list stub has already
    // flipped `unreadIsSeen` and the second GET returns the read state.
    //
    // Poll the stub's record rather than page.waitForRequest: the detail view
    // fires markAsSeen from a useEffect gated on detail data, so the PUT races
    // the click, and an unbounded waitForRequest that misses it hangs the whole
    // 180s test budget with no signal (nightly 117735, three attempts). The
    // stub captures the PUT whenever it lands and expect bounds the wait.
    await expect
      .poll(() => state.markedAsSeen)
      .toEqual([{ id: UNREAD_MESSAGE_ID, isSeen: true }])

    // Detail toolbar labels the control "Back" (home.button.back). Its href is
    // a same-path Link that can full-reload into the client-shell spinner under
    // stubs; soft history.back() returns to the list the row click pushed from
    // and is what the original BackButton did.
    await expect(
      page.getByRole("link", { name: "Back", exact: true }),
    ).toBeVisible()
    await page.goBack()

    // List view re-mounted. Wait for the shell before asserting row class so
    // the back navigation does not race the unread styling check.
    await expect(page.getByTestId("search-input")).toBeVisible()

    // The cache invalidation in `useMarkMessageAsRead` means SWR has either
    // dropped the stale entry or already revalidated, so the row picks up
    // `isSeen: true` and loses the unread styling without waiting on focus /
    // reconnect heuristics.
    await expect(unreadRow).not.toHaveClass(/unreadRow/)

    // The other row was already read and must stay that way.
    await expect(
      page.getByRole("row", { name: /Already read/i }),
    ).not.toHaveClass(/unreadRow/)

    await page.close()
  })
})
