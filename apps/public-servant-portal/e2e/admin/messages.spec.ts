import path from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { authenticateUser } from "../helpers/auth"
import { createPageWithVideo } from "../helpers/browser-context"
import { clickButton, sendE2ETemplateMessage } from "../utils/functions"
import { scheduleMessage, sendMessageAndVerify } from "../utils/message-helpers"
import { addNewRecipient } from "../utils/recipient-helpers"

const TEST_PDF_FILENAME = "payslip.pdf"

let authenticatedPage: Page

test.describe("Admin Message Sending", () => {
  test.beforeAll(async ({ browser }) => {
    authenticatedPage = await createPageWithVideo(browser)
    await authenticateUser(authenticatedPage)
  })

  test.afterAll(async () => {
    await authenticatedPage.close()
  })

  test("an admin can send a secure message using send now to two recipients @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage)

    await addNewRecipient(authenticatedPage)
    //add second recipient
    await addNewRecipient(authenticatedPage)

    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")
    await sendMessageAndVerify(authenticatedPage)
  })

  test("an admin can send a secure message with an attachment @regression", async () => {
    const pdfPath = path.join(__dirname, TEST_PDF_FILENAME)

    await sendE2ETemplateMessage(authenticatedPage)

    await addNewRecipient(authenticatedPage)
    //add second recipient
    await addNewRecipient(authenticatedPage)

    await clickButton(authenticatedPage, "Continue to Attachments")

    await authenticatedPage.locator('input[type="file"]').setInputFiles(pdfPath)
    await expect(
      authenticatedPage.getByText("Attachments uploaded"),
    ).toBeVisible()
    // Exact: `next dev` adds an "Open Next.js Dev Tools" button
    await authenticatedPage
      .getByRole("button", { name: "Next", exact: true })
      .click()

    await sendMessageAndVerify(authenticatedPage)
  })

  test("an admin cannot attach a file larger than 5MB @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage)
    await addNewRecipient(authenticatedPage)
    await clickButton(authenticatedPage, "Continue to Attachments")

    await authenticatedPage.locator('input[type="file"]').setInputFiles({
      name: "too-large.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    })

    await expect(
      authenticatedPage.getByText(
        "The file size exceeds the maximum allowed limit.",
      ),
    ).toBeVisible()
    await expect(authenticatedPage.getByText("too-large.pdf")).toHaveCount(0)
  })

  test("an admin must enter a date when scheduling a message @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage)
    await addNewRecipient(authenticatedPage)
    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")

    await authenticatedPage.getByRole("radio", { name: "Send later" }).click()
    await clickButton(authenticatedPage, "Send message")

    await expect(authenticatedPage.getByText("Invalid date")).toBeVisible()
    await expect(
      authenticatedPage.getByRole("heading", {
        name: "Your message was scheduled",
      }),
    ).toHaveCount(0)
  })

  test("an admin must enter a time when scheduling a message @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage)
    await addNewRecipient(authenticatedPage)
    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")

    await authenticatedPage.getByRole("radio", { name: "Send later" }).click()
    await authenticatedPage
      .getByRole("textbox", { name: "Date" })
      .fill("2099-01-01")
    await clickButton(authenticatedPage, "Send message")

    await expect(authenticatedPage.getByText("Invalid time")).toBeVisible()
    await expect(
      authenticatedPage.getByRole("heading", {
        name: "Your message was scheduled",
      }),
    ).toHaveCount(0)
  })

  test("an admin can send a secure message using send now to a new recipient @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage)

    const { recipientName } = await addNewRecipient(authenticatedPage)
    await expect(
      authenticatedPage.getByRole("cell", { name: recipientName }),
    ).toBeVisible()

    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")
    await sendMessageAndVerify(authenticatedPage)
  })

  test("an admin can send a non secure message using send now @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage, true)

    const { recipientEmail } = await addNewRecipient(authenticatedPage)
    await expect(
      authenticatedPage.getByRole("cell", { name: recipientEmail }).first(),
    ).toBeVisible()

    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")
    await sendMessageAndVerify(authenticatedPage)
  })

  test("an admin can send a secure message using schedule @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage)
    await addNewRecipient(authenticatedPage)
    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")
    await scheduleMessage(authenticatedPage)
  })

  test("an admin can send a non secure message using schedule @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage, true)
    await addNewRecipient(authenticatedPage)
    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")
    await scheduleMessage(authenticatedPage)
  })

  test("an admin can send a non secure message to two recipients using schedule @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage, true)
    await addNewRecipient(authenticatedPage)
    await addNewRecipient(authenticatedPage)
    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")
    await scheduleMessage(authenticatedPage)
  })

  test("clicking send another message takes you back to the first page @regression", async () => {
    await sendE2ETemplateMessage(authenticatedPage)
    await authenticatedPage.getByRole("button", { name: "Add" }).first().click()
    await clickButton(authenticatedPage, "Continue to Attachments")
    await clickButton(authenticatedPage, "Skip")
    await sendMessageAndVerify(authenticatedPage)
    await authenticatedPage
      .getByRole("button", { name: "Send another message" })
      .click()
    await expect(authenticatedPage).toHaveURL(/\/en\/send-a-message/)
    await expect(
      authenticatedPage.getByRole("heading", { name: "Send a message" }),
    ).toBeVisible()
  })
})
