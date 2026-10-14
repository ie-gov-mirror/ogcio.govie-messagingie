"use client"

import { useCrossZoneLink } from "@citizen-portal/shared"
import { Heading, Paragraph } from "@ogcio/design-system-react"
import { useGatewayFetch } from "@ogcio/sag-client/react"
import { useLocale, useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { CssSpinner } from "@/components/css-spinner"
import { ListCard } from "@/components/list-card/list-card"
import { SenderName } from "@/components/messages/sender-name"
import { UnifiedInboxTable } from "@/components/messages/unified-inbox-table"
import type { Message } from "@/types"
import { formatDate } from "@/util/datetime"
import styles from "./submission-related-messages.module.css"

function buildRelatedMessagesUrl(submissionId: string): string {
  const params = new URLSearchParams({
    submissionId,
    limit: "50",
    offset: "0",
  })
  return `/messaging-public-api/api/v1/citizens/messages?${params.toString()}`
}

/**
 * Messages related to a submission, rendered in full (no pagination). Desktop
 * reuses the messages inbox data grid (`UnifiedInboxTable`) as a plain
 * read-only table; mobile keeps the same `ListCard` rows as the inbox mobile
 * list. Only one of the two renders at any viewport width (see the module CSS).
 */
export function SubmissionRelatedMessages({
  submissionId,
  submissionTitle,
}: {
  submissionId: string
  submissionTitle: string
}) {
  const t = useTranslations("submissions.detail.related")
  const tDetail = useTranslations("submissions.detail")
  const locale = useLocale()
  const crossZone = useCrossZoneLink()

  const apiUrl = useMemo(
    () => buildRelatedMessagesUrl(submissionId),
    [submissionId],
  )
  const { data, isLoading, error } = useGatewayFetch<Message[]>(apiUrl)
  const messages = data ?? []

  const detailHref = useCallback(
    (messageId: string) => {
      const params = new URLSearchParams({
        id: messageId,
        submissionId,
        submissionTitle,
      })
      return crossZone("messages", `/${locale}/messages?${params.toString()}`)
    },
    [crossZone, locale, submissionId, submissionTitle],
  )

  const open = useCallback(
    (messageId: string) => {
      window.location.assign(detailHref(messageId))
    },
    [detailHref],
  )

  return (
    <section
      className={styles.relatedSection}
      aria-labelledby='related-messages-heading'
    >
      <Heading
        as='h2'
        size='sm'
        className={styles.relatedHeading}
        id='related-messages-heading'
      >
        {t("title")}
      </Heading>
      {isLoading ? (
        <output aria-label={tDetail("loading")} className={styles.relatedEmpty}>
          <CssSpinner size='lg' />
        </output>
      ) : error ? (
        <Paragraph className={styles.relatedEmpty}>{error.message}</Paragraph>
      ) : messages.length ? (
        <>
          {/*
           * Desktop: reuse the messages inbox data grid (Sender / Details /
           * Attachment / Date). No `selection`, action handlers or
           * `totalCount` are passed, so it renders as a plain read-only
           * table with no checkboxes, row actions or pagination footer.
           * `buildDetailHref` swaps the inbox's same-route `?id=` link for
           * the cross-zone messages URL used here.
           */}
          <div className={styles.desktopGrid}>
            <UnifiedInboxTable
              messages={messages}
              isLoading={false}
              pageSize={messages.length}
              onPageSizeChange={() => {}}
              onSelect={open}
              buildDetailHref={detailHref}
            />
          </div>
          {/* Mobile: unchanged ListCard rows. */}
          <div className={styles.messageList}>
            {messages.map((message) => (
              <RelatedMessageRow
                key={message.id}
                message={message}
                onOpen={open}
              />
            ))}
          </div>
        </>
      ) : (
        <Paragraph className={styles.relatedEmpty}>{t("empty")}</Paragraph>
      )}
    </section>
  )
}

function RelatedMessageRow({
  message,
  onOpen,
}: {
  message: Message
  onOpen: (id: string) => void
}) {
  const tTable = useTranslations("home.table")
  const shortDate = formatDate(message.createdAt, "short")

  return (
    <ListCard
      className={styles.messageCard}
      title={<SenderName organisationId={message.organisationId} />}
      date={<time dateTime={message.createdAt}>{shortDate}</time>}
      preview={message.subject}
      hasAttachment={Boolean(message.attachmentsCount)}
      attachmentAriaLabel={
        message.attachmentsCount
          ? `${message.attachmentsCount} ${tTable("attachment", { count: message.attachmentsCount })}`
          : undefined
      }
      statusLabel={
        message.isSeen === false
          ? tTable("filter.unread")
          : tTable("filter.read")
      }
      isUnread={message.isSeen === false}
      onClick={() => onOpen(message.id)}
    />
  )
}
