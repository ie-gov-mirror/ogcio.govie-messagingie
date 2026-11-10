"use client"

import {
  DataTableFooter,
  DataTableFooterEnd,
  DataTableFooterStart,
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
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import {
  clearSearchHref,
  ListNoResults,
  SKELETON_ROWS,
  SkeletonBar,
  SkeletonCard,
} from "@/components/list-states/list-states"
import { InboxPagination } from "@/components/messages/inbox-pagination"
import inboxTableStyles from "@/components/messages/unified-inbox-table.module.css"
import { type Column, features } from "@/components/tables/table-features"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import type { Submission } from "@/types"
import { formatDate } from "@/util/datetime"
import { pickLocalized } from "./localized"
import { SUBMISSIONS_PAGE_SIZE_OPTIONS } from "./pagination-utils"
import styles from "./submission-list-table.module.css"
import { SubmissionStatusTag } from "./submission-status-tag"

const SKELETON_BAR_WIDTHS: Record<string, string> = {
  title: "23.75rem",
  status: "6rem",
  date: "5rem",
  id: "8.75rem",
}

export interface SubmissionListTableProps {
  submissions: Submission[]
  isLoading: boolean
  totalPages: number
  pageSize: number
  onPageSizeChange: (size: number) => void
}

function SubmissionDate({
  submission,
  withLabel = false,
}: {
  submission: Submission
  /** Prefix plain dates with "Last update" (mobile, where there is no column header). */
  withLabel?: boolean
}) {
  const tTable = useTranslations("submissions.table")
  const date = formatDate(submission.updatedAt, "short")

  return (
    <time dateTime={submission.updatedAt} className={styles.lastUpdateDate}>
      {withLabel ? tTable("lastUpdate", { date }) : date}
    </time>
  )
}

export function SubmissionListTable({
  submissions,
  isLoading,
  totalPages,
  pageSize,
  onPageSizeChange,
}: SubmissionListTableProps) {
  const t = useTranslations("submissions")
  const tTable = useTranslations("submissions.table")
  const tInboxTable = useTranslations("home.table")
  const locale = useLocale()
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()
  const isListLoading = isLoading && submissions.length === 0

  const columns = useMemo<Column<Submission>[]>(
    () => [
      {
        id: "title",
        accessorFn: (row) => pickLocalized(row.title, locale),
        header: tTable("column.title"),
        cell: ({ row }) => (
          <Link
            href={`${pathname}?id=${row.original.id}`}
            scroll={false}
            prefetch={false}
            className={inboxTableStyles.rowLink}
          >
            <span className={styles.titleText}>
              {pickLocalized(row.original.title, locale)}
            </span>
          </Link>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: tTable("column.status"),
        cell: ({ row }) => <SubmissionStatusTag status={row.original.status} />,
      },
      {
        id: "date",
        accessorKey: "updatedAt",
        header: tTable("column.date"),
        cell: ({ row }) => <SubmissionDate submission={row.original} />,
      },
      {
        id: "id",
        accessorKey: "id",
        header: tTable("column.id"),
        cell: ({ getValue }) => (
          <span className={styles.idCell}>{getValue<string>()}</span>
        ),
      },
    ],
    [locale, pathname, tTable],
  )

  const table = useTable({
    features,
    data: submissions,
    columns,
  })

  const columnSize = (id: string) =>
    (
      ({
        title: "fluid",
        status: "md-fixed",
        date: "md-fixed",
        id: "md-fixed",
      }) as Record<
        string,
        "xs-fixed" | "sm-fixed" | "md-fixed" | "lg-flex" | "fluid"
      >
    )[id]

  return (
    <section className={`gi-w-full ${inboxTableStyles.tableRoot}`}>
      {isListLoading || submissions.length > 0 ? (
        <div
          className={inboxTableStyles.listBody}
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
          <div className={inboxTableStyles.desktopTable}>
            <Table
              data-testid='submissions-table'
              aria-label={tTable("aria.submissionList")}
              layout='auto'
              rowSize='md'
              className={inboxTableStyles.listChromeTable}
            >
              <TableHead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHeader key={header.id} size={columnSize(header.id)}>
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
                        data-testid='submission-skeleton-row'
                        aria-hidden
                      >
                        {columns.map((column) => (
                          <TableData key={column.id}>
                            <SkeletonBar
                              width={SKELETON_BAR_WIDTHS[column.id ?? ""]}
                            />
                          </TableData>
                        ))}
                      </TableRow>
                    ))
                  : null}
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={inboxTableStyles.clickableRow}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableData key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableData>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              {totalPages > 0 && !isListLoading && (
                <DataTableFooter>
                  <DataTableFooterStart>
                    <div
                      className={`${inboxTableStyles.rowsPerPage} gi-flex gi-flex-nowrap gi-items-center gi-gap-2 gi-pr-2`}
                    >
                      <span className='gi-whitespace-nowrap'>
                        {tInboxTable("rowsPerPage")}
                      </span>
                      <SelectNative
                        id='submissions-rows-per-page'
                        aria-label={tInboxTable("rowsPerPage")}
                        className={inboxTableStyles.rowsPerPageSelect}
                        value={String(pageSize)}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          onPageSizeChange(Number(e.target.value))
                        }
                      >
                        {SUBMISSIONS_PAGE_SIZE_OPTIONS.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size}
                          </SelectItem>
                        ))}
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

          <ul
            className={`${inboxTableStyles.mobileList} ${styles.mobileList}`}
            aria-label={tTable("aria.submissionList")}
          >
            {isListLoading
              ? SKELETON_ROWS.map((key) => (
                  <li key={key} aria-hidden>
                    <SkeletonCard
                      className={styles.skeletonCard}
                      testId='submission-skeleton-card'
                    />
                  </li>
                ))
              : null}
            {submissions.map((submission) => (
              <li key={submission.id} className={styles.mobileItem}>
                <div className={styles.mobileItemHeader}>
                  <span className={styles.idCell}>
                    {tTable("idLabel", { id: submission.id })}
                  </span>
                  <SubmissionStatusTag status={submission.status} />
                </div>
                <Link
                  href={`${pathname}?id=${submission.id}`}
                  scroll={false}
                  prefetch={false}
                  className={styles.mobileItemLink}
                >
                  {pickLocalized(submission.title, locale)}
                </Link>
                <SubmissionDate submission={submission} withLabel />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ListNoResults
          title={t("noResults.title")}
          description={t("noResults.description")}
          clearLabel={t("noResults.clear")}
          clearHref={clearSearchHref(pathname, searchParams)}
        />
      )}

      <InboxPagination totalPages={totalPages} />
    </section>
  )
}
