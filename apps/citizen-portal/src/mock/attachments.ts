import type { FileMetadata } from "@/api/upload"
import type { Message } from "@/types"
import { MOCK_MESSAGES_ENABLED } from "./messages"

/** Mock attachment ids mirror message ids with the leading `0` replaced by `1`. */
export function toMockAttachmentId(messageId: string): string {
  return `1${messageId.slice(1)}`
}

function isMockAttachmentId(attachmentId: string): boolean {
  return /^1000000[0-9a-f]-0000-4000-8000-0000000000[0-9a-f]{2}$/i.test(
    attachmentId,
  )
}

function mockAttachmentFileName(message: Pick<Message, "subject">): string {
  const monthMatch = message.subject.match(/month of (\w+)/i)
  if (monthMatch) {
    return `Payslip - ${monthMatch[1]}.pdf`
  }
  return "Attachment.pdf"
}

export function getMockAttachmentMetadata(
  attachmentId: string,
  message: Pick<Message, "subject" | "createdAt">,
): FileMetadata | null {
  if (!MOCK_MESSAGES_ENABLED || !isMockAttachmentId(attachmentId)) {
    return null
  }

  return {
    id: attachmentId,
    fileName: mockAttachmentFileName(message),
    fileSize: 230_000,
    mimeType: "application/pdf",
    key: "mock",
    ownerId: "mock",
    createdAt: message.createdAt,
    lastScan: message.createdAt,
    deleted: false,
    infected: false,
  }
}

export function getMockAttachmentIds(
  message: Pick<Message, "id" | "attachments" | "attachmentsCount">,
): string[] {
  if (message.attachments?.length) return message.attachments
  if (!MOCK_MESSAGES_ENABLED || !(message.attachmentsCount ?? 0)) return []
  return [toMockAttachmentId(message.id)]
}
