"use client"

import { useCrossZoneLink } from "@citizen-portal/shared"
import {
  Alert,
  FormField,
  Heading,
  Paragraph,
} from "@ogcio/design-system-react"
import { useAuth, useGatewayFetch } from "@ogcio/sag-client/react"
import { useLocale, useTranslations } from "next-intl"
import { type ReactNode, useId } from "react"
import { type Organisation, profileApi } from "@/api/profile"
import { LeCard } from "@/components/le-card/le-card"
import { LeCardSkeleton } from "@/components/le-card/le-card-skeleton"
import { hasMaterialSymbol } from "@/components/load-material-symbols"
import { AppLink } from "@/components/navigation/app-link"
import { PublicName } from "@/components/public-name"
import { pickLocalized } from "@/components/submissions/localized"
import { JOURNEY_SUBMISSIONS_MIN_LIMIT } from "@/components/submissions/pagination-utils"
import { tagTypeForStatus } from "@/components/submissions/submission-status-tag"
import { useSubmissionsList } from "@/components/submissions/use-submissions"
import { LANG_GA } from "@/const"
import { ANALYTICS } from "@/const/analytics"
import { useIdleMount } from "@/hooks/use-idle-mount"
import { useMediaQuery } from "@/hooks/use-is-mobile"
import { useTrack } from "@/hooks/use-track"
import { useTrackView } from "@/hooks/use-track-view"
import type { DashboardLifeEvent } from "@/lib/discovery"
import type { Message, Submission } from "@/types"
import { formatDate } from "@/util/datetime"
import styles from "./le-dashboard.module.css"

const RECENT_DISPLAY_LIMIT = 3
/** Journey submissions carry no life-event category. */
const UNCATEGORISED_ICON = "article"
const TABLET_UP = "(min-width: 768px)"
const DESKTOP_UP = "(min-width: 1024px)"

type CardSize = "default" | "compact"

function latestMessageUrl(submissionId: string): string {
  const params = new URLSearchParams({ submissionId, limit: "1", offset: "0" })
  return `/messaging-public-api/api/v1/citizens/messages?${params.toString()}`
}

function Section({
  title,
  viewAll,
  children,
}: {
  title: string
  viewAll?: { href: string; label: string; onClick: () => void }
  children: ReactNode
}) {
  const t = useTranslations("dashboard.leCards")
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className='gi-flex gi-flex-col gi-gap-4'
    >
      <div className='gi-flex gi-flex-wrap gi-items-baseline gi-justify-between gi-gap-x-4 gi-gap-y-2'>
        <Heading as='h2' id={headingId} className={styles.sectionTitle}>
          {title}
        </Heading>
        {viewAll && (
          <AppLink
            href={viewAll.href}
            aria-label={viewAll.label}
            onClick={viewAll.onClick}
            className={styles.viewAll}
          >
            {t("viewAll")}
          </AppLink>
        )}
      </div>
      {children}
    </section>
  )
}

function ApplicationCard({
  submission,
  size,
  href,
  onOpen,
}: {
  submission: Submission
  size: CardSize
  href: string
  onOpen: () => void
}) {
  const t = useTranslations("dashboard.leCards.card")
  const tStatus = useTranslations("submissions.status")
  const locale = useLocale()
  const crossZone = useCrossZoneLink()
  const { data: organisation } = useGatewayFetch<Organisation>(
    profileApi.organisationKey(submission.organizationId),
  )
  const { data: messages, isLoading: messagesLoading } = useGatewayFetch<
    Message[]
  >(latestMessageUrl(submission.id))

  const title = pickLocalized(submission.title, locale)
  const latest = messages?.[0]
  const organisationName =
    organisation?.translations?.[locale === LANG_GA ? "ga" : "en"]?.name

  return (
    <LeCard
      type='application'
      size={size}
      title={title}
      titleHref={href}
      onTitleClick={onOpen}
      meta={organisationName ?? "\u00A0"}
      metaSecondary={t("lastUpdate", {
        date: formatDate(submission.updatedAt),
      })}
      header={{
        tag: {
          text: tStatus(submission.status),
          type: tagTypeForStatus(submission.status),
        },
        icon: UNCATEGORISED_ICON,
      }}
      footer={
        latest
          ? {
              kind: "link",
              label: t("latestMessage"),
              text: latest.subject,
              href: crossZone(
                "messages",
                `/${locale}/messages?${new URLSearchParams({
                  id: latest.id,
                  submissionId: submission.id,
                  submissionTitle: title,
                }).toString()}`,
              ),
              date: formatDate(latest.createdAt),
              unread: !latest.isSeen,
              newLabel: t("new"),
            }
          : {
              kind: "text",
              label: t("latestMessage"),
              text: messagesLoading ? "\u00A0" : t("noMessages"),
            }
      }
    />
  )
}

function RecentApplications({ size }: { size: CardSize }) {
  const t = useTranslations("dashboard.leCards.applications")
  const locale = useLocale()
  const { user, loading: authLoading } = useAuth()
  const idleReady = useIdleMount()
  const track = useTrack()

  const { submissions, totalCount, isLoading, error } = useSubmissionsList({
    search: null,
    page: 1,
    // Journey-Builder rejects limit=3 (min 5, multiple of 5).
    pageSize: JOURNEY_SUBMISSIONS_MIN_LIMIT,
    enabled: Boolean(user) && idleReady,
  })
  const recent = submissions.slice(0, RECENT_DISPLAY_LIMIT)
  const isWaiting =
    (authLoading || !user || !idleReady || isLoading) &&
    submissions.length === 0
  const listPath = `/${locale}/my-submissions`

  return (
    <Section
      title={t("title")}
      viewAll={
        totalCount > RECENT_DISPLAY_LIMIT
          ? {
              href: listPath,
              label: t("viewAll"),
              onClick: () =>
                track.event(ANALYTICS.application.dashboardViewAll),
            }
          : undefined
      }
    >
      {isWaiting ? (
        <>
          <output className='gi-sr-only'>{t("loading")}</output>
          <ul
            aria-busy='true'
            className={`${styles.grid} ${styles.applications}`}
          >
            {Array.from({ length: RECENT_DISPLAY_LIMIT }, (_, index) => (
              <li key={index}>
                <LeCardSkeleton size={size} />
              </li>
            ))}
          </ul>
        </>
      ) : recent.length ? (
        <ul className={`${styles.grid} ${styles.applications}`}>
          {recent.map((submission) => (
            <li key={submission.id}>
              <ApplicationCard
                submission={submission}
                size={size}
                href={`${listPath}?id=${submission.id}`}
                onOpen={() => track.event(ANALYTICS.application.dashboardOpen)}
              />
            </li>
          ))}
        </ul>
      ) : error == null ? (
        <Alert variant='info' title={t("emptyTitle")}>
          {t("emptyText")}
        </Alert>
      ) : null}
      {error != null && !isWaiting && (
        <FormField
          error={{
            text: t("error", {
              message: error instanceof Error ? error.message : "Unknown error",
            }),
          }}
        />
      )}
    </Section>
  )
}

/**
 * LE Card dashboard (AB#44320): life-event cards from build-time discovery
 * content, then the three most recent applications. Mobile uses compact
 * cards; life-event icons sit beside the title from 1024px, above it below.
 */
export function LeDashboard({
  lifeEvents,
}: {
  lifeEvents: DashboardLifeEvent[]
}) {
  const t = useTranslations("dashboard.leCards")
  const locale = useLocale()
  const tabletUp = useMediaQuery(TABLET_UP)
  const desktopUp = useMediaQuery(DESKTOP_UP)
  const size: CardSize = tabletUp ? "default" : "compact"
  const track = useTrack()
  useTrackView(ANALYTICS.lifeEvent.dashboardView)

  return (
    <div className={styles.landing}>
      <div className='gi-flex gi-flex-col gi-gap-2'>
        <Heading as='h1' className={styles.title}>
          {t.rich("welcome", { name: () => <PublicName /> })}
        </Heading>
        <Paragraph size='md' className='gi-m-0'>
          {t("intro")}
        </Paragraph>
      </div>

      <Section
        title={t("lifeEvents.title")}
        viewAll={{
          href: `/${locale}/discovery`,
          label: t("lifeEvents.viewAll"),
          onClick: () => track.event(ANALYTICS.lifeEvent.dashboardViewAll),
        }}
      >
        <ul className={`${styles.grid} ${styles.lifeEvents}`}>
          {lifeEvents.map((lifeEvent) => (
            <li key={lifeEvent.slug}>
              <LeCard
                type='lifeEvent'
                size={size}
                iconPosition={desktopUp ? "inline" : "above"}
                title={lifeEvent.title}
                titleHref={`/${locale}/discovery/${lifeEvent.slug}`}
                onTitleClick={() =>
                  track.event(ANALYTICS.lifeEvent.dashboardOpen)
                }
                category={lifeEvent.category}
                icon={
                  hasMaterialSymbol(lifeEvent.icon)
                    ? lifeEvent.icon
                    : UNCATEGORISED_ICON
                }
              />
            </li>
          ))}
        </ul>
      </Section>

      <RecentApplications size={size} />
    </div>
  )
}
