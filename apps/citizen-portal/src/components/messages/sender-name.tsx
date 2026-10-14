"use client"

import { useGatewayFetch } from "@ogcio/sag-client/react"
import { useLocale, useTranslations } from "next-intl"
import { type Organisation, profileApi } from "@/api/profile"
import { Skeleton } from "@/components/skeleton/skeleton"
import { LANG_GA } from "@/const"
import { getSystemSenderTranslationKey } from "./system-senders"

export interface SenderNameProps {
  organisationId: string | null | undefined
  className?: string
}

/**
 * Resolves an `organisationId` returned by the messaging list endpoint
 * into a localized sender label.
 *
 * Two resolution paths:
 *
 *   1. **System senders** — messages the messaging-api generates itself
 *      (data-export-ready notifications, etc.) are stamped with a slug
 *      like `"support"` rather than a real organisation UUID. These slugs
 *      are recognised here via `getSystemSenderTranslationKey` and
 *      rendered as a localized brand string from
 *      `home.table.systemSender.<key>` *without* a profile-service call.
 *      Without this short-circuit, every render of a system message
 *      issues a 403 against `/profile/api/v1/organisations/{slug}` (the
 *      slug isn't a UUID, the profile API rejects it) and falls back to
 *      "Unknown sender" — see AB#37866.
 *
 *   2. **Real organisations** — `organisationId` is a UUID. The list
 *      endpoint never includes a human-readable sender (`threadName` is,
 *      by design, a grouping key that mirrors the message subject), so
 *      the Unified Inbox looks the name up against the profile service
 *      per row. Multiple rows that share an organisationId dedupe down
 *      to a single network request via SWR's cache (the URL is the
 *      cache key), so a page of N messages from M unique organisations
 *      issues exactly M requests, not N. While the lookup is in flight a
 *      `<Skeleton>` stands in — the "Unknown sender" fallback is reserved
 *      for a *settled* lookup that produced no name, so a slow page no
 *      longer flashes "Unknown sender" on every row before the real
 *      senders arrive. Either way the raw UUID never leaks into the UI.
 */
export function SenderName({ organisationId, className }: SenderNameProps) {
  const t = useTranslations("home.table")
  const locale = useLocale()
  const lang: "en" | "ga" = locale === LANG_GA ? "ga" : "en"

  const systemSenderKey = getSystemSenderTranslationKey(organisationId)

  /*
   * `useGatewayFetch(null)` is the documented opt-out — it never schedules
   * a request and yields `data: undefined`. We pass `null` for both
   * "no organisationId at all" and "this is a known system slug" so the
   * profile service never sees a doomed lookup.
   */
  const { data, isLoading } = useGatewayFetch<Organisation>(
    organisationId && !systemSenderKey
      ? profileApi.organisationKey(organisationId)
      : null,
  )

  if (isLoading) {
    return (
      <span className={className} aria-busy='true'>
        <Skeleton width='8rem' dataTestid='sender-name-skeleton' />
      </span>
    )
  }

  const name = systemSenderKey
    ? t(`systemSender.${systemSenderKey}`)
    : (data?.translations?.[lang]?.name ?? t("unknownSender"))

  return <span className={className}>{name}</span>
}
