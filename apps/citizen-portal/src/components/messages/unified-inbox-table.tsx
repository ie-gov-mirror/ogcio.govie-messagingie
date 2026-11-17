"use client"

import {
  Button,
  DataTableFooter,
  DataTableFooterEnd,
  DataTableFooterStart,
  Icon,
  InputCheckbox,
  InputCheckboxTableCell,
  Table,
  TableBody,
  TableData,
  TableHead,
  TableHeader,
  TableRow,
} from "@ogcio/design-system-react"
import {
  SelectItem,
  SelectNative,
} from "@ogcio/design-system-react/select/select-native"
import { flexRender, useTable } from "@tanstack/react-table"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { ListCard } from "@/components/list-card/list-card"
import {
  clearSearchHref,
  ListNoResults,
  SKELETON_ROWS,
  SkeletonBar,
  SkeletonCard,
  SkeletonCheckbox,
} from "@/components/list-states/list-states"
import { type Column, features } from "@/components/tables/table-features"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import type { Message } from "@/types"
import { formatDate } from "@/util/datetime"
import { InboxInfiniteScrollFooter } from "./inbox-infinite-scroll-footer"
import { InboxPagination } from "./inbox-pagination"
import { SenderName } from "./sender-name"
import styles from "./unified-inbox-table.module.css"
import type { MessageSelection } from "./use-message-selection"

/**
 * Props the DS `InputCheckbox` exposes that we reuse for the table's
 * select-all and per-row checkboxes. DS toggles the `.gi-checkbox-indeterminate`
 * class when `indeterminate=true`, but the dash-on-fill visual it targets is
 * scoped to `:checked:before`, so we force `checked=true` whenever either the
 * row is fully selected OR the page is in mixed state. The accompanying
 * `aria-checked='mixed'` preserves the correct screen-reader announcement —
 * DS does NOT imperatively flip `HTMLInputElement.indeterminate`, only the
 * class name.
 */
function selectionCheckboxProps(args: {
  allSelected: boolean
  someSelected: boolean
}) {
  const { allSelected, someSelected } = args
  const indeterminate = someSelected && !allSelected
  return {
    size: "sm" as const,
    checked: allSelected || indeterminate,
    indeterminate,
    "aria-checked": indeterminate ? ("mixed" as const) : !!allSelected,
  }
}

const SKELETON_BAR_WIDTHS: Record<string, string> = {
  sender: "8.75rem",
  details: "23.75rem",
  date: "5rem",
}

export interface UnifiedInboxTableProps {
  messages: Message[]
  isLoading: boolean
  totalCount?: number
  onSelect: (id: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  selection?: MessageSelection
  selectMode?: boolean
  onEnterSelectMode?: () => void
  onExitSelectMode?: () => void
  /**
   * Handler invoked by the mobile select-mode header's Delete button.
   * Kept here (rather than on the selection object) because the delete
   * workflow — opening the confirmation modal, clearing selection on
   * success, showing alerts — lives in the parent `UnifiedInboxListView`
   * and the table is purely presentational.
   */
  onBulkDelete?: () => void
  /**
   * Deleted folder: the mobile select-mode header shows Restore and Erase in
   * place of Delete.
   */
  deletedActions?: { onRestore: () => void; onErase: () => void }
  /**
   * Opens the mobile folder panel. When provided, a `Folders` button is
   * rendered in the non-select mobile header (the desktop sidebar that hosts
   * folder navigation is hidden on mobile).
   */
  onOpenFolders?: () => void
  /**
   * Opens the move picker from the mobile select-mode header. Rendered only
   * when `canMove` is also true (i.e. there is at least one valid
   * destination folder and the current view is not Deleted).
   */
  onBulkMove?: () => void
  canMove?: boolean
  /**
   * Mobile infinite scroll (desktop keeps its tfoot pagination):
   * `hasMore` = more pages remain, `isLoadingMore` = a page is in flight,
   * `onLoadMore` = append the next page when the bottom sentinel is reached.
   */
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  /**
   * Overrides the desktop Details cell link target. Defaults to same-route
   * `?id=<id>` navigation used by the messages inbox. The submission detail
   * page injects a cross-zone URL here so it can reuse this grid without
   * changing the inbox's own navigation.
   */
  buildDetailHref?: (id: string) => string
}

export function UnifiedInboxTable({
  messages,
  isLoading,
  totalCount,
  onSelect,
  pageSize,
  onPageSizeChange,
  selection,
  selectMode = false,
  onEnterSelectMode,
  onExitSelectMode,
  onBulkDelete,
  deletedActions,
  onOpenFolders,
  onBulkMove,
  canMove = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  buildDetailHref,
}: UnifiedInboxTableProps) {
  const t = useTranslations("home.table")
  const tToolbar = useTranslations("home.delete.toolbar")
  const tMove = useTranslations("home.move")
  const tFolders = useTranslations("home.folders")
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()

  const defaultDetailHref = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams)
      params.set("id", id)
      return `${pathname}?${params.toString()}`
    },
    [pathname, searchParams],
  )
  const totalPages = Math.ceil((totalCount ?? 0) / pageSize)

  const selectionEnabled = Boolean(selection)
  /*
   * Mobile "select mode" has two entry points:
   *   1. explicit user tap on the mobile "Select" button (-> selectMode=true)
   *   2. an inherited non-empty selection from a wider viewport where the
   *      desktop table's always-visible checkboxes were used.
   * Without (2), switching from desktop to mobile with items already selected
   * leaves the bulk-action banner showing but the mobile rows rendered in
   * their non-select visual (no checkbox, no highlight, row taps open the
   * message), which reads as a broken/out-of-sync state. Deriving the
   * effective flag here keeps the mobile select-all header and each row's
   * appearance in lockstep with the real selection state.
   */
  const effectiveSelectMode =
    selectMode || Boolean(selection && selection.selectedCount > 0)

  const columns = useMemo<Column<Message>[]>(() => {
    const cols: Column<Message>[] = []

    if (selectionEnabled && selection) {
      cols.push({
        id: "select",
        meta: { size: "xs-fixed" },
        header: () => (
          <InputCheckboxTableCell
            id='select-all'
            value='all'
            aria-label={t("ariaLabel.selectAll")}
            checked={selection.allSelected || selection.someSelected}
            indeterminate={selection.someSelected}
            onChange={() => selection.toggleAll()}
            data-testid='select-all-checkbox'
          />
        ),
        cell: ({ row }) => (
          <InputCheckboxTableCell
            id={row.original.id}
            value={row.original.id}
            /*
             * The aria-label is synchronous, but the human-readable
             * sender name is fetched per-org on render (see
             * `<SenderName>`), so we can't surface it here without
             * plumbing a parent-level lookup map. The subject already
             * uniquely identifies the row for screen-reader users; we
             * intentionally fall back to the localized "Unknown
             * sender" string instead of leaking the raw `organisationId`
             * UUID or echoing the subject (which used to ship through
             * `threadName` and was the original "Sender shows the
             * subject" bug).
             */
            aria-label={t("ariaLabel.selectRow", {
              sender: t("unknownSender"),
              subject: row.original.subject,
            })}
            checked={selection.isSelected(row.original.id)}
            onChange={() => selection.toggle(row.original.id)}
            data-testid={`select-row-${row.original.id}`}
          />
        ),
      })
    }

    cols.push(
      {
        id: "sender",
        /*
         * The messaging-api list endpoint only exposes `organisationId`
         * (a UUID), never a human-readable sender name. Resolution to a
         * localized name happens client-side per row inside
         * `<SenderName>` against `/profile/api/v1/organisations/{id}`,
         * with SWR deduping rows that share an org down to a single
         * request per page. The accessor is kept on `organisationId`
         * purely so react-table's row model has a stable scalar value
         * for the column — the accessor is not exposed for sorting or
         * filtering in the UI.
         */
        accessorFn: (row) => row.organisationId,
        header: t("column.sender"),
        meta: { size: "md-fixed" },
        cell: ({ row }) => (
          <SenderName
            organisationId={row.original.organisationId}
            className={styles.senderCell}
          />
        ),
      },
      {
        id: "details",
        accessorKey: "subject",
        header: t("column.details"),
        meta: { size: "fluid" },
        /*
         * Whole-row navigation targets a real URL (`?id=<id>` on the same
         * route — see `selectMessage` in `unified-inbox.tsx`), so the click
         * target is a genuine `<a>` (Next `<Link>`) rather than an `onClick`
         * on the `<tr>`. It's rendered on the subject and stretched across
         * the row via `.rowLink::after` (see CSS), which keeps the anchor's
         * accessible name = subject while making the whole row the hit area
         * and gives keyboard focus, Enter-to-open, open-in-new-tab and
         * middle-click for free. `scroll={false}` matches the previous
         * `router.push(..., { scroll: false })` behaviour; `prefetch={false}`
         * avoids firing a prefetch per visible row.
         */
        cell: ({ row }) => (
          <Link
            href={
              buildDetailHref
                ? buildDetailHref(row.original.id)
                : defaultDetailHref(row.original.id)
            }
            scroll={false}
            prefetch={false}
            className={styles.rowLink}
            data-testid={`message-row-link-${row.original.id}`}
          >
            <span className={styles.detailsText}>{row.original.subject}</span>
          </Link>
        ),
      },
      {
        id: "attachment",
        accessorKey: "attachmentsCount",
        header: "",
        meta: { size: "xs-fixed" },
        cell: ({ row }) =>
          row.original.attachmentsCount ? (
            <span className='gi-inline-flex gi-items-center gi-justify-center gi-text-gray-600'>
              <Icon
                icon='attach_file'
                ariaLabel={`${row.original.attachmentsCount} ${t("attachment", { count: row.original.attachmentsCount })}`}
              />
            </span>
          ) : null,
      },
      {
        id: "date",
        accessorKey: "createdAt",
        header: t("column.date"),
        meta: { size: "sm-fixed" },
        cell: ({ getValue }) => (
          <time dateTime={getValue<string>()}>
            {formatDate(getValue<string>(), "short")}
          </time>
        ),
      },
    )

    return cols
  }, [selectionEnabled, selection, t, buildDetailHref, defaultDetailHref])

  const table = useTable({
    features,
    data: messages,
    columns,
  })

  type ColumnSize = "xs-fixed" | "sm-fixed" | "md-fixed" | "lg-flex" | "fluid"

  const columnSize = (columnDef: Column<Message>) =>
    (columnDef.meta as { size?: ColumnSize } | undefined)?.size

  const mobileInSelectMode = Boolean(effectiveSelectMode && selection)
  const isListLoading = isLoading && messages.length === 0

  return (
    <section className={`gi-w-full ${styles.tableRoot}`}>
      {/*
       * Mobile select header for bulk actions and folder/select controls.
       */}
      {!isLoading && messages.length > 0 ? (
        <div
          className={`${styles.mobileSelectHeader} ${mobileInSelectMode ? styles.mobileSelectHeaderDark : ""}`}
        >
          {mobileInSelectMode && selection ? (
            <>
              <span className='gi-inline-flex gi-items-center gi-gap-3'>
                <InputCheckbox
                  {...selectionCheckboxProps({
                    allSelected: selection.allSelected,
                    someSelected: selection.someSelected,
                  })}
                  aria-label={t("ariaLabel.selectAll")}
                  data-testid='mobile-select-all-checkbox'
                  onChange={() => selection.toggleAll()}
                />
                <span className={styles.mobileSelectedCount} aria-live='polite'>
                  {tToolbar("selectedCount", {
                    count: selection.selectedCount,
                  })}
                </span>
              </span>
              <span className='gi-inline-flex gi-items-center gi-gap-2'>
                {canMove && onBulkMove ? (
                  <Button
                    data-testid='bulk-move-button-mobile'
                    variant='secondary'
                    appearance='light'
                    size='small'
                    disabled={selection.selectedCount === 0}
                    onClick={() => {
                      if (selection.selectedCount === 0) return
                      onBulkMove()
                    }}
                  >
                    {tMove("moveTo")}
                  </Button>
                ) : null}
                {deletedActions ? (
                  <>
                    <Button
                      data-testid='bulk-restore-button-mobile'
                      variant='secondary'
                      appearance='light'
                      size='small'
                      disabled={selection.selectedCount === 0}
                      onClick={deletedActions.onRestore}
                    >
                      {tToolbar("restore")}
                    </Button>
                    <Button
                      data-testid='bulk-erase-button-mobile'
                      variant='secondary'
                      appearance='light'
                      size='small'
                      disabled={selection.selectedCount === 0}
                      onClick={deletedActions.onErase}
                    >
                      {tToolbar("erase")}
                    </Button>
                  </>
                ) : (
                  <Button
                    data-testid='bulk-delete-button-mobile'
                    variant='secondary'
                    appearance='light'
                    size='small'
                    disabled={selection.selectedCount === 0}
                    onClick={() => {
                      if (selection.selectedCount === 0) return
                      onBulkDelete?.()
                    }}
                  >
                    {tToolbar("delete")}
                  </Button>
                )}
                <Button
                  data-testid='mobile-select-close'
                  variant='secondary'
                  appearance='light'
                  size='small'
                  className={styles.mobileCloseButton}
                  onClick={() => {
                    selection.clear()
                    onExitSelectMode?.()
                  }}
                >
                  {/*
                   * "Close ×" label: DS `Icon icon="close"` is served
                   * from DS's built-in SVG lookup (no Material Symbols
                   * font dependency), so the glyph renders reliably
                   * alongside the text. The inner span gives us the
                   * inline-flex gap between the label and the icon
                   * without leaking styling onto the Button itself.
                   */}
                  <span className='gi-inline-flex gi-items-center gi-gap-1'>
                    {t("close")}
                    <Icon icon='close' size='sm' />
                  </span>
                </Button>
              </span>
            </>
          ) : (
            <span className='gi-inline-flex gi-items-center gi-gap-2 gi-ms-auto'>
              {onOpenFolders ? (
                <Button
                  data-testid='mobile-folders-button'
                  variant='secondary'
                  appearance='default'
                  size='small'
                  onClick={onOpenFolders}
                >
                  {tFolders("panel.open")}
                </Button>
              ) : null}
              {onEnterSelectMode ? (
                <Button
                  data-testid='mobile-select-button'
                  variant='secondary'
                  appearance='default'
                  size='small'
                  onClick={onEnterSelectMode}
                >
                  {t("select")}
                </Button>
              ) : null}
            </span>
          )}
        </div>
      ) : null}

      {isListLoading || messages.length > 0 ? (
        <div
          className={styles.listBody}
          aria-busy={isListLoading || undefined}
          style={
            {
              "--inbox-list-page-size": pageSize,
            } as React.CSSProperties
          }
        >
          {isListLoading ? (
            <output className='gi-sr-only'>{t("loading")}</output>
          ) : null}
          <div className={styles.desktopTable}>
            <Table
              data-testid='unified-inbox-table'
              aria-label={t("aria.messageList")}
              layout='auto'
              rowSize='md'
              className={styles.listChromeTable}
            >
              <TableHead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHeader
                        key={header.id}
                        id={header.id}
                        size={columnSize(header.column.columnDef)}
                        align={
                          header.id === "attachment" ? "center" : undefined
                        }
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </TableHeader>
                    ))}
                  </TableRow>
                ))}
              </TableHead>
              <TableBody>
                {isListLoading
                  ? SKELETON_ROWS.map((key) => (
                      <TableRow
                        key={key}
                        data-testid='message-skeleton-row'
                        aria-hidden
                      >
                        {columns.map((column) => (
                          <TableData
                            key={column.id}
                            className={
                              column.id === "select"
                                ? styles.selectCell
                                : undefined
                            }
                          >
                            {column.id === "select" ? (
                              <SkeletonCheckbox />
                            ) : column.id && SKELETON_BAR_WIDTHS[column.id] ? (
                              <SkeletonBar
                                width={SKELETON_BAR_WIDTHS[column.id]}
                              />
                            ) : null}
                          </TableData>
                        ))}
                      </TableRow>
                    ))
                  : null}
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={`${styles.clickableRow} ${row.original.isSeen ? "" : styles.unreadRow} ${selection?.isSelected(row.original.id) ? styles.selectedRow : ""}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableData
                        key={cell.id}
                        className={
                          cell.column.id === "select"
                            ? styles.selectCell
                            : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableData>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              {totalPages > 1 && !isListLoading && (
                <DataTableFooter>
                  <DataTableFooterStart>
                    <div
                      className={`${styles.rowsPerPage} gi-flex gi-flex-nowrap gi-items-center gi-gap-2 gi-pr-2`}
                    >
                      <span className='gi-whitespace-nowrap'>
                        {t("rowsPerPage")}
                      </span>
                      <SelectNative
                        id='rows-per-page'
                        aria-label={t("rowsPerPage")}
                        className={styles.rowsPerPageSelect}
                        value={String(pageSize)}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          onPageSizeChange(Number(e.target.value))
                        }
                      >
                        <SelectItem value='10'>10</SelectItem>
                        <SelectItem value='20'>20</SelectItem>
                        <SelectItem value='50'>50</SelectItem>
                      </SelectNative>
                    </div>
                  </DataTableFooterStart>
                  <DataTableFooterEnd>
                    <InboxPagination totalPages={totalPages} variant='inline' />
                  </DataTableFooterEnd>
                </DataTableFooter>
              )}
            </Table>
          </div>

          <div className={styles.mobileList}>
            {isListLoading
              ? SKELETON_ROWS.map((key) => (
                  <SkeletonCard
                    key={key}
                    withCheckbox
                    testId='message-skeleton-card'
                  />
                ))
              : null}
            {messages.map((message) => (
              <MobileMessageRow
                key={message.id}
                message={message}
                onSelect={onSelect}
                selection={selection}
                selectMode={effectiveSelectMode}
              />
            ))}
          </div>
        </div>
      ) : (
        <ListNoResults
          title={t("noResults.title")}
          description={t("noResults.description")}
          clearLabel={t("noResults.clear")}
          clearHref={clearSearchHref(pathname, searchParams)}
        />
      )}

      {/*
       * Mobile replaces the old sticky pagination footer with infinite scroll
       * (this footer is mobile-only via CSS). Desktop pagination lives in the
       * table tfoot above and is unaffected.
       */}
      <InboxInfiniteScrollFooter
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
      />
    </section>
  )
}

function MobileMessageRow({
  message,
  onSelect,
  selection,
  selectMode,
}: {
  message: Message
  onSelect: (id: string) => void
  selection?: MessageSelection
  selectMode?: boolean
}) {
  const t = useTranslations("home.table")
  const shortDate = formatDate(message.createdAt, "short")

  const inSelectMode = Boolean(selectMode && selection)
  const isChecked = selection?.isSelected(message.id) ?? false

  const handleClick = () => {
    if (inSelectMode && selection) {
      selection.toggle(message.id)
      return
    }
    onSelect(message.id)
  }

  return (
    <ListCard
      title={<SenderName organisationId={message.organisationId} />}
      date={<time dateTime={message.createdAt}>{shortDate}</time>}
      preview={message.subject}
      hasAttachment={Boolean(message.attachmentsCount)}
      attachmentAriaLabel={
        message.attachmentsCount
          ? `${message.attachmentsCount} ${t("attachment", { count: message.attachmentsCount })}`
          : undefined
      }
      statusLabel={message.isSeen ? t("filter.read") : t("filter.unread")}
      isUnread={!message.isSeen}
      isSelected={inSelectMode && isChecked}
      showCheckbox={inSelectMode}
      isChecked={isChecked}
      onClick={handleClick}
      checkboxTestId={`mobile-select-indicator-${message.id}`}
    />
  )
}
