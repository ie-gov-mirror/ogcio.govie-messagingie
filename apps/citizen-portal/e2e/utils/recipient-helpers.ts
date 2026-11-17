import type { Page } from "@playwright/test"
import type { PortalUser } from "../fixtures"
import { generateTestData } from "./functions"

/** Adds a new recipient: the given user, or a random one by default. */
export async function addNewRecipient(page: Page, recipient?: PortalUser) {
  const { uuid } = generateTestData()
  const recipientEmail = recipient?.email ?? `messagingie2+${uuid}@gmail.com`
  const recipientName = recipient?.firstName ?? `Name${Date.now()}`
  const recipientSurname = recipient?.lastName ?? `Surname${Date.now()}`

  await page.getByRole("tab", { name: "Add new" }).click()
  const addRecipientForm = page.locator("#addform")
  await addRecipientForm.locator("#firstNameNew").fill(recipientName)
  await addRecipientForm.locator("#surnameNew").fill(recipientSurname)
  await addRecipientForm.locator("#emailNew").fill(recipientEmail)
  await addRecipientForm.getByRole("button", { name: "Add" }).click()

  return { recipientEmail, recipientName, recipientSurname }
}
