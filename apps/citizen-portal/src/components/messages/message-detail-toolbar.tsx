"use client"

import { Icon, type IconProps, Link } from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import { useTranslations } from "next-intl"
import { ANALYTICS } from "@/const/analytics"
import styles from "./message-detail.module.css"

export interface MessageDetailToolbarProps {
  backHref: string
  onMove?: () => void
  onDelete: () => void
  isDeleting?: boolean
  isMoving?: boolean
}

export function MessageDetailToolbar({
  backHref,
  onMove,
  onDelete,
  isDeleting = false,
  isMoving = false,
}: MessageDetailToolbarProps) {
  const tBack = useTranslations("home.button")
  const tMove = useTranslations("home.move")
  const tDetail = useTranslations("home.detail")
  const analyticsClient = useAnalytics()

  const actionDisabled = isDeleting || isMoving

  return (
    <nav className={styles.toolbar} aria-label={tDetail("toolbarAriaLabel")}>
      <Link
        noColor
        noUnderline
        href={backHref}
        className={styles.toolbarAction}
        aria-label={tBack("back")}
        onClick={() =>
          analyticsClient.trackEvent({
            event: {
              name: ANALYTICS.message.back.name,
              category: ANALYTICS.message.category,
              action: ANALYTICS.message.back.action,
            },
          })
        }
      >
        <Icon
          icon='chevron_left'
          size='md'
          className={styles.toolbarIcon}
          ariaHidden
        />
        <span className={styles.toolbarLabel}>{tBack("back")}</span>
      </Link>
      <div className={styles.toolbarGroup}>
        {onMove ? (
          <Link
            noColor
            href='#'
            className={styles.toolbarAction}
            data-testid='detail-move-button'
            aria-disabled={actionDisabled}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault()
              if (actionDisabled) return
              onMove()
            }}
          >
            <Icon
              icon={"drive_file_move" as IconProps["icon"]}
              size='md'
              className={styles.toolbarIcon}
              ariaHidden
            />
            <span className={styles.toolbarLabel}>{tMove("toolbar")}</span>
          </Link>
        ) : null}
        <Link
          noColor
          href='#'
          className={styles.toolbarAction}
          data-testid='detail-delete-button'
          aria-disabled={actionDisabled}
          onClick={(e: React.MouseEvent) => {
            e.preventDefault()
            if (actionDisabled) return
            onDelete()
          }}
        >
          <Icon
            icon='delete'
            size='md'
            className={styles.toolbarIcon}
            ariaHidden
          />
          <span className={styles.toolbarLabel}>{tDetail("delete")}</span>
        </Link>
      </div>
    </nav>
  )
}
