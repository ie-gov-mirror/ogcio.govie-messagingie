"use client"

import {
  DataTableFooter,
  DataTableFooterEnd,
  DataTableFooterStart,
  Paragraph,
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
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { InboxPagination } from "@/components/messages/inbox-pagination"
import { MessagesLoading } from "@/components/messages/messages-loading"
import inboxTableStyles from "@/components/messages/unified-inbox-table.module.css"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import type { Submission } from "@/types"
import { formatDate } from "@/util/datetime"
import { pickLocalized } from "./localized"
import { SUBMISSIONS_PAGE_SIZE_OPTIONS } from "./pagination-utils"
import styles from "./submission-list-table.module.css"
import { SubmissionStatusTag } from "./submission-status-tag"

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
  const searchValue = searchParams.get("search") ?? ""
  const isListLoading = isLoading && submissions.length === 0

  const columns = useMemo<ColumnDef<Submission>[]>(
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

  const table = useReactTable({
    data: submissions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
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
      {isListLoading ? (
        <MessagesLoading />
      ) : submissions.length > 0 ? (
        <div
          className={inboxTableStyles.listBody}
          style={
            {
              "--inbox-list-page-size": pageSize,
            } as React.CSSProperties
          }
        >
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
              {totalPages > 0 && (
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
        <div className={inboxTableStyles.emptyState}>
          <Paragraph>
            {searchValue ? t("empty.search") : t("empty.all")}
          </Paragraph>
        </div>
      )}

      <InboxPagination totalPages={totalPages} />
    </section>
  )
}
