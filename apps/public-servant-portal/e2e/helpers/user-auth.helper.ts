import { type Browser, expect, type Page } from "@playwright/test"
import { getUserByEmail, urls } from "../fixtures"
import { createPageWithVideo } from "./browser-context"

export async function loginAsCitizen(
  page: Page,
  citizenName: string,
): Promise<void> {
  // Go to the main page which will redirect to auth
  await page.goto(urls.messaging)

  await page.waitForURL(`${urls.mock}/**`)

  await page
    .locator(
      "#login-form > div > div.gi-w-full > div:nth-child(1) > div.gi-accordion > div",
    )
    .click()
  await page
    .locator(
      "#login-form > div > div.gi-w-full > div:nth-child(2) > div.gi-accordion > div",
    )
    .click()

  const user = getUserByEmail(citizenName)
  if (user) {
    await page.locator("#firstName").fill(user.firstName)
    await page.locator("#lastName").fill(user.lastName)
    await page.locator("#email").fill(user.email)
  }

  await page.getByRole("button", { name: "LOGIN" }).click()

  // Wait for redirect to complete
  await expect(page).toHaveURL(/.*\/en\//)
}

export async function createAuthenticatedPage(
  browser: Browser,
  citizenName: string,
): Promise<Page> {
  const page = await createPageWithVideo(browser)
  await page.context().clearCookies()
  await loginAsCitizen(page, citizenName)
  return page
}

export async function setSafeLevel(
  page: Page,
  safeLevel: string,
): Promise<void> {
  await page
    .locator(".gi-accordion")
    .filter({ has: page.locator("#DSPOnlineLevel") })
    .locator(":scope > div")
    .click()
  await page.locator("#DSPOnlineLevel").fill(safeLevel)
  await page.locator("#DSPOnlineLevelStatic").fill(safeLevel)
  await page.getByRole("button", { name: "LOGIN" }).click()
  await expect(page).toHaveURL(/.*\/en\//)
}

export async function setSafeLevelAndUser(
  page: Page,
  safeLevel: string,
  user: string,
): Promise<void> {
  await page
    .locator(".gi-accordion")
    .filter({ has: page.locator("#email") })
    .locator(":scope > div")
    .click()
  await page.locator("#email").fill(user)
  await setSafeLevel(page, safeLevel)
}
