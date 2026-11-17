"use client"

import { Button, DataTableSelectedRowsBanner } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import styles from "./unified-inbox-table.module.css"

export interface BulkActionToolbarProps {
  selectedCount: number
  onDelete: () => void
  /**
   * Deleted folder: Restore and Erase replace Delete, which would only
   * soft-delete a message that is already deleted.
   */
  deletedActions?: { onRestore: () => void; onErase: () => void }
  onClearSelection?: () => void
  /**
   * Slot for additional bulk actions (e.g. the upcoming `Move to folder`
   * control from the Folders feature). Rendered alongside the Delete button
   * inside the same action cluster so they share the same visual treatment.
   */
  extraActions?: ReactNode
}

/**
 * Thin wrapper around DS `DataTableSelectedRowsBanner` that routes the
 * selection count and destructive action through the same design-system
 * chrome (gray-900 surface, rounded-md, light buttons) that the DS data
 * table uses on desktop.
 *
 * DS i18n divergence: `DataTableSelectedRowsBanner` derives its own label
 * from react-i18next (`dataTable.selectedRows`) with an English
 * `(N Rows selected)` default value. This app uses next-intl and does
 * not bootstrap the DS i18next instance, so the built-in label would
 * fall back to the English default on every locale. We route our
 * next-intl translation through the `actions` slot instead and hide the
 * DS-owned label via the shared `.bulkBannerHideDefaultLabel` rule in
 * [unified-inbox-table.module.css](./unified-inbox-table.module.css) so
 * only the localised copy remains visible.
 */
export function BulkActionToolbar({
  selectedCount,
  onDelete,
  deletedActions,
  onClearSelection,
  extraActions,
}: BulkActionToolbarProps) {
  const t = useTranslations("home.delete.toolbar")

  if (selectedCount === 0) return null

  return (
    <DataTableSelectedRowsBanner
      data-testid='bulk-action-toolbar'
      selectedCount={selectedCount}
      className={styles.bulkBannerHideDefaultLabel}
      aria-label={t("ariaLabel")}
      actions={
        <>
          <span aria-live='polite' className={styles.bulkBannerCount}>
            {t("selectedCount", { count: selectedCount })}
          </span>
          {extraActions}
          {deletedActions ? (
            <>
              <Button
                data-testid='bulk-restore-button'
                variant='secondary'
                appearance='light'
                size='small'
                onClick={deletedActions.onRestore}
              >
                {t("restore")}
              </Button>
              <Button
                data-testid='bulk-erase-button'
                variant='secondary'
                appearance='light'
                size='small'
                onClick={deletedActions.onErase}
              >
                {t("erase")}
              </Button>
            </>
          ) : (
            <Button
              data-testid='bulk-delete-button'
              variant='secondary'
              appearance='light'
              size='small'
              onClick={onDelete}
            >
              {t("delete")}
            </Button>
          )}
          {onClearSelection ? (
            <Button
              data-testid='bulk-clear-selection-button'
              variant='secondary'
              appearance='light'
              size='small'
              onClick={onClearSelection}
            >
              {t("clearSelection")}
            </Button>
          ) : null}
        </>
      }
    />
  )
}
