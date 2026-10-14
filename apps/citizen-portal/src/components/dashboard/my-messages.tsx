"use client"

import { useCrossZoneLink } from "@citizen-portal/shared"
import { FormField, Link, Paragraph } from "@ogcio/design-system-react"
import { SagFetchError } from "@ogcio/sag-client"
import { useAuth, useGatewayFetch } from "@ogcio/sag-client/react"
import { useLocale, useTranslations } from "next-intl"
import { messagesApi } from "@/api/messages"
import { ListCard } from "@/components/list-card/list-card"
import { SenderName } from "@/components/messages/sender-name"
import { PanelLoading } from "@/components/panel-loading"
import { useIdleMount } from "@/hooks/use-idle-mount"
import type { Message } from "@/types"
import { formatDate } from "@/util/datetime"
import { DashboardPanel } from "./dashboard-panel"
import panelStyles from "./dashboard-panel.module.css"

const RECENT_LIMIT = 3

/**
 * Recent-messages preview shown on the LEA dashboard landing, alongside the
 * recent-applications panel. Each row is the shared inbox `ListCard` (sender +
 * date header, subject preview) minus the bulk-selection checkbox; tapping a
 * card cross-navigates to the messages zone (a different hostname), so it uses
 * a hard navigation rather than the in-zone router.
 */
export function MyMessages() {
  const t = useTranslations("dashboard.messages")
  const tTable = useTranslations("home.table")
  const locale = useLocale()
  const { user, loading: authLoading } = useAuth()
  const crossZone = useCrossZoneLink()
  const idleReady = useIdleMount()

  const messagesPath =
    user && idleReady ? messagesApi.recentKey(RECENT_LIMIT) : null

  const {
    data: messages,
    error,
    isLoading,
  } = useGatewayFetch<Message[]>(messagesPath)

  const hasTransientAuthError =
    !messages?.length && error instanceof SagFetchError && error.status === 401

  const isWaitingForMessages =
    authLoading || !messagesPath || isLoading || hasTransientAuthError

  return (
    <DashboardPanel
      title={t("title")}
      cta={
        <Link href={crossZone("messages", `/${locale}/messages`)} asButton={{}}>
          {t("link")}
        </Link>
      }
    >
      {isWaitingForMessages ? (
        <div className={panelStyles.bodyInset}>
          <PanelLoading ariaLabel={t("view")} />
        </div>
      ) : messages?.length ? (
        messages.map((message) => (
          <ListCard
            key={message.id}
            title={<SenderName organisationId={message.organisationId} />}
            date={
              <time dateTime={message.createdAt}>
                {formatDate(message.createdAt, "medium")}
              </time>
            }
            preview={message.subject}
            previewUnderline={false}
            hasAttachment={Boolean(message.attachmentsCount)}
            attachmentAriaLabel={
              message.attachmentsCount
                ? `${message.attachmentsCount} ${tTable("attachment", { count: message.attachmentsCount })}`
                : undefined
            }
            statusLabel={
              message.isSeen ? tTable("filter.read") : tTable("filter.unread")
            }
            isUnread={!message.isSeen}
            onClick={() => {
              window.location.href = crossZone(
                "messages",
                `/${locale}/messages?id=${message.id}`,
              )
            }}
          />
        ))
      ) : (
        <Paragraph className={panelStyles.bodyInset}>{t("empty")}</Paragraph>
      )}
      {error != null &&
        !isWaitingForMessages &&
        !(error instanceof SagFetchError && error.status === 401) && (
          <div className={panelStyles.bodyInset}>
            <FormField
              error={{
                text: t("error", {
                  message:
                    error instanceof Error ? error.message : "Unknown error",
                }),
              }}
            />
          </div>
        )}
    </DashboardPanel>
  )
}
