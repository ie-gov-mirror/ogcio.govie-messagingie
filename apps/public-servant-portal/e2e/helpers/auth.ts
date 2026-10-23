import { expect, type Page } from "@playwright/test"
import { urls, users } from "../fixtures"

export async function authenticateUser(page: Page) {
  // Go to the main messaging page which will redirect to auth with mygovid for mock login
  await page.goto(urls.messaging)

  // Wait for the MyGovID mock login page
  await page.waitForURL(`${urls.mock}/**`)

  // Fill in the login form
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
  await page.locator("#firstName").fill(users.publicServant1.firstName)
  await page.locator("#lastName").fill(users.publicServant1.lastName)
  await page.locator("#email").fill(users.publicServant1.email)

  await page.getByRole("button", { name: "LOGIN" }).click()

  // Wait for the redirect chain to complete and redirect to messaging-admin app
  await page.waitForURL(`${urls.admin}/en/**`)
  await expect(page).toHaveURL(`${urls.admin}/en/send-a-message`)
  await expect(
    page.getByRole("heading", { name: "Send a message" }),
  ).toBeVisible()
}
