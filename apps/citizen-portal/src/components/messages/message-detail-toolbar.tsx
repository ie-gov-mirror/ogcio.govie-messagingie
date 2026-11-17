"use client"

import { Icon, type IconProps, Link } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import { ANALYTICS } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"
import styles from "./message-detail.module.css"

export interface MessageDetailToolbarProps {
  backHref: string
  onMove?: () => void
  onDelete: () => void
  /** Deleted folder: Restore and Erase replace Move and Delete. */
  deletedActions?: { onRestore: () => void; onErase: () => void }
  isDeleting?: boolean
  isMoving?: boolean
}

export function MessageDetailToolbar({
  backHref,
  onMove,
  onDelete,
  deletedActions,
  isDeleting = false,
  isMoving = false,
}: MessageDetailToolbarProps) {
  const tBack = useTranslations("home.button")
  const tMove = useTranslations("home.move")
  const tDetail = useTranslations("home.detail")
  const track = useTrack()

  const actionDisabled = isDeleting || isMoving

  return (
    <nav className={styles.toolbar} aria-label={tDetail("toolbarAriaLabel")}>
      <Link
        noColor
        noUnderline
        href={backHref}
        className={styles.toolbarAction}
        aria-label={tBack("back")}
        onClick={() => track.event(ANALYTICS.message.back)}
      >
        <Icon
          icon='arrow_back'
          size='md'
          className={styles.toolbarIcon}
          ariaHidden
        />
        <span className={styles.toolbarLabel}>{tBack("back")}</span>
      </Link>
      <div className={styles.toolbarGroup}>
        {deletedActions ? (
          <>
            <ToolbarAction
              testId='detail-restore-button'
              icon='restore_from_trash'
              label={tDetail("restore")}
              disabled={actionDisabled}
              onClick={deletedActions.onRestore}
            />
            <ToolbarAction
              testId='detail-erase-button'
              icon='delete_forever'
              label={tDetail("erase")}
              disabled={actionDisabled}
              onClick={deletedActions.onErase}
            />
          </>
        ) : null}
        {!deletedActions && onMove ? (
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
        {deletedActions ? null : (
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
        )}
      </div>
    </nav>
  )
}

function ToolbarAction({
  testId,
  icon,
  label,
  disabled,
  onClick,
}: {
  testId: string
  icon: string
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Link
      noColor
      href='#'
      className={styles.toolbarAction}
      data-testid={testId}
      aria-disabled={disabled}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault()
        if (disabled) return
        onClick()
      }}
    >
      <Icon
        icon={icon as IconProps["icon"]}
        size='md'
        className={styles.toolbarIcon}
        ariaHidden
      />
      <span className={styles.toolbarLabel}>{label}</span>
    </Link>
  )
}
