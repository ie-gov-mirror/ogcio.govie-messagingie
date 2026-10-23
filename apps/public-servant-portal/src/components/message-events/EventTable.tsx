"use client"

import { Link, toaster } from "@ogcio/design-system-react"
import { useGatewayFetch } from "@ogcio/sag-client/react"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { usePathname, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import PaginationWrapper from "@/components/PaginationWrapper"
import { TanStackTable } from "@/components/tables/TanStackTable"
import { PAGINATION_LIMIT_DEFAULT } from "@/const"
import { messagingApi, pagingMeta } from "@/util/api-paths"
import { formatDate } from "@/util/datetime"
import { isStatus } from "@/util/messaging"
import { url } from "@/util/url"
import { MessageStatus, MessageStatusContext } from "./MessageStatus"

type MessageEventRow = {
  eventStatus: string
  eventType: string
  messageId: string
  id: string
  scheduledAt?: string
  receiverFullName?: string
  subject?: string
}

export default function EventTable() {
  const t = useTranslations("event")
  const locale = useLocale()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const search = searchParams.get("search")?.toString() || undefined
  const dateFrom = searchParams.get("dateFrom")?.toString() || undefined
  const dateTo = searchParams.get("dateTo")?.toString() || undefined
  const page = Number(searchParams.get("page")) || 0
  const size = Number(searchParams.get("size")) || PAGINATION_LIMIT_DEFAULT
  const statusRaw = searchParams.get("status")?.toString()
  const status = isStatus(statusRaw) ? statusRaw : undefined

  const eventsPath = useMemo(
    () =>
      messagingApi.messageEvents({
        search,
        dateFrom,
        dateTo,
        page,
        size,
        status,
      }),
    [search, dateFrom, dateTo, page, size, status],
  )

  const {
    data: events,
    metadata,
    isLoading: isFetching,
    error,
  } = useGatewayFetch<MessageEventRow[], { totalCount?: number }>(eventsPath)

  const paging = pagingMeta(metadata?.totalCount ?? 0, page, size)
  const listParams = searchParams.toString()

  const columns = useMemo<ColumnDef<MessageEventRow>[]>(
    () => [
      {
        id: "scheduled",
        header: t("table.header.scheduled"),
        meta: { size: "sm-fixed" },
        accessorFn: (row) =>
          row.scheduledAt ? formatDate(row.scheduledAt) : "n/a",
      },
      {
        id: "status",
        header: t("table.header.status"),
        meta: {
          size: "sm-fixed",
          headerClassName: "sm-d-none",
          cellClassName: "sm-d-none",
        },
        cell: ({ row }) => (
          <MessageStatus
            type={row.original.eventType}
            status={row.original.eventStatus}
            context={MessageStatusContext.LIST}
          />
        ),
      },
      {
        id: "subject",
        header: t("table.header.subject"),
        meta: { size: "fluid" },
        accessorKey: "subject",
      },
      {
        id: "recipient",
        header: t("table.header.recipient"),
        meta: {
          size: "md-fixed",
          headerClassName: "sm-d-none",
          cellClassName: "sm-d-none",
        },
        accessorKey: "receiverFullName",
      },
      {
        id: "actions",
        header: t("table.header.actions"),
        meta: { size: "sm-fixed" },
        cell: ({ row }) => (
          <Link
            href={url(locale).messageEvents.detail(row.original.id, listParams)}
          >
            {t("link.view")}
          </Link>
        ),
      },
    ],
    [listParams, locale, t],
  )

  const table = useReactTable({
    data: events ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    if (!error) return
    toaster.create({
      title: t("toast.title.serverError"),
      action: { label: t("label.tryAgain"), href: pathname },
      dismissible: true,
      duration: 5000,
      position: { x: "right", y: "top" },
      variant: "danger",
    })
  }, [error, t, pathname])

  return (
    <>
      <TanStackTable
        table={table}
        layout='fixed'
        isLoading={isFetching}
        emptyMessage={t("table.empty")}
        aria-label={t("heading.mainEvents")}
      />
      {paging.totalPages > 1 && !isFetching && (
        <PaginationWrapper
          currentPage={paging.currentPage}
          totalPages={paging.totalPages}
          size={PAGINATION_LIMIT_DEFAULT}
        />
      )}
    </>
  )
}
