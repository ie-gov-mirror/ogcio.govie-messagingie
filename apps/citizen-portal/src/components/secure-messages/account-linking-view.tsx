"use client"

import { Heading, Paragraph, Stack } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import type { Profile } from "@/api/profile"
import { ConfirmButton } from "./confirm-button"
import { DEFAULT_STACK_GAP } from "./const"
import { ProfileMatchInfo } from "./profile-match-info"
import { ReportButton } from "./report-button"

export function AccountLinkingView({
  currentProfile,
  linkedProfile,
  messageId,
}: {
  currentProfile: Profile
  linkedProfile: Profile
  messageId: string
}) {
  const t = useTranslations("accountLinking")

  return (
    <Stack direction='column' gap={DEFAULT_STACK_GAP}>
      <Heading as='h1'>{t("title")}</Heading>
      <Paragraph>{t("description")}</Paragraph>
      <ProfileMatchInfo
        currentEmail={currentProfile.email}
        matchedEmail={linkedProfile.email}
      />
      <Paragraph>
        {t.rich("footer", {
          bold: (chunks) => <b>{chunks}</b>,
          br: () => <br />,
        })}
      </Paragraph>
      <Stack direction='row' gap={DEFAULT_STACK_GAP} itemsAlignment='end'>
        <ReportButton />
        <ConfirmButton
          currentUserId={currentProfile.id}
          targetUserId={linkedProfile.id}
          messageId={messageId}
        />
      </Stack>
    </Stack>
  )
}
