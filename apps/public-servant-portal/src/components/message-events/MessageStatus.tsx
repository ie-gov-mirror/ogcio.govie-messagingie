import { Tag } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"

// Where the tag renders: the list keeps one-word statuses, the timeline
// tells Inbox delivery and Email delivery apart.
export const MessageStatusContext = {
  LIST: "list",
  TIMELINE: "timeline",
} as const

export type MessageStatusContext =
  (typeof MessageStatusContext)[keyof typeof MessageStatusContext]

export const MessageStatus = ({
  type,
  status,
  context,
}: {
  type: string
  status: string
  context: MessageStatusContext
}) => {
  const t = useTranslations("event.status")

  // The timeline names the outcome, e.g. "Email sent" instead of "Delivered".
  const label = (listKey: string, timelineKey: string) => {
    if (context === MessageStatusContext.TIMELINE) {
      return t(timelineKey)
    }

    return t(listKey)
  }

  if (type === "message_delivery") {
    switch (status) {
      case "successful":
        return (
          <Tag type='success' text={label("delivered", "inboxDelivered")} />
        )

      case "failed":
        return <Tag type='error' text={t("deliveredFailed")} />

      case "pending":
        return <Tag type='warning' text={t("delivering")} />
    }
  }

  if (type === "message_schedule") {
    switch (status) {
      case "successful":
        return <Tag type='info' text={t("scheduled")} />
      case "failed":
        return <Tag type='error' text={t("failed")} />
      case "pending":
        return <Tag type='info' text={t("delivering")} />
    }
  }

  if (type === "message_create") {
    switch (status) {
      case "successful":
        return <Tag type='default' text={t("created")} />
    }
  }

  if (type === "email_delivery") {
    switch (status) {
      case "successful":
        return (
          <Tag type='success' text={label("delivered", "emailDelivered")} />
        )
      case "failed":
        return (
          <Tag type='error' text={label("deliveredFailed", "emailFailed")} />
        )
    }
  }

  if (type === "message_option_seen") {
    switch (status) {
      case "successful":
        return <Tag type='success' text={t("seen")} />
    }
  }

  if (type === "message_option_unseen") {
    switch (status) {
      case "successful":
        return <Tag type='success' text={t("unseen")} />
    }
  }

  return (
    <Tag type='default' text={`${type.replaceAll("_", " ")} (${status})`} />
  )
}
