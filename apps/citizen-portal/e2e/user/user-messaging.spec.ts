import { expect, type Page, test } from "@playwright/test"
import { users } from "../fixtures"
import {
  MESSAGE_SUBJECT,
  type MessageSender,
  openMessageSender,
  SENDER_SETUP_TIMEOUT,
} from "../helpers/message-sender"
import type { Attachment } from "../utils/functions"

const ROW_LINK = "message-row-link-"
// 1x1 PNG: an allowed attachment type the browser renders inline
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

// Unique per run: upload-api renames a file whose name its uploader already
// used, e.g. "e2e-attachment.png" -> "e2e-attachment-<random>.png"
const attachment: Attachment = {
  name: `e2e-attachment-${Date.now()}.png`,
  mimeType: "image/png",
  buffer: Buffer.from(PNG_BASE64, "base64"),
}

let page: Page
let sender: MessageSender

test.describe("User Messages page", () => {
  let messageId: string

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(SENDER_SETUP_TIMEOUT)
    sender = await openMessageSender(browser, users.peterParker)
    page = sender.citizen
    messageId = await sender.send()
  })

  test.afterAll(async () => {
    await sender?.close()
  })

  test("a user can open a message @smoke @regression", async () => {
    await page.goto("/en/messages")
    await page.getByTestId(`${ROW_LINK}${messageId}`).click()
    await expect(
      page.getByRole("heading", { name: MESSAGE_SUBJECT }),
    ).toBeVisible()
    await expect(page.getByText("Test rich text")).toBeVisible()
  })

  test.describe("with an attachment", () => {
    let attachmentMessageId: string

    // A send of its own: a failed upload fails the attachment tests only
    test.beforeAll(async () => {
      test.setTimeout(SENDER_SETUP_TIMEOUT)
      attachmentMessageId = await sender.send(attachment)
    })

    test("a user can open a message attachment @smoke @regression", async () => {
      // Skip the /secure-messages hop: that page only redirects into the unified
      // detail view once the ownership check finishes, and waiting on the
      // attachment action there burns the whole timeout on a loading shell.
      await page.goto(`/en/messages?id=${attachmentMessageId}`)
      const preview = page.getByTestId("attachment-preview-action")
      await expect(preview).toBeVisible()
      const [newPage] = await Promise.all([
        page.context().waitForEvent("page"),
        preview.click(),
      ])
      await newPage.waitForLoadState("domcontentloaded")
      // An error answer renders as JSON or HTML, the file as its own type
      expect(await newPage.evaluate(() => document.contentType)).toBe(
        attachment.mimeType,
      )
      await newPage.close()
    })

    test("a user can download a message attachment @smoke @regression", async () => {
      await page.goto(`/en/messages?id=${attachmentMessageId}`)
      const downloadAction = page.getByTestId("attachment-download-action")
      await expect(downloadAction).toBeVisible()

      const downloadPromise = page.waitForEvent("download")
      await downloadAction.click()
      const download = await downloadPromise

      await download.saveAs(`downloads/${download.suggestedFilename()}`)

      const path = await download.path()
      expect(path).not.toBeNull()
      expect(download.suggestedFilename()).toBe(attachment.name)
    })
  })
})
