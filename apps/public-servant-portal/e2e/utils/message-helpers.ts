import { expect, type Page } from "@playwright/test"

export async function sendMessageAndVerify(page: Page, sendLater = false) {
  const buttonName = sendLater ? "Send message" : "Send Message"
  await page.getByRole("button", { name: buttonName }).click()
  await expect(
    page.getByRole("heading", { name: "Your message was scheduled" }),
  ).toBeVisible()
}

export async function scheduleMessage(page: Page) {
  // Select send later option
  await page.getByRole("radio", { name: "Send later" }).click()

  // Set future date
  const date = new Date()
  const year = date.getFullYear() + 1
  const scheduleDate = `${year}-01-01`

  await page.getByRole("textbox", { name: "Date" }).fill(scheduleDate)
  await page.getByRole("textbox", { name: "Time" }).fill("12:00")

  await sendMessageAndVerify(page, true)
  await expect(
    page.getByText(`Scheduled: 01/01/${year} at 12:00`),
  ).toBeVisible()

  return { year }
}
