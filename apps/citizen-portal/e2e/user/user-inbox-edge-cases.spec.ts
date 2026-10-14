import { expect, test, type Browser, type Page } from "@playwright/test"
import type { Message } from "@/types"
import { ids, urls, users } from "../fixtures"
import { createPageWithVideo } from "../helpers/browser-context"
import {
  loginAsCitizen,
  settleMessagingInbox,
} from "../helpers/user-auth.helper"

/*
 * Edge-case coverage for the Unified Inbox that the happy-path specs miss:
 * empty inbox, a search that matches nothing, a delete that fails
 * server-side, and a list long enough to paginate.
 *
 * The list + delete APIs are stubbed so every test is hermetic against
 * backend state and runs on the local dev server. The component's
 * mock-message fallback (`getMockMessagesPage`) is gated behind
 * `NEXT_PUBLIC_ENABLE_MOCK_MESSAGES`, which defaults to `false`, so an
 * empty API response collapses to the real empty state rather than
 * bundled fixtures — see src/mock/messages.ts.
 *
 * Tagged `@regression` so they opt in to the regression suite without
 * blocking every commit, mirroring user-messages-delete.spec.ts.
 */

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

const TWO_MESSAGES: Message[] = [
  buildMessage({ id: "edge-msg-1", subject: "First message" }),
  buildMessage({
    id: "edge-msg-2",
    subject: "Second message",
    threadName: "Revenue",
    organisationId: ids.organisationSecondary,
    isSeen: true,
  }),
]

interface ListStubOptions {
  /** Rows returned for an unfiltered GET. Defaults to TWO_MESSAGES. */
  messages?: Message[]
  /** Rows returned when the request carries a non-empty `search` param. */
  searchMessages?: Message[]
  /** HTTP status the DELETE handler replies with. Defaults to 200. */
  deleteStatus?: number
  /** Records the ids the UI attempted to delete. */
  onDelete?: (ids: string[]) => void
}

async function stubMessagingApis(page: Page, options: ListStubOptions = {}) {
  const {
    messages = TWO_MESSAGES,
    searchMessages = [],
    deleteStatus = 200,
    onDelete,
  } = options

  // Regex (not glob): matches list GETs through the gateway the same way
  // user-message-mark-as-read.spec.ts does. Glob `messages*` is fine for
  // relative paths but has bitten us on absolute SAG URLs before.
  await page.route(/\/messaging\/api\/v1\/messages/, async (route, request) => {
    if (request.method() === "GET") {
      const params = new URL(request.url()).searchParams
      const search = params.get("search")
      // The inbox paginates with limit/offset (see buildMessagesUrl in
      // unified-inbox.tsx) -- it never sends a `page` param. Slice on the
      // offset so page 2 (offset = limit) serves the next window.
      const limit = Number(params.get("limit") ?? "6")
      const offset = Number(params.get("offset") ?? "0")
      const all = search ? searchMessages : messages
      const slice = all.slice(offset, offset + limit)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: slice,
          metadata: { totalCount: all.length },
          error: null,
        }),
      })
      return
    }
    if (request.method() === "DELETE") {
      const body = request.postDataJSON() as { ids: string[] } | null
      onDelete?.(body?.ids ?? [])
      if (deleteStatus >= 400) {
        await route.fulfill({
          status: deleteStatus,
          contentType: "application/json",
          body: JSON.stringify({
            data: null,
            error: { statusCode: deleteStatus, message: "delete failed" },
          }),
        })
        return
      }
      await route.fulfill({
        status: deleteStatus,
        contentType: "application/json",
        body: JSON.stringify({ data: { ids: body?.ids ?? [] }, error: null }),
      })
      return
    }
    await route.continue()
  })
}

/**
 * Auth first lands wherever the IdP redirects (often `/en/messages`). If the
 * list stub is registered *after* that landing, SWR can cache the real (or
 * 503-empty) response and a later `goto("/en/messages")` never paints the
 * stubbed rows — build 117282 timed out on `First message` for exactly that.
 * Install the route before login so every messages GET is stubbed.
 *
 * Use an absolute messaging URL: login can settle on profile/dashboard, and a
 * relative `/en/messages` then hops zones. A fresh hop can bounce to MyGovId
 * again (Nightly 117543 / build 125157: stuck on mock-login waiting for
 * `search-input` after a 5s probe).
 */
async function openStubbedInbox(
  browser: Browser,
  options: ListStubOptions = {},
): Promise<Page> {
  const page = await createPageWithVideo(browser)
  await page.context().clearCookies()
  await stubMessagingApis(page, options)
  await loginAsCitizen(page, users.peterParker.email)
  await settleMessagingInbox(page, users.peterParker.email)
  return page
}

test.describe("Unified Inbox edge cases @regression", () => {
  test("empty inbox renders the empty state and no rows", async ({
    browser,
  }) => {
    const page = await openStubbedInbox(browser, { messages: [] })

    await expect(page.getByText("You have no messages")).toBeVisible()
    // No selectable rows are rendered when the list is empty.
    await expect(page.locator('[data-testid^="select-row-"]')).toHaveCount(0)

    await page.close()
  })

  test("a search that matches nothing shows the no-results state", async ({
    browser,
  }) => {
    // Unfiltered list has two messages; any search returns nothing.
    const page = await openStubbedInbox(browser, { searchMessages: [] })
    // Sanity: the populated list is shown before searching. Prefer the
    // checkbox test id over role=row — same handle the delete specs use.
    await expect(page.getByTestId("select-row-edge-msg-1")).toBeVisible()

    // Enter submits the search (see the InputText onKeyDown in
    // unified-inbox-table.tsx); the refetch carries `?search=`.
    await page.getByTestId("search-input").fill("zzz-no-such-message-zzz")
    await page.getByTestId("search-input").press("Enter")

    await expect(
      page.getByText("No messages matched your search."),
    ).toBeVisible()
    await expect(page.locator('[data-testid^="select-row-"]')).toHaveCount(0)

    await page.close()
  })

  test("Reset returns to the full inbox list after a search", async ({
    browser,
  }) => {
    const page = await openStubbedInbox(browser, { searchMessages: [] })
    await expect(page.getByTestId("select-row-edge-msg-1")).toBeVisible()

    await page.getByTestId("search-input").fill("zzz-no-such-message-zzz")
    await page.getByTestId("search-input").press("Enter")

    await expect(
      page.getByText("No messages matched your search."),
    ).toBeVisible()

    await page.getByRole("button", { name: "Clear input" }).click()

    await expect(page.getByTestId("select-row-edge-msg-1")).toBeVisible()
    await expect(page.getByTestId("search-input")).toHaveValue("")

    await page.close()
  })

  test("clearing search after page reload returns the full inbox list", async ({
    browser,
  }) => {
    const page = await openStubbedInbox(browser, { searchMessages: [] })
    await expect(page.getByTestId("select-row-edge-msg-1")).toBeVisible()

    await page.getByTestId("search-input").fill("zzz-no-such-message-zzz")
    await page.getByTestId("search-input").press("Enter")

    await expect(
      page.getByText("No messages matched your search."),
    ).toBeVisible()

    await page.reload()
    await expect(page.getByTestId("search-input")).toHaveValue(
      "zzz-no-such-message-zzz",
    )

    await page.getByRole("button", { name: "Clear input" }).click()

    await expect(page.getByTestId("select-row-edge-msg-1")).toBeVisible()
    await expect(page.getByTestId("search-input")).toHaveValue("")
    await expect(page.getByTestId("search-pending-spinner")).toHaveCount(0)

    await page.close()
  })

  test("a failed delete surfaces the error toast and keeps the row", async ({
    browser,
  }) => {
    const attempted: string[][] = []
    const page = await openStubbedInbox(browser, {
      deleteStatus: 500,
      onDelete: (ids) => attempted.push(ids),
    })

    await expect(page.getByTestId("select-row-edge-msg-1")).toBeVisible()
    await page.getByTestId("select-row-edge-msg-1").check()
    await page.getByTestId("bulk-delete-button").click()

    await expect(page.getByTestId("delete-confirmation-modal")).toBeVisible()
    await page.getByTestId("delete-confirmation-confirm").click()

    // The danger toast fires, not the success one.
    await expect(page.getByTestId("delete-failure-toast")).toBeVisible()
    await expect(page.getByTestId("delete-success-toast")).toHaveCount(0)

    // The delete was attempted server-side but, having failed, the row
    // must remain in the list (the post-settle refresh re-serves it).
    expect(attempted.flat()).toContain("edge-msg-1")
    await expect(page.getByTestId("select-row-edge-msg-1")).toBeVisible()

    await page.close()
  })

  test("a long list paginates and page 2 serves the next slice", async ({
    browser,
  }) => {
    // 42 messages over a page size of 20 → 3 pages. Zero-padded subjects
    // keep regex row lookups unambiguous (e.g. /item 07/ won't match 17).
    const many: Message[] = Array.from({ length: 42 }, (_, i) =>
      buildMessage({
        id: `edge-page-${i + 1}`,
        subject: `Inbox item ${String(i + 1).padStart(2, "0")}`,
      }),
    )
    const page = await openStubbedInbox(browser, { messages: many })

    // Page 1: first 20 items present, the 21st is not.
    await expect(page.getByTestId("select-row-edge-page-1")).toBeVisible()
    await expect(page.getByTestId("select-row-edge-page-6")).toBeVisible()
    await expect(page.getByTestId("select-row-edge-page-21")).toHaveCount(0)

    // Page 2: the next slice is served and the first-page items are gone.
    await page.goto(`${urls.messaging}/en/messages?page=2`)
    await expect(page.getByTestId("search-input")).toBeVisible()
    await expect(page.getByTestId("select-row-edge-page-1")).toHaveCount(0)
    await expect(page.getByTestId("select-row-edge-page-21")).toBeVisible()
    await expect(page.getByTestId("select-row-edge-page-40")).toBeVisible()

    await page.close()
  })
})
