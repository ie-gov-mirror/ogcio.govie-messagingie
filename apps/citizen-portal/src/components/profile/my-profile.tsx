"use client"

import { useEnv } from "@citizen-portal/shared"
import {
  Heading,
  Paragraph,
  Stack,
  SummaryList,
  SummaryListAction,
  SummaryListRow,
  SummaryListValue,
} from "@ogcio/design-system-react"
import { SagFetchError } from "@ogcio/sag-client"
import { useAuth, useGatewayFetch } from "@ogcio/sag-client/react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { type Profile, profileApi } from "@/api/profile"
import { ConsentSection } from "@/components/consent/consent-section"
import { useFeatureFlags } from "@/components/feature-flags-provider"
import { TwoColumnLayout } from "@/components/layout/containers"
import { LifecycleTasks } from "@/components/lifecycle-tasks/lifecycle-tasks"
import { PageLoading } from "@/components/page-loading"
import pageTitleStyles from "@/components/page-title.module.css"
import { PublicNameForm } from "@/components/profile/public-name-form"
import { useIdleMount } from "@/hooks/use-idle-mount"
import { stringToAsterisk } from "@/util/strings"

export function MyProfile() {
  const t = useTranslations("profile")
  const tErrors = useTranslations("errors")
  const [showPpsn, setShowPpsn] = useState(false)
  const { user, loading: authLoading } = useAuth()
  // Runtime gate for the "export my data" feature (`export-user` Unleash
  // flag). Defaults OFF so the export UI — and the request/download actions
  // it mounts — stay unavailable unless the flag is explicitly enabled.
  const { isUserExportEnabled } = useFeatureFlags()
  const locale = useLocale()
  // `ConsentSection` concatenates `${messagingUrl}/${locale}/messages?...`,
  // so we hand it the bare messages host (no trailing path). The shared
  // `useEnv().hosts.messages` reads the same env var every other zone
  // reads — keeping the value source-of-truth single across the portal.
  const { hosts } = useEnv()
  const messagingUrl = hosts.messages
  const idleReady = useIdleMount()

  const profilePath =
    user?.sub && idleReady
      ? profileApi.detailKey(user.sub, { consentSubjects: "messaging" })
      : null

  const {
    data: profile,
    error,
    isLoading,
    isValidating,
    refresh,
  } = useGatewayFetch<Profile>(profilePath)

  const isTransientAuthError =
    !profile &&
    error instanceof SagFetchError &&
    error.status === 401 &&
    (isLoading || isValidating)

  // Treat the pre-fetch window as loading too: useGatewayFetch reports
  // isLoading=false until it has a key (path), so without this guard the
  // initial render — when useAuth hasn't resolved user.sub yet — falls
  // through to the error branch and flashes the server-error message.
  // Cross-app navigation can also return 401 before SWR retries succeed.
  const isWaitingForProfile =
    authLoading || !profilePath || isLoading || isTransientAuthError

  if (isWaitingForProfile) {
    return (
      <TwoColumnLayout>
        <Stack direction='column' gap={8} data-testid='profile-page'>
          <Heading
            as='h1'
            className={pageTitleStyles.pageTitle}
            data-testid='profile-heading'
          >
            {t("title")}
          </Heading>
          <PageLoading minHeight='20vh' ariaLabel='Loading profile' size='lg' />
        </Stack>
      </TwoColumnLayout>
    )
  }

  if (error || !profile) {
    return <Paragraph>{tErrors("server")}</Paragraph>
  }

  const hasFirstOrLastName =
    profile.details?.firstName || profile.details?.lastName

  return (
    <TwoColumnLayout>
      <Stack direction='column' gap={8} data-testid='profile-page'>
        <Heading
          as='h1'
          className={pageTitleStyles.pageTitle}
          data-testid='profile-heading'
        >
          {t("title")}
        </Heading>

        <PublicNameForm
          publicName={profile.publicName}
          profileId={profile.primaryUserId}
          onUpdated={() => refresh()}
        />

        <Paragraph data-testid='profile-information'>
          {t("information")}
        </Paragraph>

        {hasFirstOrLastName && (
          <Heading as='h2' size='sm' data-testid='name-heading'>
            {t("name")}
          </Heading>
        )}
        {hasFirstOrLastName && (
          <SummaryList data-testid='name-summary-list'>
            {profile.details?.firstName && (
              <SummaryListRow
                withBorder
                label={t("firstName")}
                data-testid='first-name-row'
              >
                <SummaryListValue data-testid='first-name-value'>
                  {profile.details.firstName}
                </SummaryListValue>
              </SummaryListRow>
            )}
            {profile.details?.lastName && (
              <SummaryListRow
                withBorder
                label={t("lastName")}
                data-testid='last-name-row'
              >
                <SummaryListValue data-testid='last-name-value'>
                  {profile.details.lastName}
                </SummaryListValue>
              </SummaryListRow>
            )}
          </SummaryList>
        )}

        {profile.details?.ppsn && (
          <Heading as='h2' size='sm' data-testid='ppsn-heading'>
            PPSN
          </Heading>
        )}
        {profile.details?.ppsn && (
          <SummaryList data-testid='ppsn-summary-list'>
            <SummaryListRow withBorder label='PPSN' data-testid='ppsn-row'>
              <SummaryListValue data-testid='ppsn-value'>
                {showPpsn ? profile.details.ppsn : stringToAsterisk("ppsn")}
              </SummaryListValue>
              <SummaryListAction
                href='#'
                onClick={(e) => {
                  e.preventDefault()
                  setShowPpsn((prev) => !prev)
                }}
                data-testid={showPpsn ? "ppsn-hide-link" : "ppsn-reveal-link"}
              >
                {showPpsn ? t("clickToHide") : t("clickToReveal")}
              </SummaryListAction>
            </SummaryListRow>
          </SummaryList>
        )}

        {profile.email && (
          <Heading as='h2' size='sm' data-testid='contact-heading'>
            {t("contactDetails")}
          </Heading>
        )}
        {profile.email && (
          <SummaryList data-testid='contact-summary-list'>
            <SummaryListRow
              withBorder
              label={t("email")}
              data-testid='email-row'
            >
              <SummaryListValue data-testid='email-value'>
                {profile.email}
              </SummaryListValue>
            </SummaryListRow>
          </SummaryList>
        )}

        <ConsentSection
          messagingUrl={messagingUrl}
          consentStatuses={profile.consentStatuses}
        />

        {isUserExportEnabled && (
          <LifecycleTasks profileId={profile.id} locale={locale} />
        )}
      </Stack>
    </TwoColumnLayout>
  )
}
