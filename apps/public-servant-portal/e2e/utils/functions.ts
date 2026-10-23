import { expect, type Page } from "@playwright/test"
import { templates, urls } from "../fixtures"
import { sendMessageAndVerify } from "./message-helpers"
import { navigateAndVerifyHeading } from "./navigation-helpers"
import { addNewRecipient } from "./recipient-helpers"

const ADMIN_URL = urls.admin

export const generateTestData = () => ({
  uuid: crypto.randomUUID(),
  timestamp: `${Date.now()}-${crypto.randomUUID()}`,
})

export async function sendE2ETemplateMessage(page: Page, nonSecure = false) {
  await navigateAndVerifyHeading(
    page,
    `${ADMIN_URL}/en/send-a-message`,
    "Send a message",
  )
  await page.selectOption("select#template-select", templates.e2e)
  //if nonsecure message click button
  if (nonSecure) {
    await page.getByRole("radio", { name: "Non-secured" }).click()
  }
  await clickButton(page, "Continue to recipients")

  await page.waitForLoadState("domcontentloaded")
  await expect(
    page.getByLabel("Search").getByRole("cell", { name: "List is empty" }),
  ).toBeHidden()
}

export async function searchByText(
  page: Page,
  searchText: string,
  searchButtonName = "Search",
) {
  await page.getByRole("textbox", { name: "Search" }).fill(searchText)
  await page.getByRole("button", { name: searchButtonName }).click()
}

export async function clickButton(page: Page, buttonName: string) {
  await page.getByRole("button", { name: buttonName }).click()
}

export async function logout(page: Page) {
  if (page.url().includes("-admin")) {
    await page.goto(`${urls.profileService}/global-signout`)
  } else {
    await clickButton(page, "Menu")
    await clickButton(page, "Logout")
  }
  await expect(page.getByText("Mock Login")).toBeVisible({
    timeout: 15000,
  })
}

export async function sendMessageToDevCitizen(page: Page, nonSecure = false) {
  await navigateAndVerifyHeading(
    page,
    `${ADMIN_URL}/en/send-a-message`,
    "Send a message",
  )
  await page.selectOption("select#template-select", templates.e2e)
  //if nonsecure message click button
  if (nonSecure) {
    await page.getByRole("radio", { name: "Non-secured" }).click()
  }

  await clickButton(page, "Continue to recipients")

  await page.waitForLoadState("domcontentloaded")
  await expect(
    page.getByLabel("Search").getByRole("cell", { name: "List is empty" }),
  ).toBeHidden()

  await page
    .getByRole("tabpanel", { name: "Search" })
    .locator('input[name="email"]')
    .fill("messagingie2@")
  await page.getByRole("button", { name: "Search" }).click()
  await expect(
    page.getByLabel("Search").getByRole("cell", { name: "List is empty" }),
  ).toBeHidden()

  await expect(page.getByRole("cell", { name: "messaging ie2" })).toBeVisible()
  const addRecipient = page
    .getByRole("row", { name: "messaging ie2 <messagingie2@gmail.com>" })
    .getByRole("button", { name: "Add recipient" })
  // Both the desktop and mobile row variants carry this same aria-label, and an
  // opted-out recipient renders them disabled. Without this check `.click()`
  // spends the entire test timeout in actionability polling and reports only
  // "target closed", which says nothing about why.
  await expect(addRecipient).toBeEnabled({ timeout: 10_000 })
  await addRecipient.click()
  await clickButton(page, "Continue to Attachments")
  await clickButton(page, "Skip")
  await sendMessageAndVerify(page)
}

export async function sendMessageToNewEmailAddress(
  page: Page,
  nonSecure = false,
) {
  await navigateAndVerifyHeading(
    page,
    `${ADMIN_URL}/en/send-a-message`,
    "Send a message",
  )
  await page.selectOption("select#template-select", templates.e2e)
  //if nonsecure message click button
  if (nonSecure) {
    await page.getByRole("radio", { name: "Non-secured" }).click()
  }

  await clickButton(page, "Continue to recipients")

  await page.waitForLoadState("domcontentloaded")
  await expect(
    page.getByLabel("Search").getByRole("cell", { name: "List is empty" }),
  ).toBeHidden()

  const email = await addNewRecipient(page)

  await clickButton(page, "Continue to Attachments")
  await clickButton(page, "Skip")
  await sendMessageAndVerify(page)
  return email.recipientEmail
}
