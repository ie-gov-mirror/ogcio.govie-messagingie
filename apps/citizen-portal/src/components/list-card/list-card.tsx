"use client"

import { Icon } from "@ogcio/design-system-react"
import type { ReactNode } from "react"
import { CheckboxIndicatorIcon } from "@/components/icons/checkbox-indicator"
import styles from "./list-card.module.css"

export interface ListCardProps {
  /** Primary label shown on the header row (e.g. sender name). */
  title: ReactNode
  /** Date or timestamp shown on the trailing edge of the header row. */
  date: ReactNode
  /** Secondary summary line styled as a link preview. */
  preview: ReactNode
  /**
   * Whether the preview line is underlined. Defaults to `true` (the inbox
   * look). LEA surfaces set this `false` — the whole card is the link, so
   * the preview is blue with no underline.
   */
  previewUnderline?: boolean
  /** When true, renders the attachment paperclip icon. */
  hasAttachment?: boolean
  attachmentAriaLabel?: string
  /** Screen-reader-only read/unread status label. */
  statusLabel?: string
  isUnread?: boolean
  isSelected?: boolean
  /** When true, shows the small checkbox indicator for bulk selection. */
  showCheckbox?: boolean
  isChecked?: boolean
  onClick?: () => void
  /** Applied to the checkbox indicator wrapper for tests. */
  checkboxTestId?: string
  className?: string
}

export function ListCard({
  title,
  date,
  preview,
  previewUnderline = true,
  hasAttachment = false,
  attachmentAriaLabel,
  statusLabel,
  isUnread = false,
  isSelected = false,
  showCheckbox = false,
  isChecked = false,
  onClick,
  checkboxTestId,
  className,
}: ListCardProps) {
  // Bold weight is the only read/unread cue (no grey fill, no dot). Unread
  // stays bold while selected — only the background changes to the selected
  // tint, so the weight still tells you whether the item was read.
  const weightClass = isUnread ? styles.emphasized : styles.regular
  const previewClass = [
    styles.preview,
    previewUnderline ? "" : styles.previewPlain,
  ]
    .filter(Boolean)
    .join(" ")

  const stateClasses = [
    styles.card,
    isSelected ? styles.cardSelected : "",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button
      type='button'
      onClick={onClick}
      className={stateClasses}
      aria-pressed={showCheckbox ? isChecked : undefined}
    >
      {statusLabel ? <span className='gi-sr-only'>{statusLabel}</span> : null}
      {showCheckbox ? (
        <span
          className={styles.checkbox}
          aria-hidden='true'
          data-testid={checkboxTestId}
        >
          {/* 24px = DS `.gi-input-checkbox-small`, the select-all in the list
              header. `sm` (16px) would read as a different checkbox. */}
          <CheckboxIndicatorIcon checked={isChecked} size='md' />
        </span>
      ) : null}
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={`${styles.title} ${weightClass}`}>{title}</span>
          <span className={`${styles.date} ${weightClass}`}>{date}</span>
        </div>
        <div className={styles.previewRow}>
          <span className={`${previewClass} ${weightClass}`}>{preview}</span>
          {hasAttachment ? (
            <span className={styles.attachment}>
              <Icon
                icon='attach_file'
                ariaLabel={attachmentAriaLabel ?? "Has attachment"}
              />
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}
