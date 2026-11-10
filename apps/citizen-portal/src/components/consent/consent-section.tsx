"use client"

import {
  Alert,
  Heading,
  Link,
  Paragraph,
  Stack,
} from "@ogcio/design-system-react"
import { useLocale, useTranslations } from "next-intl"
import type { ConsentStatuses as ProfileConsentStatuses } from "@/api/profile"
import { ANALYTICS } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"

const ConsentStatuses = {
  OptedIn: "opted-in",
  PreApproved: "pre-approved",
  OptedOut: "opted-out",
  Pending: "pending",
  Undefined: "undefined",
} as const

export function ConsentSection({
  messagingUrl,
  consentStatuses,
  linkedProfilesCount = 0,
}: {
  messagingUrl: string
  consentStatuses?: ProfileConsentStatuses | null
  linkedProfilesCount?: number
}) {
  const t = useTranslations("consent")
  const locale = useLocale()
  const track = useTrack()

  const currentMessagingStatus = consentStatuses?.messaging?.status ?? null
  let translatedStatus = t("currentStatus.unset")
  switch (currentMessagingStatus) {
    case ConsentStatuses.OptedIn:
    case ConsentStatuses.PreApproved:
      translatedStatus = t("currentStatus.enabled")
      break
    case ConsentStatuses.OptedOut:
    case ConsentStatuses.Pending:
    case ConsentStatuses.Undefined:
    case undefined:
      translatedStatus = t("currentStatus.disabled")
      break
    default:
      break
  }

  const hasLinkedAccounts = linkedProfilesCount > 0

  return (
    <Stack gap={4}>
      <Heading as='h2' size='sm'>
        {t("title")}
      </Heading>
      <Paragraph>{t("description")}</Paragraph>
      <Paragraph>
        {t.rich("currentStatus.description", {
          status: translatedStatus,
          bold: (ch) => <strong>{ch}</strong>,
        })}
      </Paragraph>

      {hasLinkedAccounts && (
        <Alert title={t("linkedAccounts.title")} variant='info'>
          <Paragraph>
            {t.rich("linkedAccounts.notice", {
              count: linkedProfilesCount,
              bold: (ch) => <strong>{ch}</strong>,
            })}
          </Paragraph>
        </Alert>
      )}

      <Paragraph>{t("actions.update.title")}</Paragraph>
      <Link
        asButton={{ variant: "primary" }}
        href={`${messagingUrl}/${locale}/messages?force-consent=1`}
        onClick={() => track.event(ANALYTICS.profile.consentChange)}
      >
        {t("actions.update.action")}
      </Link>
    </Stack>
  )
}
