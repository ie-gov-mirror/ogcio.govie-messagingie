import { expect, type Locator, type Page } from "@playwright/test"

/**
 * Desktop LEA destinations live in the side nav (`aria-label` "Main").
 * The header Menu button is mobile-only in that layout, and is the nav
 * when LEA is off.
 */
export async function appNav(page: Page): Promise<Locator> {
  const sideNav = page.getByRole("navigation", { name: "Main" })
  const menu = page.getByRole("button", { name: "Menu", exact: true })
  await expect(sideNav.or(menu)).toBeVisible()
  if (await sideNav.isVisible()) return sideNav
  await menu.click()
  return page.getByRole("dialog")
}

export async function navigateAndVerifyHeading(
  page: Page,
  path: string,
  headingText: string,
) {
  await page.goto(path)
  await expect(page.getByRole("heading", { name: headingText })).toBeVisible()
}

export async function navigateAndVerifySearch(
  page: Page,
  path: string,
  headingText: string,
) {
  await page.goto(path)
  await expect(page.getByRole("textbox", { name: headingText })).toBeVisible()
}
