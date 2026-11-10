import { DELETED_FOLDER_ID, INBOX_FOLDER_ID } from "@/api/messages"
import { ANALYTICS } from "@/const/analytics"

/** The event for navigating to a message list: the Inbox, Deleted, or one of the citizen's Folders. */
export function listOpenedEvent(folderId: string) {
  if (folderId === INBOX_FOLDER_ID) return ANALYTICS.message.inboxOpen
  if (folderId === DELETED_FOLDER_ID) return ANALYTICS.message.deletedOpen
  return ANALYTICS.folder.open
}
