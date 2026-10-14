import { expect, type Locator, type Page } from "@playwright/test"

const MAX_DIFF_PIXEL_RATIO = 0.02

/**
 * Skeletons and spinners a page shows while its cards fetch. Waiting for a
 * heading is not enough: the dashboard renders "Welcome back" immediately and
 * resolves its submissions card ~8s later, and `toHaveScreenshot` disables CSS
 * animations, so a spinner sits perfectly still and passes the built-in
 * two-shot stability check. That is how CI captured a mid-load 786px dashboard
 * and reported it as "stable" against the 720px baseline.
 */
const LOADING = '[aria-busy="true"], [class*="spinner"]'

/**
 * Regions carrying content that legitimately differs between runs, masked out
 * so they cannot fail a snapshot on their own churn.
 *
 * Matched on visible text rather than class names on purpose: the dashboard and
 * profile zones are separate deployments whose CSS-module classes are hashed at
 * build time (`dashboard-panel-module__-v5qCa__body`), so a class selector here
 * would silently stop matching on their next release and take the masking with
 * it. A locator that matches nothing is not an error, so masks are only ever
 * applied on the page that has them.
 */
/**
 * List cards are a fixed 96px (`list-card.module.css`). Masking paints over
 * the row but leaves it in the layout, so a second recent message makes the
 * full-page screenshot exactly 96px taller (build 123736: 786→882 and
 * 1289→1385). Keep the first card; drop the rest before capture.
 */
async function keepFirstPreviewCard(page: Page, title: string) {
  const cards = page
    .locator("section")
    .filter({ hasText: title })
    .getByRole("button")
    .filter({ hasNotText: "View all" })
  await cards.evaluateAll((els) => {
    for (const el of els.slice(1)) el.remove()
  })
}

function volatileRegions(page: Page): Locator[] {
  return [
    // Dashboard: the recent-messages rows. Their subjects and dates come from
    // whatever the rest of the suite has sent this citizen.
    page
      .locator("section")
      .filter({ hasText: "Your recent messages" })
      .getByRole("button")
      .filter({ hasNotText: "View all messages" }),
    // Profile: the export banner quotes an absolute expiry date thirty days
    // out and a countdown to it, so it is wrong by tomorrow. The date and the
    // countdown render as separate elements, hence the separate matchers.
    page.getByText(/will be available until/),
    page.getByText(/days remaining/),
    page.getByText(/Next export available in/),
  ]
}

/** Screenshots `page` once nothing on it is still loading. */
export async function expectSettledScreenshot(page: Page, name: string) {
  await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 30_000 })
  await keepFirstPreviewCard(page, "Your recent messages")
  await keepFirstPreviewCard(page, "Your recent submissions")
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    mask: volatileRegions(page),
  })
}
