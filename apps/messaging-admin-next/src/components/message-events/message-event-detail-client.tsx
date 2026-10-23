"use client"

import { Heading, Paragraph, Spinner, Stack } from "@ogcio/design-system-react"
import { useGatewayFetch } from "@ogcio/sag-client/react"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { BackLink } from "@/components/BackButton"
import {
  MessageStatus,
  MessageStatusContext,
} from "@/components/message-events/MessageStatus"
import { TanStackTable } from "@/components/tables/TanStackTable"
import { messagingApi } from "@/util/api-paths"
import { defaultFormGap, formatDate, formatTime } from "@/util/datetime"
import {
  extractMessageMeta,
  extractScheduledAt,
  type MessageEventDetailItem,
} from "@/util/message-event-meta"
import { url } from "@/util/url"

export function MessageEventDetailClient() {
  const t = useTranslations("event")
  const locale = useLocale()
  const searchParams = useSearchParams()
  const eventId = searchParams.get("eventId") ?? ""
  const listSearch = searchParams.get("search")
    ? `search=${encodeURIComponent(searchParams.get("search") ?? "")}`
    : ""

  const { data: messageEvents, isLoading } = useGatewayFetch<
    MessageEventDetailItem[]
  >(eventId ? messagingApi.messageEvent(eventId) : null)

  const { recipient, subject } = useMemo(
    () => extractMessageMeta(messageEvents),
    [messageEvents],
  )

  const scheduledAt = useMemo(
    () => extractScheduledAt(messageEvents),
    [messageEvents],
  )

  const columns = useMemo<ColumnDef<MessageEventDetailItem>[]>(
    () => [
      {
        id: "status",
        header: t("table.header.status"),
        meta: { size: "fluid" },
        cell: ({ row }) => (
          <MessageStatus
            type={row.original.eventType}
            status={row.original.eventStatus}
            context={MessageStatusContext.TIMELINE}
          />
        ),
      },
      {
        id: "date",
        header: t("table.header.date"),
        meta: { size: "sm-fixed" },
        accessorFn: (row) =>
          formatDate(
            row.eventType === "message_schedule" && scheduledAt
              ? scheduledAt
              : row.createdAt,
          ),
      },
      {
        id: "time",
        header: t("table.header.time"),
        meta: { size: "sm-fixed" },
        accessorFn: (row) =>
          formatTime(
            row.eventType === "message_schedule" && scheduledAt
              ? scheduledAt
              : row.createdAt,
          ),
      },
    ],
    [t, scheduledAt],
  )

  const table = useReactTable({
    data: messageEvents ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (!eventId) {
    return null
  }

  if (isLoading) {
    return (
      <output
        aria-label='Loading'
        className='gi-flex gi-items-center gi-justify-center'
        style={{ minHeight: "12rem" }}
      >
        <Spinner size='xl' />
      </output>
    )
  }

  return (
    <Stack direction='column' gap={defaultFormGap}>
      <Heading>{t("heading.mainEvent")}</Heading>

      <div className='gi-hidden' aria-hidden='true'>
        <Stack direction='row' gap={3}>
          <Paragraph>
            <b>{t("label.recipient")}</b>:
          </Paragraph>
          <Paragraph>{recipient}</Paragraph>
        </Stack>
        <Stack direction='row' gap={3}>
          <Paragraph>
            <b>{t("label.subject")}</b>:
          </Paragraph>
          <Paragraph>{subject}</Paragraph>
        </Stack>
      </div>

      <TanStackTable
        table={table}
        emptyMessage={t("table.empty")}
        aria-label={t("heading.mainEvent")}
      />

      <BackLink
        href={
          url(locale).messageEvents.list + (listSearch ? `?${listSearch}` : "")
        }
      >
        {t("link.back")}
      </BackLink>
    </Stack>
  )
}
