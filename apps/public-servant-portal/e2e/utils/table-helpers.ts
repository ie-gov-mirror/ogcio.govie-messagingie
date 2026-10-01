import { expect, type Page } from "@playwright/test"

export async function verifyTableContents(
  page: Page,
  expectedContent: string | RegExp,
) {
  const rows = page.locator("table tbody tr")
  const expected =
    typeof expectedContent === "string"
      ? new RegExp(RegExp.escape(expectedContent), "i")
      : expectedContent

  // Wait for the filtered rows and guard against a vacuous pass.
  await expect(rows.first()).toContainText(expected)

  for (let index = 1; index < (await rows.count()); index++) {
    await expect(rows.nth(index)).toContainText(expected)
  }
}
