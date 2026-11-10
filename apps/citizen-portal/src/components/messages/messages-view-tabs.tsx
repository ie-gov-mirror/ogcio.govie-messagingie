"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { DELETED_FOLDER_ID, INBOX_FOLDER_ID } from "@/api/messages"
import { useTrack } from "@/hooks/use-track"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import { listOpenedEvent } from "./list-opened-event"
import styles from "./messages-view-tabs.module.css"

/**
 * Inbox / Deleted switch on the Messages heading row (AB#45318 design
 * exploration, replacing the folder select). Inbox and Deleted are separate
 * URLs, not panels, so this is a `<nav>` of real links with `aria-current`
 * rather than ARIA tabs: no `role="tablist"`/`"tab"`/`aria-selected`, and
 * each link is its own tab stop.
 */
export function MessagesViewTabs() {
  const t = useTranslations("home")
  const tFolders = useTranslations("home.folders")
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()
  const track = useTrack()

  const activeFolder =
    searchParams.get("folder") === DELETED_FOLDER_ID
      ? DELETED_FOLDER_ID
      : INBOX_FOLDER_ID

  const hrefFor = (folderId: string) => {
    const params = new URLSearchParams(searchParams)
    params.delete("page")
    params.delete("id")
    if (folderId === INBOX_FOLDER_ID) {
      params.delete("folder")
    } else {
      params.set("folder", folderId)
    }
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const tabs = [
    { id: INBOX_FOLDER_ID, label: tFolders("inbox") },
    { id: DELETED_FOLDER_ID, label: tFolders("deleted") },
  ]

  return (
    <nav aria-label={t("heading")} className={styles.viewTabs}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeFolder
        return (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            aria-current={isActive ? "page" : undefined}
            scroll={false}
            prefetch={false}
            className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
            onClick={() => track.event(listOpenedEvent(tab.id))}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
